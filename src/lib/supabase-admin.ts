import "server-only";

type OrderRecord = {
  id: string;
  idempotency_key: string;
  external_reference: string;
  payment_id: string | null;
  fulfillment_type: "pickup" | "delivery";
  customer_name: string | null;
  customer_phone: string | null;
  delivery_street: string | null;
  delivery_number: string | null;
  delivery_neighborhood: string | null;
  delivery_zone: string | null;
  delivery_fee_cents: number;
  customer_email: string | null;
  items: Array<{
    id: string;
    title: string;
    quantity: number;
    unit_price_cents: number;
    flavor?: string;
  }>;
  amount_cents: number;
  payment_method_id: string | null;
  status: string;
  status_detail: string | null;
  created_at: string;
  updated_at: string;
};

type CreateOrderInput = {
  idempotencyKey: string;
  externalReference: string;
  fulfillmentType: "pickup" | "delivery";
  customerName: string;
  customerPhone: string;
  deliveryStreet: string | null;
  deliveryNumber: string | null;
  deliveryNeighborhood: string | null;
  deliveryZone: string | null;
  deliveryFeeCents: number;
  customerEmail: string | null;
  items: OrderRecord["items"];
  amountCents: number;
  paymentMethodId: string | null;
  status?: string;
};

type OrderUpdate = Partial<
  Pick<
    OrderRecord,
    | "payment_id"
    | "payment_method_id"
    | "customer_email"
    | "status"
    | "status_detail"
  >
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const apiKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !apiKey) {
    throw new Error(
      "Configure SUPABASE_URL e SUPABASE_SECRET_KEY no ambiente do servidor.",
    );
  }
  return {
    url,
    apiKey,
    isLegacyServiceRoleKey: !apiKey.startsWith("sb_secret_"),
  };
}

async function supabaseRequest<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const { url, apiKey, isLegacyServiceRoleKey } = getSupabaseConfig();
  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: apiKey,
        ...(isLegacyServiceRoleKey
          ? { Authorization: `Bearer ${apiKey}` }
          : {}),
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    });
  } catch {
    throw new Error("Não foi possível conectar ao banco de pedidos do Supabase.");
  }

  const text = await response.text();
  let result: unknown = null;
  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("O banco de pedidos retornou uma resposta inválida.");
  }

  if (!response.ok) {
    const errorCode =
      isRecord(result) && typeof result.code === "string"
        ? result.code
        : "desconhecido";
    console.error("Supabase order request rejected", {
      status: response.status,
      code: errorCode,
    });

    if (errorCode === "23502") {
      throw new Error(
        "O banco ainda exige um campo que não é enviado antes do pagamento. Execute novamente supabase-orders.sql no Supabase.",
      );
    }
    if (errorCode === "PGRST204" || errorCode === "42703") {
      throw new Error(
        "A tabela de pedidos está desatualizada. Execute novamente supabase-orders.sql no Supabase e tente outra vez.",
      );
    }
    throw new Error(
      `O Supabase recusou o pedido (HTTP ${response.status}, código ${errorCode}). Confira se supabase-orders.sql foi executado e tente novamente.`,
    );
  }
  return result as T;
}

export async function createOrGetOrder(input: CreateOrderInput) {
  const query = new URLSearchParams({ on_conflict: "idempotency_key" });
  const inserted = await supabaseRequest<OrderRecord[]>(
    `orders?${query.toString()}`,
    {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({
        idempotency_key: input.idempotencyKey,
        external_reference: input.externalReference,
        fulfillment_type: input.fulfillmentType,
        customer_name: input.customerName,
        customer_phone: input.customerPhone,
        delivery_street: input.deliveryStreet,
        delivery_number: input.deliveryNumber,
        delivery_neighborhood: input.deliveryNeighborhood,
        delivery_zone: input.deliveryZone,
        delivery_fee_cents: input.deliveryFeeCents,
        customer_email: input.customerEmail,
        items: input.items,
        amount_cents: input.amountCents,
        payment_method_id: input.paymentMethodId,
        status: input.status || "creating",
      }),
    },
  );
  if (inserted[0]) return inserted[0];

  const existingQuery = new URLSearchParams({
    select: "id,idempotency_key,external_reference,payment_id,fulfillment_type,customer_name,customer_phone,delivery_street,delivery_number,delivery_neighborhood,delivery_zone,delivery_fee_cents,customer_email,items,amount_cents,payment_method_id,status,status_detail",
    idempotency_key: `eq.${input.idempotencyKey}`,
    limit: "1",
  });
  const existing = await supabaseRequest<OrderRecord[]>(
    `orders?${existingQuery.toString()}`,
    { method: "GET" },
  );
  if (!existing[0]) {
    throw new Error("Não foi possível recuperar o pedido existente para esta tentativa.");
  }
  return existing[0];
}

export function orderItemsMatch(
  actual: unknown,
  expected: OrderRecord["items"],
) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  return expected.every((expectedItem, index) => {
    const actualItem: unknown = actual[index];
    if (!isRecord(actualItem)) return false;
    return (
      actualItem.id === expectedItem.id &&
      actualItem.title === expectedItem.title &&
      actualItem.quantity === expectedItem.quantity &&
      actualItem.unit_price_cents === expectedItem.unit_price_cents &&
      actualItem.flavor === expectedItem.flavor
    );
  });
}

export async function listRecentOrders() {
  const query = new URLSearchParams({
    select: "id,external_reference,payment_id,fulfillment_type,customer_name,customer_phone,delivery_street,delivery_number,delivery_neighborhood,delivery_zone,delivery_fee_cents,customer_email,items,amount_cents,payment_method_id,status,status_detail,created_at,updated_at",
    order: "created_at.desc",
    limit: "100",
  });
  return supabaseRequest<OrderRecord[]>(`orders?${query.toString()}`, { method: "GET" });
}

export async function updateOrder(
  externalReference: string,
  update: OrderUpdate,
) {
  const query = new URLSearchParams({
    external_reference: `eq.${externalReference}`,
    select: "id",
  });
  const updated = await supabaseRequest<Array<{ id: string }>>(
    `orders?${query.toString()}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...update, updated_at: new Date().toISOString() }),
    },
  );
  if (!updated.length) {
    throw new Error("O pedido não foi encontrado no banco para atualizar o pagamento.");
  }
}
