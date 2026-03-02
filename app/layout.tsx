import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrustGate — Identity Verification by Red Telecom",
  description: "The KYC of the future. Instant verification without documents.",
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
