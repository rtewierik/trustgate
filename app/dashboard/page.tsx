"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const API_BASE =
  typeof window !== "undefined" ? "" : process.env.NEXT_PUBLIC_API_URL || "";

interface VerificationResult {
  verification_id: string;
  status: string;
  trust_score: number;
  decision: string;
  checks: Array<{
    name: string;
    status: string;
    detail?: Record<string, unknown>;
  }>;
  expires_at: string;
}

interface InitiateResult {
  authorization_url: string;
  verification_request_id: string;
  message: string;
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("ES");
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [dob, setDob] = useState("");
  const [loading, setLoading] = useState(false);
  const [initiateResult, setInitiateResult] = useState<InitiateResult | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const state = searchParams.get("state");
    if (!state) return;
    setInitiateResult(null);
    setLoading(true);
    fetch(`${API_BASE}/api/v1/completed-verifications?state=${encodeURIComponent(state)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setResult(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setInitiateResult(null);
    setLoading(true);
    try {
      const redirectUri =
        typeof window !== "undefined"
          ? `${window.location.origin}/dashboard`
          : `${process.env.NEXT_PUBLIC_API_URL || ""}/dashboard`;
      const res = await fetch(`${API_BASE}/api/v1/verifications/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: { phone_number: phone, country },
          redirect_uri: redirectUri,
          claims: {
            given_name: givenName || undefined,
            family_name: familyName || undefined,
            date_of_birth: dob || undefined,
          },
          checks: ["number_verification", "sim_swap", "kyc_match"],
          policy: { min_trust_score: 75, sim_swap_max_age_hours: 72 },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "Inicio de verificación fallido");
      setInitiateResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <Link href="/" style={styles.logo}>
          TrustGate
        </Link>
        <nav style={styles.nav}>
          <Link href="/dashboard/">Dashboard</Link>
          <Link href="/history/">History</Link>
        </nav>
      </header>

      <div style={styles.content}>
        <h1 style={styles.h1}>Identity Verification</h1>
        <p style={styles.subtitle}>
          Enter the number and user details. Verification uses Number
          Verification, SIM Swap and KYC Matching.{" "}
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.row}>
            <label style={styles.label}>Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+34XXXXXXXXX"
              required
              style={styles.input}
            />
          </div>
          <div style={styles.row}>
            <label style={styles.label}>Country</label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              style={styles.input}
            >
              <option value="ES">ES</option>
              <option value="DE">DE</option>
              <option value="FR">FR</option>
              <option value="GB">GB</option>
            </select>
          </div>
          <div style={styles.row}>
            <label style={styles.label}>Name</label>
            <input
              type="text"
              value={givenName}
              onChange={(e) => setGivenName(e.target.value)}
              placeholder="Ada"
              style={styles.input}
            />
          </div>
          <div style={styles.row}>
            <label style={styles.label}>Last Name</label>
            <input
              type="text"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="Lovelace"
              style={styles.input}
            />
          </div>
          <div style={styles.row}>
            <label style={styles.label}>Date of Birth</label>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              style={styles.input}
            />
          </div>
          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "Verifying…" : "Verify"}
          </button>
        </form>

        {error && <div style={styles.error}>{error}</div>}

        {initiateResult && (
          <div style={styles.result}>
            <h2 style={styles.resultTitle}>Siguiente paso: verificación en red</h2>
            <p style={{ marginBottom: "1rem", color: "var(--muted)" }}>
              Redirige al usuario al operador para completar la verificación. Luego volverá a esta página con el resultado.
            </p>
            <a
              href={initiateResult.authorization_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...styles.button, display: "inline-block", textDecoration: "none", textAlign: "center" }}
            >
              Abrir enlace de verificación
            </a>
            <p style={styles.muted}>Request ID: {initiateResult.verification_request_id}</p>
          </div>
        )}

        {result && (
          <div style={styles.result}>
            <h2
              style={{
                ...styles.resultTitle,
                color:
                  result.decision === "allow"
                    ? "var(--success)"
                    : "var(--danger)",
              }}
            >
              {result.decision === "allow" ? "✓ Aprobado" : "✗ Denegado"}
            </h2>
            <p style={styles.trustScore}>
              Trust Score: <strong>{result.trust_score}/100</strong>
            </p>
            <p style={styles.status}>Estado: {result.status}</p>
            <ul style={styles.checks}>
              {result.checks?.map((c) => (
                <li key={c.name}>
                  {c.name}:{" "}
                  <span
                    style={{
                      color:
                        c.status === "pass"
                          ? "var(--success)"
                          : "var(--danger)",
                    }}
                  >
                    {c.status}
                  </span>
                  {c.detail && ` (${JSON.stringify(c.detail)})`}
                </li>
              ))}
            </ul>
            <p style={styles.muted}>ID: {result.verification_id}</p>
          </div>
        )}
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <main style={styles.main}>
        <header style={styles.header}>
          <Link href="/" style={styles.logo}>TrustGate</Link>
          <nav style={styles.nav}>
            <Link href="/dashboard/">Dashboard</Link>
            <Link href="/history/">Historial</Link>
          </nav>
        </header>
        <div style={{ padding: "2rem", textAlign: "center" }}>Cargando…</div>
      </main>
    }>
      <DashboardContent />
    </Suspense>
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
  content: {
    flex: 1,
    padding: "2rem",
    maxWidth: "560px",
    margin: "0 auto",
    width: "100%",
  },
  h1: { marginBottom: "0.5rem", fontSize: "1.5rem" },
  subtitle: {
    color: "var(--muted)",
    marginBottom: "1.5rem",
    fontSize: "0.9rem",
  },
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
  resultTitle: {
    color: "var(--success)",
    marginBottom: "0.5rem",
  },
  trustScore: { marginBottom: "0.25rem" },
  status: { marginBottom: "0.5rem", fontSize: "0.9rem" },
  checks: { listStyle: "none", fontSize: "0.875rem", color: "var(--muted)" },
  muted: { marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--muted)" },
};
