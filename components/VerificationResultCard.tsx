"use client";

export interface VerificationResultCardData {
  verification_id?: string;
  status: string;
  trust_score?: number;
  decision?: "allow" | "deny";
  /** Check results (from API as check_results or checks) */
  check_results?: Array<{ name: string; status: string; detail?: Record<string, unknown> }>;
  checks?: Array<{ name: string; status: string; detail?: Record<string, unknown> }>;
  subject?: { phone_number: string; country: string };
  created_at?: string;
  expires_at?: string;
  /** Shown on failure when no full verification (e.g. error from provider) */
  error_message?: string;
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
  const checks = verification.check_results ?? verification.checks ?? [];

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
          {success ? "Aprobado" : "Denegado"}
        </h2>
      </div>

      {verification.error_message && (
        <p style={cardStyles.errorMessage}>{verification.error_message}</p>
      )}

      {!verification.error_message && (
        <>
          {verification.trust_score != null && (
            <p style={cardStyles.trustScore}>
              Trust Score: <strong>{verification.trust_score}/100</strong>
            </p>
          )}
          <p style={cardStyles.status}>Estado: {verification.status}</p>

          {checks.length > 0 && (
            <ul style={cardStyles.checks}>
              {checks.map((c) => (
                <li key={c.name} style={cardStyles.checkItem}>
                  {c.name}:{" "}
                  <span
                    style={{
                      color: c.status === "pass" ? "var(--success)" : "var(--danger)",
                    }}
                  >
                    {c.status}
                  </span>
                  {c.detail && !compact && ` (${JSON.stringify(c.detail)})`}
                </li>
              ))}
            </ul>
          )}

          {showSubject && verification.subject && (
            <p style={cardStyles.muted}>
              Teléfono: {verification.subject.phone_number} · País: {verification.subject.country}
            </p>
          )}
          {verification.verification_id && (
            <p style={cardStyles.muted}>ID: {verification.verification_id}</p>
          )}
          {showCreatedAt && verification.created_at && (
            <p style={cardStyles.muted}>
              Creado: {new Date(verification.created_at).toLocaleString()}
            </p>
          )}
        </>
      )}
    </div>
  );
}
