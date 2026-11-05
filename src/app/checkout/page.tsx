import CheckoutClient from "@/components/checkout-client";
import styles from "./checkout.module.css";

export default function CheckoutPage() {
  return (
    <main className={styles.page}>
      <CheckoutClient publicKey={process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY || ""} />
    </main>
  );
}
