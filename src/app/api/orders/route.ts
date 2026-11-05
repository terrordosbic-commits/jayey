import { NextResponse } from "next/server";
import {
  calculateCheckoutQuote,
  getDeliveryFeeCents,
  parseJsonBody,
  type DeliveryZone,
} from "@/lib/checkout";
import { createOrGetOrder, orderItemsMatch } from "@/lib/supabase-admin";

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
  const idempotencyKey = request.headers.get("x-idempotency-key") || "";
  if (!uuidV4.test(idempotencyKey)) {
    return NextResponse.json({ error: "Identificador do pedido inválido." }, { status: 400 });
  }
  if (Number(request.headers.get("content-length") || 0) > 16_384) {
    return NextResponse.json({ error: "Requisição muito grande." }, { status: 413 });
  }

  const body = parseJsonBody(await request.text());
  if (!body) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  const quote = calculateCheckoutQuote(body.items);
  const fulfillmentType = body.fulfillmentType;
  const customer = isRecord(body.customer) ? body.customer : null;
  if (
    !quote ||
    (fulfillmentType !== "pickup" && fulfillmentType !== "delivery") ||
    !customer
  ) {
    return NextResponse.json({ error: "Pedido ou forma de recebimento inválidos." }, { status: 400 });
  }

  const customerName = typeof customer.name === "string" ? customer.name.trim() : "";
  const customerPhone =
    typeof customer.phone === "string" ? customer.phone.replace(/\D/g, "") : "";
  if (
    customerName.length < 2 ||
    customerName.length > 120 ||
    !/^\d{10,11}$/.test(customerPhone)
  ) {
    return NextResponse.json({ error: "Informe nome e telefone válidos." }, { status: 400 });
  }

  let deliveryStreet: string | null = null;
  let deliveryNumber: string | null = null;
  let deliveryNeighborhood: string | null = null;
  let deliveryZone: DeliveryZone | null = null;
  let deliveryFeeCents = 0;
  if (fulfillmentType === "delivery") {
    const delivery = isRecord(body.delivery) ? body.delivery : null;
    if (!delivery) {
      return NextResponse.json({ error: "Informe o endereço de entrega." }, { status: 400 });
    }
    deliveryStreet =
      typeof delivery.street === "string" ? delivery.street.trim() : "";
    deliveryNumber =
      typeof delivery.number === "string" ? delivery.number.trim() : "";
    deliveryNeighborhood =
      typeof delivery.neighborhood === "string" ? delivery.neighborhood.trim() : "";
    const zone = delivery.zone;
    if (
      typeof zone !== "string" ||
      !deliveryZones.has(zone as DeliveryZone) ||
      deliveryStreet.length < 2 ||
      deliveryStreet.length > 160 ||
      deliveryNumber.length < 1 ||
      deliveryNumber.length > 20 ||
      deliveryNeighborhood.length < 2 ||
      deliveryNeighborhood.length > 100
    ) {
      return NextResponse.json(
        { error: "Confira rua, número, bairro e região de entrega." },
        { status: 400 },
      );
    }
    deliveryZone = zone as DeliveryZone;
    deliveryFeeCents = getDeliveryFeeCents(deliveryZone);
  }

  const amountCents = quote.total + deliveryFeeCents;
  if (amountCents > 500_000) {
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

  if (Number(JSON.stringify(orderItems).length) > 16_384) {
    return NextResponse.json({ error: "Itens do pedido excedem o limite permitido." }, { status: 413 });
  }

  let order;
  try {
    order = await createOrGetOrder({
      idempotencyKey,
      externalReference: crypto.randomUUID(),
      fulfillmentType,
      customerName,
      customerPhone,
      deliveryStreet,
      deliveryNumber,
      deliveryNeighborhood,
      deliveryZone,
      deliveryFeeCents,
      customerEmail: null,
      items: orderItems,
      amountCents,
      paymentMethodId: null,
      status: "awaiting_payment",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível registrar o pedido.",
      },
      { status: 503 },
    );
  }

  if (
    order.amount_cents !== amountCents ||
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
      { error: "Este pedido já foi registrado com outros dados. Recomece o checkout." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    orderReference: order.external_reference,
    fulfillmentType,
    deliveryFeeCents,
    amount: amountCents / 100,
  });
}
