import { NextResponse } from "next/server";
import { hasDashboardSession } from "@/lib/dashboard-auth";
import {
  createManualSale,
  listApprovedSales,
  listManualSales,
} from "@/lib/supabase-admin";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function GET(request: Request) {
  if (!hasDashboardSession(request)) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }

  try {
    const [approvedResult, manualResult] = await Promise.allSettled([
      listApprovedSales(),
      listManualSales(),
    ]);
    const warnings: string[] = [];
    const approved =
      approvedResult.status === "fulfilled" ? approvedResult.value : [];
    const manual =
      manualResult.status === "fulfilled" ? manualResult.value : [];
    if (approvedResult.status === "rejected") {
      warnings.push("Não foi possível consultar os pagamentos online aprovados.");
      console.error("Could not load approved sales", approvedResult.reason);
    }
    if (manualResult.status === "rejected") {
      warnings.push(
        "Não foi possível consultar vendas manuais. Execute supabase-setup.sql no Supabase.",
      );
      console.error("Could not load manual sales", manualResult.reason);
    }
    if (approvedResult.status === "rejected" && manualResult.status === "rejected") {
      throw new Error("Não foi possível consultar as vendas no Supabase. Confira a configuração do banco.");
    }
    const sales = [
      ...approved.map((sale) => ({
        id: `online-${sale.id}`,
        amountCents: sale.amount_cents,
        occurredAt: sale.created_at,
        source: "online" as const,
        note: "",
      })),
      ...manual.map((sale) => ({
        id: `manual-${sale.id}`,
        amountCents: sale.amount_cents,
        occurredAt: sale.occurred_at,
        source: "manual" as const,
        note: sale.note,
      })),
    ].sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() -
        new Date(left.occurredAt).getTime(),
    );

    return NextResponse.json(
      { sales, warnings },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar as vendas.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request) {
  if (!hasDashboardSession(request)) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4 * 1024) {
    return NextResponse.json(
      { error: "Os dados da venda são muito grandes." },
      { status: 413 },
    );
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 4 * 1024) {
    return NextResponse.json(
      { error: "Os dados da venda são muito grandes." },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  if (
    !isRecord(body) ||
    typeof body.amountCents !== "number" ||
    !Number.isInteger(body.amountCents) ||
    body.amountCents < 1 ||
    body.amountCents > 100_000_000 ||
    typeof body.occurredAt !== "string" ||
    !Number.isFinite(Date.parse(body.occurredAt)) ||
    Date.parse(body.occurredAt) > Date.now() + 5 * 60 * 1000 ||
    typeof body.note !== "string" ||
    body.note.length > 200
  ) {
    return NextResponse.json(
      { error: "Confira o valor, a data e a descrição da venda." },
      { status: 400 },
    );
  }

  try {
    const inserted = await createManualSale({
      amountCents: body.amountCents,
      note: body.note.trim(),
      occurredAt: new Date(body.occurredAt).toISOString(),
    });
    if (!inserted.length) {
      throw new Error("O banco não confirmou o registro da venda.");
    }
    return NextResponse.json(
      { sale: inserted[0] },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível registrar a venda.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
