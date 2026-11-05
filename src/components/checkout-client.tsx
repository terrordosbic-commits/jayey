"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import styles from "@/app/checkout/checkout.module.css";
import {
  DELIVERY_NEIGHBORHOODS,
  getDeliveryFeeCents,
  getDeliveryNeighborhood,
  normalizeNeighborhood,
  type DeliveryZone,
} from "@/lib/checkout";

type CartLine = { id: string; quantity: number; flavor?: string };
type QuoteItem = { id: string; title: string; quantity: number; unitPrice: number };
type Quote = { items: QuoteItem[]; total: number };
type DeliveryDetails = {
  name: string;
  phone: string;
  email: string;
  street: string;
  number: string;
  neighborhood: string;
  zone: DeliveryZone | "";
};
type CheckoutOrder = {
  orderReference: string;
  fulfillmentType: "pickup" | "delivery";
  deliveryFeeCents: number;
  amount: number;
};
type PaymentResult = {
  id: string;
  externalReference: string;
  status: string;
  statusDetail?: string;
  paymentMethodId?: string;
  qrCode?: string | null;
  qrCodeBase64?: string | null;
  ticketUrl?: string | null;
};
type PaymentFormData = {
  token?: unknown;
  payment_method_id?: unknown;
  installments?: unknown;
  issuer_id?: unknown;
  payer?: unknown;
};
type BrickFormData = {
  selectedPaymentMethod?: { id?: string } | string;
  formData: PaymentFormData;
};
type PaymentSettings = {
  initialization: { amount: number };
  customization: {
    paymentMethods: {
      creditCard: string;
      bankTransfer: string[];
    };
    visual: {
      style: {
        theme: "dark";
      };
    };
  };
  callbacks: {
    onReady: () => void;
    onSubmit: (data: BrickFormData) => Promise<PaymentResult>;
    onError: (error: unknown) => void;
  };
};
type PaymentBrickController = { unmount: () => void };
type MercadoPagoSdk = {
  bricks: () => {
    create: (
      type: "payment",
      containerId: string,
      settings: PaymentSettings,
    ) => Promise<PaymentBrickController>;
  };
};

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options: { locale: string }) => MercadoPagoSdk;
  }
}

const CART_STORAGE_KEY = "jayey.checkout.items.v1";
const STORE_PHONE = "49999726586";

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mergePaymentStatus(
  current: PaymentResult,
  result: Record<string, unknown>,
): PaymentResult {
  return {
    ...current,
    status: result.status as string,
    statusDetail:
      typeof result.statusDetail === "string"
        ? result.statusDetail
        : current.statusDetail,
    qrCode: typeof result.qrCode === "string" ? result.qrCode : current.qrCode,
    qrCodeBase64:
      typeof result.qrCodeBase64 === "string"
        ? result.qrCodeBase64
        : current.qrCodeBase64,
    ticketUrl:
      typeof result.ticketUrl === "string" ? result.ticketUrl : current.ticketUrl,
  };
}

function loadMercadoPagoSdk() {
  if (window.MercadoPago) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-mercadopago-sdk]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Não foi possível carregar o Mercado Pago.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.dataset.mercadopagoSdk = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Não foi possível carregar o Mercado Pago."));
    document.head.appendChild(script);
  });
}

export default function CheckoutClient({ publicKey }: { publicKey: string }) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [payment, setPayment] = useState<PaymentResult | null>(null);
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery" | null>(null);
  const [deliveryDetails, setDeliveryDetails] = useState<DeliveryDetails | null>(null);
  const [checkoutOrder, setCheckoutOrder] = useState<CheckoutOrder | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState<DeliveryDetails>({
    name: "",
    phone: "",
    email: "",
    street: "",
    number: "",
    neighborhood: "",
    zone: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [copyMessage, setCopyMessage] = useState("");
  const controllerRef = useRef<PaymentBrickController | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const paymentAttemptKeyRef = useRef<string | null>(null);
  const paymentSubmittingRef = useRef(false);

  useEffect(() => {
    let active = true;
    async function loadQuote() {
      let lines: CartLine[];
      try {
        const saved = localStorage.getItem(CART_STORAGE_KEY);
        lines = saved ? JSON.parse(saved) as CartLine[] : [];
      } catch {
        throw new Error("Não foi possível ler os itens do carrinho. Volte à loja e tente novamente.");
      }
      if (!lines.length) {
        throw new Error("Seu carrinho está vazio. Volte à loja e adicione produtos antes de pagar.");
      }

      const response = await fetch("/api/checkout/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: lines }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          result && typeof result === "object" && "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Não foi possível validar o carrinho.";
        throw new Error(message);
      }
      if (
        !result ||
        typeof result !== "object" ||
        !("items" in result) ||
        !Array.isArray(result.items) ||
        !("total" in result) ||
        typeof result.total !== "number"
      ) {
        throw new Error("O servidor retornou um orçamento inválido.");
      }
      return result as Quote;
    }

    void loadQuote()
      .then((result) => {
        if (active) setQuote(result);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Não foi possível validar o carrinho.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const submitPayment = useCallback(async (method: string, formData: PaymentFormData) => {
    if (paymentSubmittingRef.current) {
      throw new Error("Um pagamento já está sendo processado. Aguarde um momento.");
    }

    const currentOrder = checkoutOrder;
    const currentDetails = deliveryDetails;
    const orderIdempotencyKey = idempotencyKeyRef.current;
    if (!currentOrder || !currentDetails || !orderIdempotencyKey) {
      throw new Error("Não foi possível recuperar os dados do pedido. Reinicie o checkout.");
    }

    paymentSubmittingRef.current = true;
    setPaymentSubmitting(true);
    setError("");
    const paymentIdempotencyKey =
      paymentAttemptKeyRef.current || crypto.randomUUID();
    paymentAttemptKeyRef.current = paymentIdempotencyKey;

    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": paymentIdempotencyKey,
          "X-Order-Idempotency-Key": orderIdempotencyKey,
        },
        body: JSON.stringify({
          items: JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]"),
          paymentMethod: method,
          paymentData: formData,
          orderReference: currentOrder.orderReference,
          fulfillmentType: currentOrder.fulfillmentType,
          customer: {
            name: currentDetails.name,
            phone: currentDetails.phone,
            email: currentDetails.email,
          },
          delivery: currentOrder.fulfillmentType === "delivery"
            ? {
                street: currentDetails.street,
                number: currentDetails.number,
                neighborhood: currentDetails.neighborhood,
                zone: currentDetails.zone,
              }
            : null,
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          result && typeof result === "object" && "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Não foi possível iniciar o pagamento.";
        throw new Error(message);
      }
      if (
        !result ||
        typeof result !== "object" ||
        !("id" in result) ||
        typeof result.id !== "string" ||
        !("externalReference" in result) ||
        typeof result.externalReference !== "string" ||
        !("status" in result) ||
        typeof result.status !== "string"
      ) {
        throw new Error("O Mercado Pago retornou uma resposta inválida.");
      }
      setPayment(result as PaymentResult);
      return result as PaymentResult;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível enviar o pagamento. Confira sua conexão e tente novamente.",
      );
      throw cause;
    } finally {
      paymentSubmittingRef.current = false;
      setPaymentSubmitting(false);
    }
  }, [checkoutOrder, deliveryDetails]);

  useEffect(() => {
    if (!quote || !publicKey || !checkoutOrder || !deliveryDetails || payment) return;
    let active = true;
    const currentOrder = checkoutOrder;

    async function mountBrick() {
      try {
        await loadMercadoPagoSdk();
        if (!active || !window.MercadoPago) return;

        const mp = new window.MercadoPago(publicKey, { locale: "pt-BR" });
        controllerRef.current = await mp.bricks().create(
          "payment",
          "paymentBrick_container",
          {
            initialization: {
              amount: currentOrder.amount,
            },
            customization: {
              paymentMethods: {
                creditCard: "all",
                bankTransfer: [],
              },
              visual: {
                style: {
                  theme: "dark",
                },
              },
            },
            callbacks: {
              onReady: () => {
                if (active) setError("");
              },
              onSubmit: async ({ selectedPaymentMethod, formData }) => {
                const method =
                  (typeof formData.payment_method_id === "string" &&
                  formData.payment_method_id) ||
                  (typeof selectedPaymentMethod === "string"
                    ? selectedPaymentMethod
                    : selectedPaymentMethod?.id || "");
                return submitPayment(method, formData);
              },
              onError: (brickError) => {
                console.error("Mercado Pago Payment Brick error", brickError);
                if (active) {
                  setError((current) =>
                    current ||
                    "O formulário de pagamento encontrou um erro. Revise os dados ou tente novamente.",
                  );
                }
              },
            },
          },
        );
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Não foi possível iniciar o formulário de pagamento.");
        }
      }
    }

    void mountBrick();
    return () => {
      active = false;
      controllerRef.current?.unmount();
      controllerRef.current = null;
    };
  }, [checkoutOrder, deliveryDetails, payment, publicKey, quote, submitPayment]);

  async function submitPixPayment() {
    try {
      await submitPayment("pix", {
        payment_method_id: "pix",
        payer: { email: deliveryDetails?.email },
      });
    } catch (cause) {
      console.error("Could not create Pix payment", cause);
    }
  }

  useEffect(() => {
    if (!payment || payment.status === "approved" || payment.status === "rejected") return;
    let active = true;
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/payments/status?id=${encodeURIComponent(payment.id)}&reference=${encodeURIComponent(payment.externalReference)}`,
        );
        const result: unknown = await response.json();
        if (
          active &&
          response.ok &&
          isRecord(result) &&
          typeof result.status === "string"
        ) {
          setPayment((current) =>
            current ? mergePaymentStatus(current, result) : current,
          );
        }
      } catch {
        if (active) setError("Não foi possível atualizar o status agora.");
      }
    }, 10_000);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [payment]);

  async function copyPixCode() {
    if (!payment?.qrCode) return;
    try {
      await navigator.clipboard.writeText(payment.qrCode);
      setCopyMessage("Código Pix copiado.");
    } catch {
      setCopyMessage("Não foi possível copiar automaticamente. Selecione e copie o código acima.");
    }
  }

  async function refreshPaymentStatus() {
    if (!payment) return;
    setError("");
    try {
      const response = await fetch(
        `/api/payments/status?id=${encodeURIComponent(payment.id)}&reference=${encodeURIComponent(payment.externalReference)}`,
      );
      const result: unknown = await response.json();
      if (
        !response.ok ||
        !isRecord(result) ||
        typeof result.status !== "string"
      ) {
        throw new Error("Não foi possível consultar o status. Tente novamente.");
      }
      setPayment((current) =>
        current ? mergePaymentStatus(current, result) : current,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o status.");
    }
  }

  async function submitDeliveryDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fulfillment || savingOrder || checkoutOrder) return;
    const neighborhoodInfo = getDeliveryNeighborhood(deliveryForm.neighborhood);
    const details = {
      name: deliveryForm.name.trim(),
      phone: deliveryForm.phone.replace(/\D/g, ""),
      email: deliveryForm.email.trim().toLowerCase(),
      street: deliveryForm.street.trim(),
      number: deliveryForm.number.trim(),
      neighborhood: neighborhoodInfo?.name ?? deliveryForm.neighborhood.trim(),
      zone: neighborhoodInfo?.zone ?? deliveryForm.zone,
    };
    if (
      details.name.length < 2 ||
      details.phone.length < 10 ||
      details.phone.length > 11 ||
      details.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email) ||
      (fulfillment === "delivery" &&
        (details.street.length < 2 ||
          !details.number ||
          !neighborhoodInfo ||
          details.zone !== neighborhoodInfo.zone))
    ) {
      setError(
        fulfillment === "delivery"
          ? "Confira seu nome, e-mail, telefone e endereço para entrega."
          : "Confira seu nome, e-mail e telefone para retirada.",
      );
      return;
    }

    setError("");
    setSavingOrder(true);
    const idempotencyKey = idempotencyKeyRef.current || crypto.randomUUID();
    idempotencyKeyRef.current = idempotencyKey;
    try {
      const savedItems = localStorage.getItem(CART_STORAGE_KEY) || "[]";
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          items: JSON.parse(savedItems) as CartLine[],
          fulfillmentType: fulfillment,
          customer: {
            name: details.name,
            phone: details.phone,
            email: details.email,
          },
          delivery: fulfillment === "delivery"
            ? {
                street: details.street,
                number: details.number,
                neighborhood: details.neighborhood,
                zone: details.zone,
              }
            : null,
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          result && typeof result === "object" && "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Não foi possível registrar seu pedido.";
        throw new Error(message);
      }
      if (
        !result ||
        typeof result !== "object" ||
        !("orderReference" in result) ||
        typeof result.orderReference !== "string" ||
        !("fulfillmentType" in result) ||
        result.fulfillmentType !== fulfillment ||
        !("deliveryFeeCents" in result) ||
        typeof result.deliveryFeeCents !== "number" ||
        !("amount" in result) ||
        typeof result.amount !== "number"
      ) {
        throw new Error("O servidor retornou os dados do pedido em um formato inválido.");
      }
      setCheckoutOrder(result as CheckoutOrder);
      setDeliveryDetails(details);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível registrar o pedido. Verifique a conexão e tente novamente.",
      );
    } finally {
      setSavingOrder(false);
    }
  }

  function changeFulfillment() {
    if (checkoutOrder || payment) return;
    setFulfillment(null);
    setDeliveryDetails(null);
    setError("");
    idempotencyKeyRef.current = null;
    paymentAttemptKeyRef.current = null;
    setDeliveryForm({
      name: "",
      phone: "",
      email: "",
      street: "",
      number: "",
      neighborhood: "",
      zone: "",
    });
  }

  const statusText =
    payment?.status === "approved"
      ? fulfillment === "pickup"
        ? "Pagamento aprovado! Você já pode retirar seu pedido no local."
        : "Pagamento aprovado."
      : payment?.status === "rejected"
        ? "Pagamento recusado. Tente outro meio de pagamento ou volte à loja."
        : payment
          ? "Aguardando confirmação do Mercado Pago."
          : "";
  const selectedNeighborhood = getDeliveryNeighborhood(deliveryForm.neighborhood);
  const selectedZoneFee = selectedNeighborhood
    ? getDeliveryFeeCents(selectedNeighborhood.zone)
    : 0;
  const matchingNeighborhoods = deliveryForm.neighborhood.trim() && !selectedNeighborhood
    ? DELIVERY_NEIGHBORHOODS.filter((neighborhood) =>
        normalizeNeighborhood(neighborhood.name).includes(
          normalizeNeighborhood(deliveryForm.neighborhood),
        ),
      )
    : [];
  const deliveryTotal =
    checkoutOrder?.amount ??
    (quote ? quote.total + (fulfillment === "delivery" ? selectedZoneFee / 100 : 0) : 0);

  return (
    <section className={styles.checkout}>
      {payment?.status === "approved" ? (
        <div className={styles.smokeBurst} aria-hidden="true">
          <span className={styles.smokePuff} />
          <span className={`${styles.smokePuff} ${styles.smokePuffTwo}`} />
          <span className={`${styles.smokePuff} ${styles.smokePuffThree}`} />
          <span className={`${styles.smokePuff} ${styles.smokePuffFour}`} />
          <span className={`${styles.smokePuff} ${styles.smokePuffFive}`} />
          <span className={`${styles.smokePuff} ${styles.smokePuffSix}`} />
          <span className={`${styles.smokePuff} ${styles.smokePuffSeven}`} />
          <span className={`${styles.smokePuff} ${styles.smokePuffEight}`} />
        </div>
      ) : null}
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/" aria-label="Jay Ey Conveniência, voltar à loja">
          <span className={styles.brandMark} aria-hidden="true">JE</span>
          <span className={styles.brandText}>JAY EY<small>CONVENIÊNCIA</small></span>
        </Link>
        <div className={styles.secureNote}>
          <span className={styles.secureIcon} aria-hidden="true">✓</span>
          Retirada ou entrega
        </div>
      </header>

      <div className={styles.heading}>
        <span className={styles.eyebrow}>Sua compra está quase pronta</span>
        <h1>Finalize seu pedido</h1>
        <p>Escolha como quer receber: retirar no local ou informar um endereço para entrega.</p>
      </div>

      <div className={styles.layout}>
        <aside className={styles.summaryCard} aria-label="Resumo do pedido">
          <p className={styles.sectionLabel}><span aria-hidden="true">1</span> Seu pedido</p>
          <h2 className={styles.summaryTitle}>Resumo do pedido</h2>
          <p className={styles.summaryHint}>Confira os itens antes de pagar.</p>

          {quote ? (
            <>
              <ul className={styles.items}>
                {quote.items.map((item, index) => (
                  <li className={styles.item} key={`${item.id}-${index}`}>
                    <span>{item.quantity}× {item.title}</span>
                    <span>{money(item.unitPrice * item.quantity)}</span>
                  </li>
                ))}
                {fulfillment === "delivery" ? (
                  <li className={styles.item}>
                    <span>Entrega</span>
                    <span>{money((checkoutOrder?.deliveryFeeCents ?? selectedZoneFee) / 100)}</span>
                  </li>
                ) : null}
              </ul>
              <p className={styles.total}>
                <span>Total</span>
                <span>{money(deliveryTotal)}</span>
              </p>
            </>
          ) : loading ? (
            <p className={styles.muted}>Conferindo os itens e os preços…</p>
          ) : null}

          <div className={styles.summaryFooter}>
            <span aria-hidden="true">✓</span>
            {checkoutOrder
              ? "Pedido registrado no dashboard. Você pode concluir o pagamento."
              : "O pedido e o total são conferidos pelo servidor antes do pagamento."}
          </div>
          <Link className={styles.back} href="/">← Voltar à loja</Link>
        </aside>

        <div className={styles.paymentCard}>
          <p className={styles.sectionLabel}>
            <span aria-hidden="true">{checkoutOrder ? "3" : "2"}</span>
            {checkoutOrder ? "Pagamento" : "Recebimento"}
          </p>
          <div className={styles.paymentHeader}>
            <h2>
              {checkoutOrder
                ? "Agora conclua o pagamento"
                : fulfillment
                  ? fulfillment === "pickup"
                    ? "Seus dados para retirada"
                    : "Dados para entrega"
                  : "Como deseja receber?"}
            </h2>
            <p>
              {checkoutOrder
                ? "Seu pedido já foi enviado ao dashboard. Escolha Pix ou cartão abaixo."
                : fulfillment === "pickup"
                  ? "Informe nome, e-mail e telefone; depois o pedido será salvo e você seguirá para o pagamento."
                  : fulfillment === "delivery"
                    ?                     "Informe nome, e-mail, telefone e endereço; pesquise o bairro para calcular o frete. Depois, o pedido será salvo para o pagamento."
                    : "Escolha retirada no local ou entrega para continuar."}
            </p>
          </div>

          {error ? <p className={styles.alert} role="alert">{error}</p> : null}

          {!loading && !error && !publicKey && checkoutOrder ? (
            <p className={styles.alert} role="alert">
              Falta configurar NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY no ambiente do site.
            </p>
          ) : null}

          {quote && !fulfillment ? (
            <div className={styles.choiceGrid}>
              <button
                className={styles.choiceCard}
                type="button"
                onClick={() => {
                  setFulfillment("pickup");
                  setError("");
                }}
              >
                <span className={styles.choiceIcon} aria-hidden="true">⌂</span>
                <span><strong>Retirar no local</strong><small>Informe nome, e-mail e telefone; depois escolha o pagamento.</small></span>
                <span className={styles.choiceArrow} aria-hidden="true">→</span>
              </button>
              <button
                className={styles.choiceCard}
                type="button"
                onClick={() => {
                  setFulfillment("delivery");
                  setError("");
                }}
              >
                <span className={styles.choiceIcon} aria-hidden="true">➤</span>
                <span><strong>Receber por entrega</strong><small>Informe nome, e-mail, telefone e endereço.</small></span>
                <span className={styles.choiceArrow} aria-hidden="true">→</span>
              </button>
            </div>
          ) : null}

          {fulfillment && !checkoutOrder ? (
            <form className={styles.deliveryForm} onSubmit={submitDeliveryDetails}>
              <label>
                Nome completo
                <input
                  autoComplete="name"
                  disabled={savingOrder}
                  maxLength={120}
                  name="name"
                  onChange={(event) => {
                    idempotencyKeyRef.current = null;
                    setDeliveryForm({ ...deliveryForm, name: event.target.value });
                  }}
                  required
                  value={deliveryForm.name}
                />
              </label>
              <label>
                E-mail para o pagamento
                <input
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect="off"
                  disabled={savingOrder}
                  inputMode="email"
                  maxLength={254}
                  name="email"
                  onChange={(event) => {
                    idempotencyKeyRef.current = null;
                    setDeliveryForm({ ...deliveryForm, email: event.target.value });
                  }}
                  placeholder="voce@email.com"
                  required
                  spellCheck={false}
                  type="email"
                  value={deliveryForm.email}
                />
              </label>
              <label>
                Telefone para contato
                <input
                  autoComplete="tel"
                  disabled={savingOrder}
                  inputMode="tel"
                  maxLength={20}
                  name="phone"
                  onChange={(event) => {
                    idempotencyKeyRef.current = null;
                    setDeliveryForm({ ...deliveryForm, phone: event.target.value });
                  }}
                  placeholder="(49) 99999-9999"
                  required
                  type="tel"
                  value={deliveryForm.phone}
                />
              </label>
              {fulfillment === "delivery" ? (
                <>
                  <div className={styles.addressRow}>
                    <label>
                      Rua
                      <input
                        autoComplete="street-address"
                        disabled={savingOrder}
                        maxLength={160}
                        name="street"
                        onChange={(event) => {
                          idempotencyKeyRef.current = null;
                          setDeliveryForm({ ...deliveryForm, street: event.target.value });
                        }}
                        required
                        value={deliveryForm.street}
                      />
                    </label>
                    <label className={styles.numberField}>
                      Número
                      <input
                        disabled={savingOrder}
                        maxLength={20}
                        name="number"
                        onChange={(event) => {
                          idempotencyKeyRef.current = null;
                          setDeliveryForm({ ...deliveryForm, number: event.target.value });
                        }}
                        required
                        value={deliveryForm.number}
                      />
                    </label>
                  </div>
                  <label className={styles.neighborhoodField}>
                    Pesquise seu bairro
                    <input
                      aria-autocomplete="list"
                      aria-controls="delivery-neighborhood-options"
                      aria-expanded={matchingNeighborhoods.length > 0}
                      autoComplete="off"
                      disabled={savingOrder}
                      maxLength={100}
                      name="neighborhood"
                      onChange={(event) => {
                        const value = event.target.value;
                        const match = getDeliveryNeighborhood(value);
                        idempotencyKeyRef.current = null;
                        setDeliveryForm({
                          ...deliveryForm,
                          neighborhood: value,
                          zone: match?.zone ?? "",
                        });
                      }}
                      placeholder="Digite para buscar seu bairro"
                      required
                      role="combobox"
                      value={deliveryForm.neighborhood}
                    />
                    {matchingNeighborhoods.length > 0 ? (
                      <ul
                        className={styles.neighborhoodOptions}
                        id="delivery-neighborhood-options"
                        role="listbox"
                      >
                        {matchingNeighborhoods.map((neighborhood) => (
                          <li key={neighborhood.name}>
                            <button
                              aria-selected={false}
                              className={styles.neighborhoodOption}
                              onClick={() => {
                                idempotencyKeyRef.current = null;
                                setDeliveryForm({
                                  ...deliveryForm,
                                  neighborhood: neighborhood.name,
                                  zone: neighborhood.zone,
                                });
                              }}
                              onMouseDown={(event) => event.preventDefault()}
                              role="option"
                              type="button"
                            >
                              {neighborhood.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : deliveryForm.neighborhood.trim() && !selectedNeighborhood ? (
                      <span className={styles.neighborhoodHint}>
                        Nenhum bairro encontrado. Confira a digitação.
                      </span>
                    ) : null}
                    {selectedNeighborhood ? (
                      <span className={styles.neighborhoodHint}>
                        Frete para {selectedNeighborhood.name}: {money(selectedZoneFee / 100)}
                      </span>
                    ) : null}
                  </label>
                </>
              ) : null}
              <p className={styles.formNote}>
                {fulfillment === "delivery"
                  ? "O frete é calculado automaticamente pelo bairro selecionado."
                  : "Usaremos seu telefone para combinar a retirada."}
              </p>
              <button className={styles.button} type="submit" disabled={savingOrder}>
                {savingOrder ? "Registrando pedido…" : "Registrar pedido e ir ao pagamento"}
              </button>
            </form>
          ) : null}

          {checkoutOrder && deliveryDetails ? (
            <div className={styles.deliverySummary}>
              <div>
                <h3>{checkoutOrder.fulfillmentType === "pickup" ? "Retirada no local" : "Endereço de entrega"}</h3>
                <p>{deliveryDetails.name} · {deliveryDetails.phone}</p>
                {checkoutOrder.fulfillmentType === "delivery" ? (
                  <p>
                    {deliveryDetails.street}, {deliveryDetails.number} · {deliveryDetails.neighborhood}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {checkoutOrder && deliveryDetails && publicKey && !payment ? (
            <>
              <button
                className={styles.button}
                type="button"
                disabled={paymentSubmitting}
                onClick={submitPixPayment}
              >
                {paymentSubmitting ? "Gerando Pix…" : "Pagar com Pix"}
              </button>
              <p className={styles.muted}>
                Para pagar com cartão, use o formulário abaixo.
              </p>
              <div className={styles.paymentFrame}>
                <div id="paymentBrick_container" />
              </div>
            </>
          ) : null}

          {loading && !payment ? (
            <div className={styles.paymentFrame}>
              <p className={styles.muted}>Preparando as opções de pagamento…</p>
            </div>
          ) : null}

          {fulfillment && !checkoutOrder && !savingOrder ? (
            <button className={styles.textButton} type="button" onClick={changeFulfillment}>
              Alterar forma de recebimento
            </button>
          ) : null}

          {payment ? (
            <div className={styles.result} role="status" aria-live="polite">
              <h2>{statusText}</h2>
              {payment.status === "approved" && fulfillment === "pickup" ? (
                <div className={styles.pickupSuccess}>
                  <p>Seu pedido está pronto para retirada no local.</p>
                  <p>
                    Ficou com dúvidas?{" "}
                    <a href={`tel:+55${STORE_PHONE}`}>(49) 99972-6586</a>
                  </p>
                </div>
              ) : null}
              {payment.status === "pending" && payment.qrCodeBase64 ? (
                <Image
                  className={styles.qr}
                  src={`data:image/png;base64,${payment.qrCodeBase64}`}
                  alt="Código QR para pagamento Pix"
                  width={240}
                  height={240}
                  unoptimized
                />
              ) : null}
              {payment.status === "pending" && payment.qrCode ? (
                <>
                  <p>Use o código abaixo no aplicativo do seu banco:</p>
                  <textarea className={styles.code} readOnly value={payment.qrCode} aria-label="Código Pix" />
                  <button className={styles.button} type="button" onClick={copyPixCode}>
                    Copiar código Pix
                  </button>
                  {copyMessage ? <p className={styles.muted}>{copyMessage}</p> : null}
                </>
              ) : null}
              {payment.ticketUrl ? (
                <p>
                  <a className={styles.back} href={payment.ticketUrl} target="_blank" rel="noreferrer">
                    Abrir detalhes do pagamento
                  </a>
                </p>
              ) : null}
              {payment.status !== "approved" && payment.status !== "rejected" ? (
                <button className={styles.button} type="button" onClick={refreshPaymentStatus}>
                  Verificar pagamento
                </button>
              ) : null}
              {payment.status === "rejected" ? (
                <button
                  className={styles.button}
                  type="button"
                  onClick={() => {
                    paymentAttemptKeyRef.current = null;
                    setPayment(null);
                    setError("");
                  }}
                >
                  Tentar outro pagamento
                </button>
              ) : null}
            </div>
          ) : null}

          <p className={`${styles.muted} ${styles.finePrint}`}>
            {payment
              ? "Se o pagamento ficar pendente, aguarde a atualização do status antes de tentar novamente."
              : "O pedido é registrado no dashboard antes de abrir o pagamento."}
          </p>
        </div>
      </div>
    </section>
  );
}
