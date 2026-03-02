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
  iconCircle: {
    width: "64px",
    height: "64px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "2rem",
    fontWeight: 700,
    marginBottom: "1.25rem",
  },
  iconSuccess: { background: "var(--success)", color: "var(--bg)" },
  iconFailure: { background: "var(--danger)", color: "var(--bg)" },
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
};

function VerificationPopupContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const state = searchParams.get("state");
  const errorMessage = searchParams.get("error_message");
  const [outcome, setOutcome] = useState<"loading" | "success" | "failure">("loading");

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

  // No state: nothing to show (e.g. direct visit without params)
  if (!state) {
    return (
      <main style={styles.main}>
        <div style={styles.wrapper}>
          <p style={styles.message}>No verification data. You may close this window.</p>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <div style={styles.wrapper}>
        {outcome === "loading" ? (
          <p style={styles.message}>Loading verification…</p>
        ) : (
          <>
            <div
              style={{
                ...styles.iconCircle,
                ...(outcome === "success" ? styles.iconSuccess : styles.iconFailure),
              }}
            >
              {outcome === "success" ? "✓" : "✗"}
            </div>
            <p style={styles.message}>
              {outcome === "success"
                ? "Verification successful."
                : "Verification failed."}
            </p>
            <p style={styles.hint}>
              Close this window and continue on the main page.
            </p>
          </>
        )}
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
