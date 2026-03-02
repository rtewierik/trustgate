"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { VerificationResultCard, type VerificationResultCardData } from "@/components/VerificationResultCard";
import { API_BASE } from "@/lib/api";
import { pageLayoutStyles } from "@/lib/layoutStyles";

const POPUP_NAME = "TrustGateNumberVerification";
const POPUP_SPEC = "width=480,height=640,scrollbars=yes,resizable=yes";

interface VerificationResult extends VerificationResultCardData {
  verification_id: string;
  status: string;
  trust_score?: number;
  decision?: "allow" | "deny";
  check_results?: Array<{ name: string; status: string; detail?: Record<string, unknown> }>;
  checks?: Array<{ name: string; status: string; detail?: Record<string, unknown> }>;
}

interface InitiateResult {
  authorization_url: string;
  verification_id: string;
  message: string;
}

const demoStyles: Record<string, React.CSSProperties> = {
  ...pageLayoutStyles,
  result: {
    marginTop: "2rem",
    padding: "1.5rem",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
  },
  resultTitle: { color: "var(--success)", marginBottom: "0.5rem" },
  muted: { marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--muted)" },
};

function DemoContent() {
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
      if (data.success !== true) return;
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
          ? `${window.location.origin}/demo/verification-popup`
          : `${process.env.NEXT_PUBLIC_API_URL || ""}/demo/verification-popup`;
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
    pendingStateRef.current = initiateResult.verification_id;
    const interval = setInterval(() => {
      if (!popupRef.current?.closed) return;
      clearInterval(interval);
      popupCheckIntervalRef.current = null;
      const state = pendingStateRef.current;
      if (!state) return;
      pendingStateRef.current = null;
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

  const s = demoStyles;
  return (
    <main style={s.main}>
      <AppHeader />
      <div style={s.content}>
        <h1 style={s.h1}>Verificación de identidad</h1>

        {!(result && result.decision === "allow") && (
          <>
            <p style={s.subtitle}>
              Introduce el número y los datos del usuario. La verificación usa Number Verification, SIM Swap y KYC Match.
            </p>

            <form onSubmit={handleSubmit} style={s.form}>
              <div style={s.row}>
                <label style={s.label}>Teléfono</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+34XXXXXXXXX"
                  required
                  style={s.input}
                />
              </div>
              <div style={s.row}>
                <label style={s.label}>País</label>
                <select value={country} onChange={(e) => setCountry(e.target.value)} style={s.input}>
                  <option value="ES">ES</option>
                  <option value="DE">DE</option>
                  <option value="FR">FR</option>
                  <option value="GB">GB</option>
                </select>
              </div>
              <div style={s.row}>
                <label style={s.label}>Nombre</label>
                <input
                  type="text"
                  value={givenName}
                  onChange={(e) => setGivenName(e.target.value)}
                  placeholder="Ada"
                  style={s.input}
                />
              </div>
              <div style={s.row}>
                <label style={s.label}>Apellidos</label>
                <input
                  type="text"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  placeholder="Lovelace"
                  style={s.input}
                />
              </div>
              <div style={s.row}>
                <label style={s.label}>Fecha de nacimiento</label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  style={s.input}
                />
              </div>
              <button type="submit" disabled={loading} style={s.button}>
                {loading ? "Iniciando…" : "Iniciar verificación"}
              </button>
            </form>

            {error && <div style={s.error}>{error}</div>}

            {initiateResult && (
              <div style={s.result}>
                <h2 style={s.resultTitle}>Siguiente paso: verificación en red</h2>
                <p style={{ marginBottom: "1rem", color: "var(--muted)" }}>
                  Se abrirá una ventana emergente para que el usuario complete la verificación con el operador. Al cerrarla, esta página se actualizará si la verificación fue exitosa.
                </p>
                <button type="button" onClick={openVerificationPopup} style={s.button}>
                  Abrir verificación en ventana emergente
                </button>
                <p style={s.muted}>Verification ID: {initiateResult.verification_id}</p>
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

export default function DemoPage() {
  return (
    <Suspense
      fallback={
        <main style={pageLayoutStyles.main}>
          <AppHeader />
          <div style={{ padding: "2rem", textAlign: "center" }}>Cargando…</div>
        </main>
      }
    >
      <DemoContent />
    </Suspense>
  );
}
