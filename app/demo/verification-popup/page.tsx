"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { API_BASE } from "@/lib/api";

const styles: Record<string, React.CSSProperties> = {
  main: { minHeight: "100vh", display: "flex", flexDirection: "column" },
  wrapper: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem",
    textAlign: "center",
  },
  // Card-style block (aligned with VerificationResultCard on demo/history)
  card: {
    padding: "1.5rem",
    borderRadius: "12px",
    border: "1px solid",
    maxWidth: "360px",
    width: "100%",
  },
  cardVerifying: {
    background: "var(--surface)",
    borderColor: "var(--border)",
  },
  cardSuccess: {
    background: "rgba(0, 200, 130, 0.08)",
    borderColor: "var(--success)",
  },
  cardFailure: {
    background: "rgba(255, 71, 87, 0.08)",
    borderColor: "var(--danger)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    marginBottom: "1rem",
    justifyContent: "center",
  },
  iconCircle: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.5rem",
    fontWeight: 700,
    flexShrink: 0,
  },
  iconVerifying: { background: "var(--border)", color: "var(--muted)" },
  iconSuccess: { background: "var(--success)", color: "var(--bg)" },
  iconFailure: { background: "var(--danger)", color: "var(--bg)" },
  title: {
    fontSize: "1.25rem",
    fontWeight: 600,
    margin: 0,
    color: "var(--text)",
  },
  titleSuccess: { color: "var(--success)" },
  titleFailure: { color: "var(--danger)" },
  message: {
    fontSize: "1.125rem",
    fontWeight: 600,
    margin: 0,
    marginBottom: "0.5rem",
  },
  hint: {
    fontSize: "0.9rem",
    color: "var(--muted)",
    margin: 0,
  },
  errorMessage: {
    fontSize: "1rem",
    color: "var(--danger)",
    margin: 0,
    marginBottom: "1rem",
    maxWidth: "360px",
  },
  muted: {
    fontSize: "0.875rem",
    color: "var(--muted)",
    margin: 0,
    marginBottom: "0.5rem",
  },
  // Spinner for verifying state
  spinner: {
    width: "24px",
    height: "24px",
    border: "3px solid var(--bg)",
    borderTopColor: "var(--muted)",
    borderRadius: "50%",
    animation: "verification-popup-spin 0.8s linear infinite",
  },
};

function VerificationPopupContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const state = searchParams.get("state");
  const errorMessage = searchParams.get("error_message");
  const [outcome, setOutcome] = useState<"loading" | "success" | "failure">("loading");
  // Set after mount to avoid hydration mismatch (server has no window.opener).
  // When true, we were opened by the demo and will redirect; when false after check, show "No verification data".
  const [hasOpener, setHasOpener] = useState<boolean | null>(null);
  useEffect(() => {
    if (!state && typeof window !== "undefined") setHasOpener(!!window.opener);
  }, [state]);

  // Error from callback redirect: notify opener once, show message and tell user to close and retry
  const errorNotifiedRef = useRef(false);
  if (errorMessage && typeof window !== "undefined" && window.opener && !errorNotifiedRef.current) {
    errorNotifiedRef.current = true;
    window.opener.postMessage(
      { type: "NUMBER_VERIFICATION_DONE", state: state ?? undefined, success: false },
      window.location.origin
    );
  }

  if (errorMessage) {
    return (
      <main style={styles.main}>
        <div style={styles.wrapper}>
          <div
            style={{
              ...styles.iconCircle,
              ...styles.iconFailure,
            }}
          >
            ✗
          </div>
          <p style={styles.message}>Something went wrong.</p>
          <p style={styles.errorMessage}>{errorMessage}</p>
          {state && (
            <p style={styles.muted}>Verification ID: {state}</p>
          )}
          <p style={styles.hint}>Close this window and retry.</p>
        </div>
      </main>
    );
  }

  useEffect(() => {
    if (typeof window === "undefined" || !state) return;

    // If opened directly (no opener), redirect to demo with state so result is shown there
    if (!window.opener) {
      const params = new URLSearchParams(searchParams.toString());
      router.replace(`/demo?${params.toString()}`);
      return;
    }

    const origin = window.location.origin;
    let cancelled = false;

    fetch(`${API_BASE}/api/v1/completed-verifications?state=${encodeURIComponent(state)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const success = data?.decision === "allow";
        window.opener.postMessage(
          { type: "NUMBER_VERIFICATION_DONE", state, success },
          origin
        );
        setOutcome(success ? "success" : "failure");
      })
      .catch(() => {
        if (cancelled) return;
        window.opener.postMessage(
          { type: "NUMBER_VERIFICATION_DONE", state, success: false },
          origin
        );
        setOutcome("failure");
      });

    return () => {
      cancelled = true;
    };
  }, [state, searchParams, router]);

  // No state: we were opened by the demo page and will receive the operator URL via postMessage, then redirect
  useEffect(() => {
    if (typeof window === "undefined" || state || errorMessage) return;
    if (!window.opener) return;

    const origin = window.location.origin;
    window.opener.postMessage({ type: "VERIFICATION_POPUP_READY" }, origin);

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== origin) return;
      const data = event.data;
      if (data?.type !== "VERIFICATION_POPUP_GO" || typeof data.authorization_url !== "string") return;
      window.location.href = data.authorization_url;
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [state, errorMessage]);

  // No state: show "Verifying…" (opener will send redirect URL) or "No verification data" if opened directly.
  // hasOpener is null on first paint (SSR + initial client) so we show "Verifying…" to avoid hydration mismatch.
  if (!state) {
    const showNoOpenerMessage = hasOpener === false;
    return (
      <main style={styles.main}>
        <div style={styles.wrapper}>
          <div
            style={{
              ...styles.card,
              ...styles.cardVerifying,
            }}
          >
            <div style={styles.header}>
              <div style={{ ...styles.iconCircle, ...styles.iconVerifying }}>
                <div style={styles.spinner} aria-hidden />
              </div>
              <h2 style={styles.title}>
                {showNoOpenerMessage ? "No verification data" : "Verifying…"}
              </h2>
            </div>
            <p style={styles.hint}>
              {showNoOpenerMessage
                ? "You may close this window."
                : "Redirecting you to complete verification…"}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <div style={styles.wrapper}>
        <div
          style={{
            ...styles.card,
            ...(outcome === "loading"
              ? styles.cardVerifying
              : outcome === "success"
                ? styles.cardSuccess
                : styles.cardFailure),
          }}
        >
          <div style={styles.header}>
            <div
              style={{
                ...styles.iconCircle,
                ...(outcome === "loading"
                  ? styles.iconVerifying
                  : outcome === "success"
                    ? styles.iconSuccess
                    : styles.iconFailure),
              }}
            >
              {outcome === "loading" ? (
                <div style={styles.spinner} aria-hidden />
              ) : outcome === "success" ? (
                "✓"
              ) : (
                "✗"
              )}
            </div>
            <h2
              style={{
                ...styles.title,
                ...(outcome === "success"
                  ? styles.titleSuccess
                  : outcome === "failure"
                    ? styles.titleFailure
                    : {}),
              }}
            >
              {outcome === "loading"
                ? "Verifying…"
                : outcome === "success"
                  ? "Verification successful."
                  : "Verification failed."}
            </h2>
          </div>
          {outcome === "loading" ? (
            <p style={styles.hint}>We are verifying your identity...</p>
          ) : (
            <>
              {state && (
                <p style={styles.muted}>Verification ID: {state}</p>
              )}
              <p style={styles.hint}>
                Close this window and continue on the main page.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default function VerificationPopupPage() {
  return (
    <Suspense
      fallback={
        <main style={styles.main}>
          <div style={styles.wrapper}>
            <p style={styles.message}>Loading…</p>
          </div>
        </main>
      }
    >
      <VerificationPopupContent />
    </Suspense>
  );
}
