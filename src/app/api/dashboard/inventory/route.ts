import { NextResponse } from "next/server";
import { hasDashboardSession } from "@/lib/dashboard-auth";

type InventoryItem = {
  id: string;
  stock: number | null;
  flavors: string[];
  flavor_stock: Record<string, number>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const apiKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !apiKey) {
    throw new Error("Configure SUPABASE_URL e SUPABASE_SECRET_KEY no servidor.");
  }
  return { url, apiKey };
}

async function supabaseRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { url, apiKey } = getSupabaseConfig();
  const headers = new Headers(init?.headers);
  headers.set("apikey", apiKey);
  headers.set("Content-Type", "application/json");
  if (!apiKey.startsWith("sb_secret_")) {
    headers.set("Authorization", ["Bearer", apiKey].join(" "));
  }

  let response: Response;
  try {
    response = await fetch(url + "/rest/v1/" + path, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new Error("Não foi possível conectar ao banco de estoque do Supabase.");
  }

  const text = await response.text();
  let result: unknown = null;
  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("O banco de estoque retornou uma resposta inválida.");
  }
  if (!response.ok) {
    const code =
      isRecord(result) && typeof result.code === "string"
        ? result.code
        : "desconhecido";
    console.error("Supabase inventory request rejected", {
      status: response.status,
      code,
    });
    if (response.status === 404 || code === "42P01" || code === "PGRST205") {
      throw new Error(
        "A tabela de estoque não está pronta. Execute supabase-setup.sql no Supabase e tente novamente.",
      );
    }
    if (code === "42501") {
      throw new Error(
        "O Supabase ainda não permite salvar o estoque. Execute novamente supabase-setup.sql e tente outra vez.",
      );
    }
    throw new Error(
      "O Supabase recusou a alteração do estoque (HTTP " +
        response.status +
        ", código " +
        code +
        ").",
    );
  }
  return result as T;
}

function parseInventoryItems(value: unknown): InventoryItem[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    return null;
  }
  const seen = new Set<string>();
  const items: InventoryItem[] = [];
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== "string" ||
      !/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(candidate.id) ||
      seen.has(candidate.id) ||
      (candidate.stock !== null &&
        (typeof candidate.stock !== "number" ||
          !Number.isInteger(candidate.stock) ||
          candidate.stock < 0)) ||
      !Array.isArray(candidate.flavors) ||
      candidate.flavors.length > 50 ||
      !isRecord(candidate.flavorStock)
    ) {
      return null;
    }
    const flavors: string[] = [];
    for (const flavor of candidate.flavors) {
      if (typeof flavor !== "string" || !flavor.trim() || flavor.trim().length > 50) {
        return null;
      }
      const normalizedFlavor = flavor.trim();
      if (!flavors.includes(normalizedFlavor)) flavors.push(normalizedFlavor);
    }
    const flavorStock: Record<string, number> = {};
    for (const [flavor, quantity] of Object.entries(candidate.flavorStock)) {
      if (
        !flavors.includes(flavor) ||
        typeof quantity !== "number" ||
        !Number.isInteger(quantity) ||
        quantity < 0
      ) {
        return null;
      }
      flavorStock[flavor] = quantity;
    }
    if (
      flavors.some(
        (flavor) => !Object.prototype.hasOwnProperty.call(flavorStock, flavor),
      )
    ) {
      return null;
    }
    seen.add(candidate.id);
    items.push({
      id: candidate.id,
      stock: candidate.stock,
      flavors,
      flavor_stock: flavorStock,
    });
  }
  return items;
}

export async function GET(request: Request) {
  if (!hasDashboardSession(request)) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }

  try {
    const rows = await supabaseRequest<InventoryItem[]>(
      "inventory?select=id,stock,flavors,flavor_stock&order=id.asc",
    );
    if (!Array.isArray(rows)) {
      throw new Error("O banco retornou uma lista de estoque inválida.");
    }
    return NextResponse.json(
      { inventory: rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar o estoque compartilhado.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function PUT(request: Request) {
  if (!hasDashboardSession(request)) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 64 * 1024) {
    return NextResponse.json(
      { error: "A atualização do estoque é muito grande." },
      { status: 413 },
    );
  }
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 64 * 1024) {
    return NextResponse.json(
      { error: "A atualização do estoque é muito grande." },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  const items = isRecord(body) ? parseInventoryItems(body.items) : null;
  if (!items) {
    return NextResponse.json(
      { error: "Confira os dados de estoque e sabores." },
      { status: 400 },
    );
  }

  const query = new URLSearchParams({ on_conflict: "id" });
  try {
    const saved = await supabaseRequest<InventoryItem[]>(
      "inventory?" + query.toString(),
      {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(items),
      },
    );
    return NextResponse.json(
      { inventory: saved },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível salvar o estoque compartilhado.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
