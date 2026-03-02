"use client";

import { useState } from "react";
import Link from "next/link";
import { VerificationResultCard, type VerificationResultCardData } from "@/components/VerificationResultCard";

const API_BASE = typeof window !== "undefined" ? "" : process.env.NEXT_PUBLIC_API_URL || "";

interface VerificationResult extends VerificationResultCardData {
  verification_id: string;
  status: string;
  subject: { phone_number: string; country: string };
  created_at: string;
  expires_at: string;
}

export default function HistoryPage() {
  const [queryBy, setQueryBy] = useState<"id" | "state">("id");
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setVerification(null);
    if (!value.trim()) return;
    setLoading(true);
    try {
      const url =
        queryBy === "id"
          ? `${API_BASE}/api/v1/completed-verifications/${encodeURIComponent(value.trim())}`
          : `${API_BASE}/api/v1/completed-verifications?state=${encodeURIComponent(value.trim())}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "Not found");
      setVerification(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <Link href="/" style={styles.logo}>TrustGate</Link>
        <nav style={styles.nav}>
          <Link href="/dashboard/">Dashboard</Link>
          <Link href="/history/">Historial</Link>
        </nav>
      </header>

      <div style={styles.content}>
        <h1 style={styles.h1}>Consultar verificación</h1>
        <p style={styles.subtitle}>
          Obtén una verificación completada por <em>verification_id</em> o por <em>state</em> (verification_request_id).
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.row}>
            <label style={styles.label}>Buscar por</label>
            <select
              value={queryBy}
              onChange={(e) => setQueryBy(e.target.value as "id" | "state")}
              style={styles.input}
            >
              <option value="id">verification_id</option>
              <option value="state">state (verification_request_id)</option>
            </select>
          </div>
          <div style={styles.row}>
            <label style={styles.label}>{queryBy === "id" ? "Verification ID" : "State"}</label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={queryBy === "id" ? "ver_xxx" : "nv_xxx"}
              style={styles.input}
            />
          </div>
          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "Buscando…" : "Buscar"}
          </button>
        </form>

        {error && <div style={styles.error}>{error}</div>}

        {verification && (
          <div style={{ marginTop: "2rem" }}>
            <VerificationResultCard
              verification={verification}
              showSubject={true}
              showCreatedAt={true}
            />
          </div>
        )}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { minHeight: "100vh", display: "flex", flexDirection: "column" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "1rem 2rem",
    borderBottom: "1px solid var(--border)",
  },
  logo: { fontSize: "1.25rem", fontWeight: 700, color: "var(--accent)" },
  nav: { display: "flex", gap: "1.5rem" },
  content: { flex: 1, padding: "2rem", maxWidth: "560px", margin: "0 auto", width: "100%" },
  h1: { marginBottom: "0.5rem", fontSize: "1.5rem" },
  subtitle: { color: "var(--muted)", marginBottom: "1.5rem", fontSize: "0.9rem" },
  form: { display: "flex", flexDirection: "column", gap: "1rem" },
  row: { display: "flex", flexDirection: "column", gap: "0.25rem" },
  label: { fontSize: "0.875rem", color: "var(--muted)" },
  input: {
    padding: "0.5rem 0.75rem",
    borderRadius: "8px",
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
  },
  button: {
    marginTop: "0.5rem",
    padding: "0.75rem 1.5rem",
    background: "var(--accent)",
    color: "var(--bg)",
    border: "none",
    borderRadius: "8px",
    fontWeight: 600,
  },
  error: {
    marginTop: "1rem",
    padding: "1rem",
    background: "rgba(255,71,87,0.15)",
    border: "1px solid var(--danger)",
    borderRadius: "8px",
    color: "var(--danger)",
  },
  result: {
    marginTop: "2rem",
    padding: "1.5rem",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
  },
  resultTitle: { marginBottom: "0.5rem" },
  trustScore: { marginBottom: "0.25rem" },
  status: { marginBottom: "0.5rem", fontSize: "0.9rem" },
  checks: { listStyle: "none", fontSize: "0.875rem", color: "var(--muted)" },
  muted: { marginTop: "0.25rem", fontSize: "0.875rem", color: "var(--muted)" },
};
