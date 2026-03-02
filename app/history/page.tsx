"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_BASE = typeof window !== "undefined" ? "" : process.env.NEXT_PUBLIC_API_URL || "";

interface VerificationSummary {
  verification_id: string;
  status: string;
  trust_score: number;
  decision: string;
  subject: { phone_number: string; country: string };
  created_at: string;
}

export default function HistoryPage() {
  const [list, setList] = useState<VerificationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchList() {
      try {
        const res = await fetch(`${API_BASE}/api/v1/verifications?limit=50`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load");
        if (!cancelled) setList(data.verifications || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchList();
    return () => { cancelled = true; };
  }, []);

  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <Link href="/" style={styles.logo}>TrustGate</Link>
        <nav style={styles.nav}>
          <Link href="/dashboard/">Dashboard</Link>
          <Link href="/history/">History</Link>
        </nav>
      </header>

      <div style={styles.content}>
        <h1 style={styles.h1}>Verification History</h1>
        <p style={styles.subtitle}>
          Last verifications performed.
        </p>

        {loading && <p style={styles.muted}>Loading…</p>}
        {error && <p style={styles.error}>{error}</p>}

        {!loading && !error && (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Phone</th>
                  <th style={styles.th}>Country</th>
                  <th style={styles.th}>Trust Score</th>
                  <th style={styles.th}>Decision</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Date</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={styles.empty}>No verifications yet</td>
                  </tr>
                ) : (
                  list.map((v) => (
                    <tr key={v.verification_id}>
                      <td style={styles.td}>{v.subject.phone_number}</td>
                      <td style={styles.td}>{v.subject.country}</td>
                      <td style={styles.td}>{v.trust_score ?? "—"}</td>
                      <td style={styles.td}>
                        <span style={{ color: v.decision === "allow" ? "var(--success)" : "var(--danger)" }}>
                          {v.decision}
                        </span>
                      </td>
                      <td style={styles.td}>{v.status}</td>
                      <td style={styles.td}>
                        {v.created_at ? new Date(v.created_at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
  content: { flex: 1, padding: "2rem", maxWidth: "1000px", margin: "0 auto", width: "100%" },
  h1: { marginBottom: "0.5rem", fontSize: "1.5rem" },
  subtitle: { color: "var(--muted)", marginBottom: "1.5rem", fontSize: "0.9rem" },
  tableWrap: { overflowX: "auto", border: "1px solid var(--border)", borderRadius: "12px" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    padding: "0.75rem 1rem",
    borderBottom: "1px solid var(--border)",
    background: "var(--surface)",
    fontSize: "0.875rem",
  },
  td: { padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)", fontSize: "0.875rem" },
  empty: { padding: "2rem", textAlign: "center", color: "var(--muted)" },
  muted: { color: "var(--muted)" },
  error: { color: "var(--danger)" },
};
