import { NextResponse } from "next/server";
import {
  calculateCheckoutQuote,
  getDeliveryFeeCents,
  getAccessToken,
  parseJsonBody,
  type DeliveryZone,
} from "@/lib/checkout";
import {
  createOrGetOrder,
  orderItemsMatch,
  updateOrder,
} from "@/lib/supabase-admin";

type PaymentData = {
  payment_method_id?: unknown;
  token?: unknown;
  installments?: unknown;
  issuer_id?: unknown;
  payer?: unknown;
};

type CustomerDetails = {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
};

type DeliveryDetails = {
  street?: unknown;
  number?: unknown;
  neighborhood?: unknown;
  zone?: unknown;
};

const uuidV4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const deliveryZones = new Set<DeliveryZone>([
  "promorar_bela_vista",
  "santa_helena",
  "cidade_alta",
  "centro_proximos",
  "other",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function POST(request: Request) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json(
      { error: "O pagamento não está configurado no servidor." },
      { status: 503 },
    );
  }

  const paymentIdempotencyKey = request.headers.get("x-idempotency-key") || "";
  const orderIdempotencyKey = request.headers.get("x-order-idempotency-key") || "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(paymentIdempotencyKey) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderIdempotencyKey)
  ) {
    return NextResponse.json({ error: "Identificador do pagamento ou pedido inválido." }, { status: 400 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 24_576) {
    return NextResponse.json({ error: "Requisição muito grande." }, { status: 413 });
  }

  let body: Record<string, unknown> | null;
  try {
    body = parseJsonBody(await request.text());
  } catch {
    body = null;
  }
  if (!body) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const quote = calculateCheckoutQuote(body.items);
  const paymentData = body.paymentData as PaymentData | undefined;
  const method = typeof body.paymentMethod === "string" ? body.paymentMethod : "";
  const fulfillmentType = body.fulfillmentType;
  const customer = isRecord(body.customer) ? body.customer as CustomerDetails : null;
  const delivery = isRecord(body.delivery) ? body.delivery as DeliveryDetails : null;
  const orderReference =
    typeof body.orderReference === "string" ? body.orderReference : "";

  if (
    !quote ||
    !paymentData ||
    !isRecord(paymentData) ||
    (fulfillmentType !== "pickup" && fulfillmentType !== "delivery") ||
    !customer ||
    !uuidV4.test(orderReference)
  ) {
    return NextResponse.json({ error: "Carrinho ou pagamento inválido." }, { status: 400 });
  }

  const customerName =
    typeof customer.name === "string" ? customer.name.trim() : "";
  const customerPhone =
    typeof customer.phone === "string" ? customer.phone.replace(/\D/g, "") : "";
  if (
    customerName.length < 2 || customerName.length > 120 ||
    !/^\d{10,11}$/.test(customerPhone)
  ) {
    return NextResponse.json(
      { error: "Confira o nome e telefone do cliente." },
      { status: 400 },
    );
  }

  let deliveryStreet: string | null = null;
  let deliveryNumber: string | null = null;
  let deliveryNeighborhood: string | null = null;
  let deliveryZone: DeliveryZone | null = null;
  let deliveryFeeCents = 0;
  if (fulfillmentType === "delivery") {
    if (!delivery) {
      return NextResponse.json({ error: "Informe os dados de entrega." }, { status: 400 });
    }
    deliveryStreet = typeof delivery.street === "string" ? delivery.street.trim() : "";
    deliveryNumber = typeof delivery.number === "string" ? delivery.number.trim() : "";
    deliveryNeighborhood =
      typeof delivery.neighborhood === "string" ? delivery.neighborhood.trim() : "";
    if (
      typeof delivery.zone !== "string" ||
      !deliveryZones.has(delivery.zone as DeliveryZone) ||
      deliveryStreet.length < 2 || deliveryStreet.length > 160 ||
      deliveryNumber.length < 1 || deliveryNumber.length > 20 ||
      deliveryNeighborhood.length < 2 || deliveryNeighborhood.length > 100
    ) {
      return NextResponse.json(
        { error: "Confira rua, número, bairro e região de entrega." },
        { status: 400 },
      );
    }
    deliveryZone = delivery.zone as DeliveryZone;
    deliveryFeeCents = getDeliveryFeeCents(deliveryZone);
  }

  if (!/^[a-z0-9_]{2,40}$/i.test(method)) {
    return NextResponse.json({ error: "Forma de pagamento inválida." }, { status: 400 });
  }

  const payer = isRecord(paymentData.payer) ? paymentData.payer : null;
  const checkoutEmail =
    typeof customer.email === "string" ? customer.email.trim().toLowerCase() : "";
  const payerEmail =
    payer && typeof payer.email === "string" ? payer.email.trim().toLowerCase() : "";
  const email = checkoutEmail || payerEmail;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Informe um e-mail válido no formulário de pagamento." }, { status: 400 });
  }

  const token =
    typeof paymentData.token === "string" && paymentData.token.length <= 2048
      ? paymentData.token
      : "";
  if (method !== "pix" && !token) {
    return NextResponse.json({ error: "Os dados do cartão não foram validados." }, { status: 400 });
  }

  const installments = paymentData.installments;
  if (
    method !== "pix" &&
    (!Number.isInteger(installments) ||
      (installments as number) < 1 ||
      (installments as number) > 24)
  ) {
    return NextResponse.json({ error: "Número de parcelas inválido." }, { status: 400 });
  }

  const identification = isRecord(payer?.identification)
    ? payer.identification
    : null;
  const identificationNumber =
    identification && typeof identification.number === "string"
      ? identification.number.replace(/\D/g, "").slice(0, 20)
      : "";
  const identificationType =
    identification && typeof identification.type === "string"
      ? identification.type.replace(/[^A-Z]/gi, "").slice(0, 10)
      : "";

  const totalCents = quote.total + deliveryFeeCents;
  if (totalCents > 500_000) {
    return NextResponse.json({ error: "O total do pedido excede o limite permitido." }, { status: 400 });
  }
  const orderItems = [
    ...quote.items.map((item) => ({
      id: item.id,
      title: item.title,
      quantity: item.quantity,
      unit_price_cents: item.unitPrice,
      ...(item.flavor ? { flavor: item.flavor } : {}),
    })),
    ...(deliveryFeeCents > 0
      ? [{
          id: "delivery",
          title: "Taxa de entrega",
          quantity: 1,
          unit_price_cents: deliveryFeeCents,
        }]
      : []),
  ];
  let order;
  try {
    order = await createOrGetOrder({
      idempotencyKey: orderIdempotencyKey,
      externalReference: orderReference,
      fulfillmentType,
      customerName,
      customerPhone,
      deliveryStreet,
      deliveryNumber,
      deliveryNeighborhood,
      deliveryZone,
      deliveryFeeCents,
      customerEmail: email,
      items: orderItems,
      amountCents: totalCents,
      paymentMethodId: method,
      status: "creating",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível registrar o pedido antes do pagamento.",
      },
      { status: 503 },
    );
  }
  if (
    order.external_reference !== orderReference ||
    order.amount_cents !== totalCents ||
    (order.customer_email !== null && order.customer_email !== email) ||
    (order.payment_method_id !== null && order.payment_method_id !== method) ||
    order.fulfillment_type !== fulfillmentType ||
    order.customer_name !== customerName ||
    order.customer_phone !== customerPhone ||
    order.delivery_street !== deliveryStreet ||
    order.delivery_number !== deliveryNumber ||
    order.delivery_neighborhood !== deliveryNeighborhood ||
    order.delivery_zone !== deliveryZone ||
    order.delivery_fee_cents !== deliveryFeeCents ||
    !orderItemsMatch(order.items, orderItems)
  ) {
    return NextResponse.json(
      {
        error:
          "Esta tentativa já está vinculada a outro pedido. Atualize o checkout antes de tentar novamente.",
      },
      { status: 409 },
    );
  }
  try {
    await updateOrder(order.external_reference, {
      customer_email: email,
      payment_method_id: method,
      status: "creating",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível preparar o pedido para pagamento.",
      },
      { status: 503 },
    );
  }

  const paymentBody: Record<string, unknown> = {
    transaction_amount: totalCents / 100,
    description: `Pedido Jay Ey Conveniência (${quote.items.length} itens)`,
    payment_method_id: method,
    payer: {
      email,
      ...(identificationNumber && identificationType
        ? { identification: { type: identificationType, number: identificationNumber } }
        : {}),
    },
    external_reference: order.external_reference,
    additional_info: {
      items: orderItems.map((item) => ({
        id: item.id,
        title: item.title,
        quantity: item.quantity,
        unit_price: item.unit_price_cents / 100,
      })),
    },
  };

  if (token) paymentBody.token = token;
  if (method !== "pix") paymentBody.installments = installments;
  if (typeof paymentData.issuer_id === "number" || typeof paymentData.issuer_id === "string") {
    paymentBody.issuer_id = paymentData.issuer_id;
  }

  let response: Response;
  try {
    response = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": paymentIdempotencyKey,
      },
      body: JSON.stringify(paymentBody),
      cache: "no-store",
    });
  } catch {
    try {
      await updateOrder(order.external_reference, {
        status: "unknown",
        status_detail: "Não foi possível confirmar a resposta do Mercado Pago.",
      });
    } catch (error) {
      console.error("Could not update order after Mercado Pago connection failure", error);
    }
    return NextResponse.json(
      { error: "Não foi possível confirmar a resposta do Mercado Pago. Consulte o pedido antes de tentar novamente." },
      { status: 502 },
    );
  }

  const payment = parseJsonBody(await response.text());
  if (!response.ok || !payment) {
    const message =
      typeof payment?.message === "string"
        ? payment.message
        : "O Mercado Pago não conseguiu iniciar este pagamento.";
    const causes = Array.isArray(payment?.cause)
      ? payment.cause
          .map((cause) =>
            isRecord(cause) && typeof cause.description === "string"
              ? cause.description
              : "",
          )
          .filter(Boolean)
          .join("; ")
      : "";
    try {
      await updateOrder(order.external_reference, {
        status: "error",
        status_detail: `${message}${causes ? `: ${causes}` : ""}`.slice(0, 500),
      });
    } catch (error) {
      console.error("Could not save Mercado Pago rejection to order", error);
    }
    return NextResponse.json(
      {
        error: `${message}${causes ? `: ${causes}` : ""}`.slice(0, 400),
      },
      { status: 502 },
    );
  }

  const transactionDetails = isRecord(payment.transaction_details)
    ? payment.transaction_details
    : {};
  const pointOfInteraction = isRecord(payment.point_of_interaction)
    ? payment.point_of_interaction
    : {};
  const interactionTransactionData = isRecord(pointOfInteraction.transaction_data)
    ? pointOfInteraction.transaction_data
    : {};
  const paymentId =
    typeof payment.id === "number" || typeof payment.id === "string"
      ? String(payment.id)
      : "";
  if (!paymentId || typeof payment.status !== "string") {
    return NextResponse.json(
      { error: "O Mercado Pago retornou uma resposta de pagamento inválida." },
      { status: 502 },
    );
  }
  try {
    await updateOrder(order.external_reference, {
      payment_id: paymentId,
      payment_method_id:
        typeof payment.payment_method_id === "string"
          ? payment.payment_method_id
          : method,
      status: payment.status,
      status_detail:
        typeof payment.status_detail === "string" ? payment.status_detail : null,
    });
  } catch (error) {
    console.error("Could not persist Mercado Pago payment on order", error);
    return NextResponse.json(
      {
        error:
          "O Mercado Pago recebeu a solicitação, mas não foi possível salvar o status do pedido. Não envie outro pagamento; atualize o status ou contate a loja.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      id: paymentId,
      externalReference: payment.external_reference,
      status: payment.status,
      statusDetail: payment.status_detail,
      paymentMethodId: payment.payment_method_id,
      qrCode:
        typeof interactionTransactionData.qr_code === "string"
          ? interactionTransactionData.qr_code
          : typeof transactionDetails.qr_code === "string"
          ? transactionDetails.qr_code
          : null,
      qrCodeBase64:
        typeof interactionTransactionData.qr_code_base64 === "string"
          ? interactionTransactionData.qr_code_base64
          : typeof transactionDetails.qr_code_base64 === "string"
          ? transactionDetails.qr_code_base64
          : null,
      ticketUrl:
        typeof interactionTransactionData.ticket_url === "string"
          ? interactionTransactionData.ticket_url
          : typeof transactionDetails.ticket_url === "string"
          ? transactionDetails.ticket_url
          : null,
    },
    { status: 201 },
  );
}
