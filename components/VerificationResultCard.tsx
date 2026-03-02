"use client";

export interface VerificationCheckItem {
  name: string;
  status: string;
  detail?: Record<string, unknown>;
}

export interface VerificationResultCardData {
  verification_id?: string;
  status: string;
  trust_score?: number;
  decision?: "allow" | "deny";
  /** risk_level from Gemini: low = LOW RISK, medium = REVIEW, high = HIGH RISK */
  risk_level?: "low" | "medium" | "high";
  /** One-line AI summary */
  summary?: string;
  /** Optional recommendation (e.g. "REVIEW due to recent SIM swap") */
  recommendation?: string;
  /** Check results (from API as check_results or checks; may be array or object) */
  check_results?: VerificationCheckItem[] | Record<string, VerificationCheckItem>;
  checks?: VerificationCheckItem[] | Record<string, VerificationCheckItem> | string[];
  subject?: { phone_number: string; country: string };
  created_at?: string;
  /** Present for pending; absent/null for completed (persistent). */
  expires_at?: string | null;
  /** Shown on failure when no full verification (e.g. error from provider) */
  error_message?: string;
}

/** Normalize check_results/checks to an array of { name, status, detail? } for rendering. */
function normalizeChecks(verification: VerificationResultCardData): VerificationCheckItem[] {
  const raw = verification.check_results ?? verification.checks;
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === "string")
          return { name: item, status: "unknown" as string };
        if (item && typeof item === "object" && "name" in item && "status" in item)
          return { name: String(item.name), status: String(item.status), detail: (item as VerificationCheckItem).detail };
        return null;
      })
      .filter((c): c is VerificationCheckItem => c != null);
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return Object.entries(raw).map(([name, value]) => {
      if (value && typeof value === "object" && "status" in value)
        return { name, status: String((value as VerificationCheckItem).status), detail: (value as VerificationCheckItem).detail };
      return { name, status: "unknown" };
    });
  }
  return [];
}

const cardStyles: Record<string, React.CSSProperties> = {
  card: {
    padding: "1.5rem",
    borderRadius: "12px",
    border: "1px solid",
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
  },
  iconCircle: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.5rem",
  },
  iconSuccess: { background: "var(--success)", color: "var(--bg)" },
  iconFailure: { background: "var(--danger)", color: "var(--bg)" },
  title: { fontSize: "1.25rem", fontWeight: 600, margin: 0 },
  trustScore: { marginBottom: "0.25rem" },
  status: { marginBottom: "0.5rem", fontSize: "0.9rem" },
  checks: { listStyle: "none", fontSize: "0.875rem", color: "var(--muted)", margin: 0, padding: 0 },
  checkItem: { marginBottom: "0.25rem" },
  muted: { marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--muted)" },
  errorMessage: {
    marginTop: "0.5rem",
    padding: "0.75rem",
    background: "rgba(255,71,87,0.15)",
    borderRadius: "8px",
    fontSize: "0.9rem",
    color: "var(--danger)",
  },
  riskLevel: { fontSize: "1rem", fontWeight: 600, marginBottom: "0.25rem" },
  summary: {
    marginTop: "0.75rem",
    padding: "0.75rem",
    background: "rgba(0,0,0,0.15)",
    borderRadius: "8px",
    fontSize: "0.9rem",
    color: "var(--text)",
    borderLeft: "3px solid var(--accent)",
  },
  recommendation: {
    marginTop: "0.5rem",
    fontSize: "0.875rem",
    color: "var(--muted)",
    fontStyle: "italic",
  },
  checkExplanation: { marginLeft: "0.5rem", color: "var(--muted)", fontSize: "0.85em" },
};

export function VerificationResultCard({
  verification,
  showSubject = true,
  showCreatedAt = false,
  compact = false,
}: {
  verification: VerificationResultCardData;
  showSubject?: boolean;
  showCreatedAt?: boolean;
  compact?: boolean;
}) {
  const success = verification.decision === "allow";
  const checks = normalizeChecks(verification);

  return (
    <div
      style={{
        ...cardStyles.card,
        ...(success ? cardStyles.cardSuccess : cardStyles.cardFailure),
      }}
    >
      <div style={cardStyles.header}>
        <div
          style={{
            ...cardStyles.iconCircle,
            ...(success ? cardStyles.iconSuccess : cardStyles.iconFailure),
          }}
        >
          {success ? "✓" : "✗"}
        </div>
        <h2
          style={{
            ...cardStyles.title,
            color: success ? "var(--success)" : "var(--danger)",
          }}
        >
          {success ? "Approved" : "Denied"}
        </h2>
      </div>

      {verification.error_message && (
        <p style={cardStyles.errorMessage}>{verification.error_message}</p>
      )}

      {!verification.error_message && (
        <>
          {verification.risk_level != null && (
            <p
              style={{
                ...cardStyles.riskLevel,
                color:
                  verification.risk_level === "low"
                    ? "var(--success)"
                    : verification.risk_level === "high"
                      ? "var(--danger)"
                      : "var(--accent)",
              }}
            >
              {verification.risk_level === "low"
                ? "LOW RISK"
                : verification.risk_level === "high"
                  ? "HIGH RISK"
                  : "REVIEW"}
            </p>
          )}
          {verification.trust_score != null && (
            <p style={cardStyles.trustScore}>
              Trust Score: <strong>{verification.trust_score}/100</strong>
            </p>
          )}
          <p style={cardStyles.status}>Status: {verification.status}</p>

          {verification.summary != null && verification.summary !== "" && (
            <div style={cardStyles.summary} role="region" aria-label="AI analysis">
              {verification.summary}
            </div>
          )}
          {verification.recommendation != null && verification.recommendation !== "" && (
            <p style={cardStyles.recommendation}>{verification.recommendation}</p>
          )}

          {checks.length > 0 && (
            <ul style={cardStyles.checks}>
              {checks.map((c) => (
                <li key={c.name} style={cardStyles.checkItem}>
                  <span
                    style={{
                      color:
                        c.status === "pass"
                          ? "var(--success)"
                          : c.status === "warn"
                            ? "var(--accent)"
                            : "var(--danger)",
                    }}
                  >
                    {c.status === "pass" ? "✔" : c.status === "warn" ? "⚠" : "✗"} {c.name}
                  </span>
                  {!compact && c.detail?.explanation != null && (
                    <span style={cardStyles.checkExplanation}> — {String(c.detail.explanation)}</span>
                  )}
                  {!compact && c.detail && !("explanation" in c.detail) && Object.keys(c.detail).length > 0 && (
                    <span style={cardStyles.checkExplanation}> ({JSON.stringify(c.detail)})</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {showSubject && verification.subject && (
            <p style={cardStyles.muted}>
              Phone: {verification.subject.phone_number} · Country: {verification.subject.country}
            </p>
          )}
          {showCreatedAt && verification.created_at && (
            <p style={cardStyles.muted}>
              Created: {new Date(verification.created_at).toLocaleString()}
            </p>
          )}
        </>
      )}

      {verification.verification_id && (
        <p style={cardStyles.muted}>Verification ID: {verification.verification_id}</p>
      )}
    </div>
  );
}
