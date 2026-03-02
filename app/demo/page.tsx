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
  risk_level?: "low" | "medium" | "high";
  summary?: string;
  recommendation?: string;
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
  feedbackSection: {
    marginTop: "1.5rem",
    padding: "1rem",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    background: "var(--bg)",
  },
  feedbackTitle: { fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.75rem" },
  feedbackButtons: { display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" },
  feedbackBtn: {
    padding: "0.5rem 1rem",
    borderRadius: "8px",
    border: "1px solid var(--border)",
    background: "var(--surface)",
    cursor: "pointer",
    fontSize: "0.875rem",
  },
  feedbackBtnSuccess: { borderColor: "var(--success)", color: "var(--success)" },
  feedbackBtnDanger: { borderColor: "var(--danger)", color: "var(--danger)" },
  feedbackComment: {
    width: "100%",
    minHeight: "60px",
    padding: "0.5rem",
    borderRadius: "8px",
    border: "1px solid var(--border)",
    background: "var(--bg)",
    fontSize: "0.875rem",
    marginTop: "0.5rem",
  },
  feedbackThankYou: { fontSize: "0.9rem", color: "var(--success)", marginTop: "0.5rem" },
  newVerificationBtn: { marginTop: "1rem" },
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
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackComment, setFeedbackComment] = useState("");
  const popupRef = useRef<Window | null>(null);
  const pendingStateRef = useRef<string | null>(null);
  const popupCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextStepRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initiateResult && nextStepRef.current) {
      nextStepRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [initiateResult]);

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
      setLoading(true);
      fetch(`${API_BASE}/api/v1/completed-verifications?state=${encodeURIComponent(data.state)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((verification) => {
          if (verification) {
            setResult(verification);
            setInitiateResult(null);
            setFeedbackSent(false);
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
      if (!res.ok) throw new Error(data.error || data.message || "Failed to start verification");
      setInitiateResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
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
          if (verification) {
            setResult(verification);
            setInitiateResult(null);
            setFeedbackSent(false);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 500);
    popupCheckIntervalRef.current = interval;
  }

  async function submitFeedback(feedbackType: "correct" | "false_positive" | "false_negative") {
    if (!result?.verification_id) return;
    setFeedbackLoading(true);
    try {
      const correct_decision =
        feedbackType === "correct"
          ? result.decision!
          : feedbackType === "false_negative"
            ? "allow"
            : "deny";
      const res = await fetch(`${API_BASE}/api/v1/verifications/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verification_id: result.verification_id,
          correct_decision,
          correct_trust_score: result.trust_score,
          feedback_type: feedbackType,
          comment: feedbackComment.trim() || undefined,
        }),
      });
      if (res.ok) setFeedbackSent(true);
      else setError("Could not send feedback");
    } catch {
      setError("Network error while sending feedback");
    } finally {
      setFeedbackLoading(false);
    }
  }

  const s = demoStyles;
  return (
    <main style={s.main}>
      <AppHeader />
      <div style={s.content}>
        <h1 style={s.h1}>Identity verification</h1>

        {!result ? (
          <>
            <p style={s.subtitle}>
              Enter the phone number and user details. Verification checks the origin phone number, recent SIM swaps and KYC matching.
            </p>

            <form onSubmit={handleSubmit} style={s.form}>
              <div style={s.row}>
                <label style={s.label}>Phone</label>
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
                <label style={s.label}>Country</label>
                <select value={country} onChange={(e) => setCountry(e.target.value)} style={s.input}>
                  <option value="ES">ES</option>
                  <option value="DE">DE</option>
                  <option value="FR">FR</option>
                  <option value="GB">GB</option>
                </select>
              </div>
              <div style={s.row}>
                <label style={s.label}>First name</label>
                <input
                  type="text"
                  value={givenName}
                  onChange={(e) => setGivenName(e.target.value)}
                  placeholder="Ada"
                  style={s.input}
                />
              </div>
              <div style={s.row}>
                <label style={s.label}>Last name</label>
                <input
                  type="text"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  placeholder="Lovelace"
                  style={s.input}
                />
              </div>
              <div style={s.row}>
                <label style={s.label}>Date of birth</label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  style={s.input}
                />
              </div>
              <button type="submit" disabled={loading} style={s.button}>
                {loading ? "Starting…" : "Start verification"}
              </button>
            </form>

            {error && <div style={s.error}>{error}</div>}

            {initiateResult && (
              <div ref={nextStepRef} style={s.result}>
                <h2 style={s.resultTitle}>Next step: network verification</h2>
                <p style={{ marginBottom: "1rem", color: "var(--muted)" }}>
                  A popup window will open for the user to complete verification with the operator. When closed, this page will update with the result.
                </p>
                <button type="button" onClick={openVerificationPopup} style={s.button}>
                  Open verification in popup window
                </button>
                <p style={s.muted}>Verification ID: {initiateResult.verification_id}</p>
              </div>
            )}
          </>
        ) : (
          <div style={{ marginTop: "2rem" }}>
            <VerificationResultCard verification={result} showSubject={false} />
            <div style={s.feedbackSection} role="region" aria-label="Result correction">
              <p style={s.feedbackTitle}>Was the result correct?</p>
              {feedbackSent ? (
                <p style={s.feedbackThankYou}>Thank you, feedback saved. It will help improve future decisions.</p>
              ) : (
                <>
                  <div style={s.feedbackButtons}>
                    <button
                      type="button"
                      style={{ ...s.feedbackBtn, ...s.feedbackBtnSuccess }}
                      onClick={() => submitFeedback("correct")}
                      disabled={feedbackLoading}
                    >
                      Correct
                    </button>
                    <button
                      type="button"
                      style={{ ...s.feedbackBtn, ...s.feedbackBtnDanger }}
                      onClick={() => submitFeedback("false_positive")}
                      disabled={feedbackLoading}
                      title="System approved but should have denied"
                    >
                      False positive
                    </button>
                    <button
                      type="button"
                      style={{ ...s.feedbackBtn, ...s.feedbackBtnDanger }}
                      onClick={() => submitFeedback("false_negative")}
                      disabled={feedbackLoading}
                      title="System denied but should have approved"
                    >
                      False negative
                    </button>
                  </div>
                  <label style={{ display: "block", fontSize: "0.875rem", color: "var(--muted)", marginTop: "0.5rem" }}>
                    Comment (optional)
                  </label>
                  <textarea
                    style={s.feedbackComment}
                    placeholder="E.g. Date of birth was correct on the documents."
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value)}
                  />
                </>
              )}
            </div>
            <button
              type="button"
              style={{ ...s.button, ...s.newVerificationBtn }}
              onClick={() => { setResult(null); setError(null); setFeedbackSent(false); setFeedbackComment(""); }}
            >
              New verification
            </button>
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
          <div style={{ padding: "2rem", textAlign: "center" }}>Loading…</div>
        </main>
      }
    >
      <DemoContent />
    </Suspense>
  );
}
