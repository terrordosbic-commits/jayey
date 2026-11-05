import { NextResponse } from "next/server";
import { getAccessToken, parseJsonBody } from "@/lib/checkout";
import { updateOrder } from "@/lib/supabase-admin";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function GET(request: Request) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return NextResponse.json(
      { error: "O pagamento não está configurado no servidor." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const paymentId = url.searchParams.get("id") || "";
  const externalReference = url.searchParams.get("reference") || "";
  if (!/^\d{1,30}$/.test(paymentId) || !/^[0-9a-f-]{36}$/i.test(externalReference)) {
    return NextResponse.json({ error: "Identificação do pagamento inválida." }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível consultar o Mercado Pago." },
      { status: 502 },
    );
  }

  const payment = parseJsonBody(await response.text());
  if (!response.ok || !payment) {
    return NextResponse.json(
      { error: "Não foi possível consultar o status deste pagamento." },
      { status: 502 },
    );
  }

  if (payment.external_reference !== externalReference) {
    return NextResponse.json({ error: "Pagamento não encontrado." }, { status: 404 });
  }

  try {
    await updateOrder(externalReference, {
      payment_id: paymentId,
      payment_method_id:
        typeof payment.payment_method_id === "string"
          ? payment.payment_method_id
          : undefined,
      status: typeof payment.status === "string" ? payment.status : "unknown",
      status_detail:
        typeof payment.status_detail === "string" ? payment.status_detail : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível salvar o status atualizado no banco.",
      },
      { status: 503 },
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

  return NextResponse.json({
    status: payment.status,
    statusDetail: payment.status_detail,
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
  });
}
