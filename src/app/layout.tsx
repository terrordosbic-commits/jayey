import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jay Ey Conveniência",
  description: "Essências e acessórios para narguilé na Jay Ey Conveniência.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
