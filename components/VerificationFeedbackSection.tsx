"use client";

import { useState } from "react";
import { API_BASE } from "@/lib/api";

export interface VerificationForFeedback {
  verification_id: string;
  decision?: "allow" | "deny";
  trust_score?: number;
}

const styles: Record<string, React.CSSProperties> = {
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
    color: "var(--muted)",
  },
  feedbackThankYou: { fontSize: "0.9rem", color: "var(--success)", marginTop: "0.5rem" },
};

export function VerificationFeedbackSection({ verification }: { verification: VerificationForFeedback }) {
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackComment, setFeedbackComment] = useState("");

  async function submitFeedback(feedbackType: "correct" | "false_positive" | "false_negative") {
    setFeedbackLoading(true);
    try {
      const correct_decision =
        feedbackType === "correct"
          ? verification.decision!
          : feedbackType === "false_negative"
            ? "allow"
            : "deny";
      const res = await fetch(`${API_BASE}/api/v1/verifications/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verification_id: verification.verification_id,
          correct_decision,
          correct_trust_score: verification.trust_score,
          feedback_type: feedbackType,
          comment: feedbackComment.trim() || undefined,
        }),
      });
      if (res.ok) setFeedbackSent(true);
    } finally {
      setFeedbackLoading(false);
    }
  }

  const s = styles;
  return (
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
  );
}
