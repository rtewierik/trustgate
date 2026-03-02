"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { VerificationResultCard, type VerificationResultCardData } from "@/components/VerificationResultCard";

const API_BASE = typeof window !== "undefined" ? "" : process.env.NEXT_PUBLIC_API_URL || "";
const POPUP_NAME = "TrustGateNumberVerification";
const POPUP_SPEC = "width=480,height=640,scrollbars=yes,resizable=yes";

interface VerificationResult extends VerificationResultCardData {
  verification_id: string;
  status: string;
  trust_score?: number;
  decision?: "allow" | "deny";
  check_results?: Array<{ name: string; status: string; detail?: Record<string, unknown> }>;
  checks?: Array<{ name: string; status: string; detail?: Record<string, unknown> }>;
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
  const popupRef = useRef<Window | null>(null);
  const pendingStateRef = useRef<string | null>(null);
  const popupCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Listen for result from popup: only re-render origin with verification when outcome was successful
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (data?.type !== "NUMBER_VERIFICATION_DONE" || !data.state) return;
      pendingStateRef.current = null;
      if (popupCheckIntervalRef.current) {
        clearInterval(popupCheckIntervalRef.current);
        popupCheckIntervalRef.current = null;
      }
      if (data.success !== true) return; // only update origin tab when successful
      setLoading(true);
      fetch(`${API_BASE}/api/v1/completed-verifications?state=${encodeURIComponent(data.state)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((verification) => {
          if (verification) {
            setResult(verification);
            setInitiateResult(null);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // When dashboard has state in URL (e.g. opened verification-popup in same tab and was redirected), fetch result
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
          ? `${window.location.origin}/dashboard/verification-popup`
          : `${process.env.NEXT_PUBLIC_API_URL || ""}/dashboard/verification-popup`;
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

  function openVerificationPopup() {
    if (!initiateResult?.authorization_url) return;
    if (popupCheckIntervalRef.current) {
      clearInterval(popupCheckIntervalRef.current);
      popupCheckIntervalRef.current = null;
    }
    const popup = window.open(
      initiateResult.authorization_url,
      POPUP_NAME,
      POPUP_SPEC
    );
    popupRef.current = popup;
    pendingStateRef.current = initiateResult.verification_request_id;
    const interval = setInterval(() => {
      if (!popupRef.current?.closed) return;
      clearInterval(interval);
      popupCheckIntervalRef.current = null;
      const state = pendingStateRef.current;
      if (!state) return;
      pendingStateRef.current = null;
      // Only update origin tab when outcome was successful (e.g. user closed before message; try fetch once)
      setLoading(true);
      fetch(`${API_BASE}/api/v1/completed-verifications?state=${encodeURIComponent(state)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((verification) => {
          if (verification && verification.decision === "allow") {
            setResult(verification);
            setInitiateResult(null);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 500);
    popupCheckIntervalRef.current = interval;
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
        <h1 style={styles.h1}>Verificación de identidad</h1>

        {!(result && result.decision === "allow") && (
          <>
            <p style={styles.subtitle}>
              Introduce el número y los datos del usuario. La verificación usa Number Verification, SIM Swap y KYC Match.
            </p>

            <form onSubmit={handleSubmit} style={styles.form}>
              <div style={styles.row}>
                <label style={styles.label}>Teléfono</label>
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
                <label style={styles.label}>País</label>
                <select value={country} onChange={(e) => setCountry(e.target.value)} style={styles.input}>
                  <option value="ES">ES</option>
                  <option value="DE">DE</option>
                  <option value="FR">FR</option>
                  <option value="GB">GB</option>
                </select>
              </div>
              <div style={styles.row}>
                <label style={styles.label}>Nombre</label>
                <input
                  type="text"
                  value={givenName}
                  onChange={(e) => setGivenName(e.target.value)}
                  placeholder="Ada"
                  style={styles.input}
                />
              </div>
              <div style={styles.row}>
                <label style={styles.label}>Apellidos</label>
                <input
                  type="text"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  placeholder="Lovelace"
                  style={styles.input}
                />
              </div>
              <div style={styles.row}>
                <label style={styles.label}>Fecha de nacimiento</label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  style={styles.input}
                />
              </div>
              <button type="submit" disabled={loading} style={styles.button}>
                {loading ? "Verificando…" : "Verificar"}
              </button>
            </form>

            {error && (
              <div style={styles.error}>
                {error}
              </div>
            )}

            {initiateResult && (
              <div style={styles.result}>
                <h2 style={styles.resultTitle}>Siguiente paso: verificación en red</h2>
                <p style={{ marginBottom: "1rem", color: "var(--muted)" }}>
                  Se abrirá una ventana emergente para que el usuario complete la verificación con el operador. Al cerrarla, esta página se actualizará si la verificación fue exitosa.
                </p>
                <button
                  type="button"
                  onClick={openVerificationPopup}
                  style={styles.button}
                >
                  Abrir verificación en ventana emergente
                </button>
                <p style={styles.muted}>Request ID: {initiateResult.verification_request_id}</p>
              </div>
            )}
          </>
        )}

        {result && (
          <div style={{ marginTop: "2rem" }}>
            <VerificationResultCard verification={result} showSubject={false} />
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
  resultTitle: {
    color: "var(--success)",
    marginBottom: "0.5rem",
  },
  trustScore: { marginBottom: "0.25rem" },
  status: { marginBottom: "0.5rem", fontSize: "0.9rem" },
  checks: { listStyle: "none", fontSize: "0.875rem", color: "var(--muted)" },
  muted: { marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--muted)" },
};
