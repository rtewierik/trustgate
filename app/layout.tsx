import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrustGate — Identity Verification via Telecom Network",
  description: "The KYC of the future. Instant verification without documents.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
