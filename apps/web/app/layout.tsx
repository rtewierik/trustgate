import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrustGate — Verificación de Identidad por Red Telecom",
  description: "El KYC del futuro. Verificación instantánea sin documentos.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
