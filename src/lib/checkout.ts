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

export const DELIVERY_NEIGHBORHOODS: ReadonlyArray<{
  name: string;
  zone: DeliveryZone;
}> = [
  { name: "Bela Vista", zone: "promorar_bela_vista" },
  { name: "Promorar", zone: "promorar_bela_vista" },
  { name: "Santa Helena", zone: "santa_helena" },
  { name: "Cidade Alta", zone: "cidade_alta" },
  { name: "Centro", zone: "centro_proximos" },
  { name: "Bates (Cohab)", zone: "centro_proximos" },
  { name: "Bom Jesus", zone: "centro_proximos" },
  { name: "Caça e Tiro", zone: "centro_proximos" },
  { name: "Centenário", zone: "centro_proximos" },
  { name: "Copacabana", zone: "centro_proximos" },
  { name: "Coral", zone: "centro_proximos" },
  { name: "Cruzeiro", zone: "centro_proximos" },
  { name: "Dom Daniel", zone: "centro_proximos" },
  { name: "Frei Rogério", zone: "centro_proximos" },
  { name: "Fundações", zone: "centro_proximos" },
  { name: "Gethal", zone: "centro_proximos" },
  { name: "Liceu", zone: "centro_proximos" },
  { name: "Morro do Posto", zone: "centro_proximos" },
  { name: "Morro Grande", zone: "centro_proximos" },
  { name: "Passo Fundo", zone: "centro_proximos" },
  { name: "Salaroli", zone: "centro_proximos" },
  { name: "São Cristóvão", zone: "centro_proximos" },
  { name: "Triângulo", zone: "centro_proximos" },
  { name: "Universitário", zone: "centro_proximos" },
  { name: "Vila Comboni", zone: "centro_proximos" },
  { name: "Vila Nova", zone: "centro_proximos" },
  { name: "Vila Riza", zone: "centro_proximos" },
  { name: "Ames", zone: "other" },
  { name: "Araucária", zone: "other" },
  { name: "Área Industrial", zone: "other" },
  { name: "Beatriz", zone: "other" },
  { name: "Boqueirão", zone: "other" },
  { name: "Brusque", zone: "other" },
  { name: "Caravágio", zone: "other" },
  { name: "Chapada", zone: "other" },
  { name: "Conta Dinheiro", zone: "other" },
  { name: "Cristo Rei", zone: "other" },
  { name: "Empreza", zone: "other" },
  { name: "Epitácio Pessoa", zone: "other" },
  { name: "Ferrovia", zone: "other" },
  { name: "Guadalupe", zone: "other" },
  { name: "Guarujá", zone: "other" },
  { name: "Habitação", zone: "other" },
  { name: "Ipiranga", zone: "other" },
  { name: "Madrugada", zone: "other" },
  { name: "Nossa Senhora Aparecida", zone: "other" },
  { name: "Penha", zone: "other" },
  { name: "Petrópolis", zone: "other" },
  { name: "Pisani", zone: "other" },
  { name: "Popular", zone: "other" },
  { name: "Restinga Seca", zone: "other" },
  { name: "Sagrado Coração de Jesus", zone: "other" },
  { name: "Santa Cândida", zone: "other" },
  { name: "Santa Catarina", zone: "other" },
  { name: "Santa Clara", zone: "other" },
  { name: "Santa Maria", zone: "other" },
  { name: "Santa Mônica", zone: "other" },
  { name: "Santo Antônio", zone: "other" },
  { name: "São Carlos", zone: "other" },
  { name: "São Francisco", zone: "other" },
  { name: "São Judas Tadeu", zone: "other" },
  { name: "São Miguel", zone: "other" },
  { name: "São Paulo", zone: "other" },
  { name: "São Pedro", zone: "other" },
  { name: "São Sebastião", zone: "other" },
  { name: "Serraria", zone: "other" },
  { name: "Vila Mariza", zone: "other" },
  { name: "Várzea", zone: "other" },
  { name: "Distrito de Índios", zone: "other" },
  { name: "Distrito de Santa Terezinha do Salto", zone: "other" },
];

export function normalizeNeighborhood(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

export function getDeliveryNeighborhood(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = normalizeNeighborhood(value);
  return DELIVERY_NEIGHBORHOODS.find(
    (neighborhood) => normalizeNeighborhood(neighborhood.name) === normalized,
  ) ?? null;
}

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
      return 1700;
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
