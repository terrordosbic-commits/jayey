export type CheckoutLine = {
  id: string;
  quantity: number;
  flavor?: string;
};

const products = {
  zomo: { name: "Essência Zomo", unitPrice: 1200, category: "essencias" },
  ziggy: { name: "Essência Ziggy", unitPrice: 1100, category: "essencias" },
  nay: { name: "Essência Nay", unitPrice: 1100, category: "essencias" },
  bass: { name: "Carvão de coco Bass", unitPrice: 150, category: "carvao" },
  alu: { name: "Alumínio de alta qualidade", unitPrice: 100, category: "aluminio" },
} as const;

export type CheckoutQuoteItem = {
  id: keyof typeof products;
  title: string;
  quantity: number;
  unitPrice: number;
  flavor?: string;
};

export type CheckoutQuote = {
  items: CheckoutQuoteItem[];
  total: number;
};

export type FulfillmentType = "pickup" | "delivery";
export type DeliveryZone =
  | "promorar_bela_vista"
  | "santa_helena"
  | "cidade_alta"
  | "centro_proximos"
  | "other";

const MAX_QUANTITY_PER_LINE = 100;
const MAX_TOTAL_CENTS = 500_000;

export function getDeliveryFeeCents(zone: DeliveryZone): number {
  switch (zone) {
    case "promorar_bela_vista":
      return 0;
    case "santa_helena":
      return 700;
    case "cidade_alta":
      return 800;
    case "centro_proximos":
      return 1000;
    case "other":
      return 1600;
  }
}

export function calculateCheckoutQuote(value: unknown): CheckoutQuote | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    return null;
  }

  const items: CheckoutQuoteItem[] = [];
  let total = 0;

  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") return null;
    const line = candidate as Record<string, unknown>;

    if (
      typeof line.id !== "string" ||
      !Object.hasOwn(products, line.id) ||
      !Number.isInteger(line.quantity) ||
      (line.quantity as number) < 1 ||
      (line.quantity as number) > MAX_QUANTITY_PER_LINE
    ) {
      return null;
    }

    const id = line.id as keyof typeof products;
    const product = products[id];
    let flavor: string | undefined;

    if (product.category === "essencias") {
      if (
        typeof line.flavor !== "string" ||
        line.flavor.trim().length === 0 ||
        line.flavor.length > 80
      ) {
        return null;
      }
      flavor = line.flavor.trim();
    } else if (line.flavor !== undefined && line.flavor !== "") {
      return null;
    }

    const quantity = line.quantity as number;
    const title = flavor ? `${product.name} — ${flavor}` : product.name;
    items.push({ id, title, quantity, unitPrice: product.unitPrice, flavor });
    total += product.unitPrice * quantity;

    if (total > MAX_TOTAL_CENTS) return null;
  }

  return { items, total };
}

export function getAccessToken(): string | null {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  return token || null;
}

export function parseJsonBody(
  body: string,
): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}
