import { NextResponse } from "next/server";
import { calculateCheckoutQuote } from "@/lib/checkout";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 16_384) {
    return NextResponse.json({ error: "Carrinho muito grande." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const lines =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).items
      : null;
  const quote = calculateCheckoutQuote(lines);
  if (!quote) {
    return NextResponse.json(
      { error: "Os itens ou quantidades do carrinho são inválidos." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    items: quote.items.map((item) => ({
      id: item.id,
      title: item.title,
      quantity: item.quantity,
      unitPrice: item.unitPrice / 100,
    })),
    total: quote.total / 100,
  });
}
