/**
 * Verification feedback (Option A): store human corrections and inject into Gemini prompt.
 * No PII; used to improve future trust score decisions.
 */

import * as admin from "firebase-admin";
import { getFirestore } from "./firestore";

export const VERIFICATION_FEEDBACK_COLLECTION = "verification_feedback";

export type FeedbackType = "false_positive" | "false_negative" | "correct";

export interface VerificationFeedbackRecord {
  verification_id: string;
  created_at: string;
  correct_decision: "allow" | "deny";
  correct_trust_score?: number;
  feedback_type: FeedbackType;
  comment?: string;
  /** Anonymised summary of check outcomes for prompt injection (e.g. "number_verification: pass, sim_swap: fail"). */
  checks_summary?: string;
}

export async function saveFeedback(data: Omit<VerificationFeedbackRecord, "created_at">): Promise<void> {
  const db = getFirestore();
  const doc = {
    ...data,
    created_at: new Date().toISOString(),
  };
  await db.collection(VERIFICATION_FEEDBACK_COLLECTION).add(doc);
}

/**
 * Fetch the N most recent feedback items for prompt injection.
 * Returns anonymised records (no PII).
 */
export async function getRecentFeedback(limit: number): Promise<VerificationFeedbackRecord[]> {
  const db = getFirestore();
  const snap = await db
    .collection(VERIFICATION_FEEDBACK_COLLECTION)
    .orderBy("created_at", "desc")
    .limit(limit)
    .get();

  const out: VerificationFeedbackRecord[] = [];
  snap.forEach((doc) => {
    const raw = doc.data() as Record<string, unknown>;
    const createdAt = raw.created_at;
    const created_at =
      typeof createdAt === "string"
        ? createdAt
        : createdAt && typeof createdAt === "object" && "toDate" in createdAt
          ? (createdAt as admin.firestore.Timestamp).toDate().toISOString()
          : new Date().toISOString();
    out.push({
      verification_id: String(raw.verification_id ?? ""),
      created_at,
      correct_decision: raw.correct_decision === "deny" ? "deny" : "allow",
      correct_trust_score: typeof raw.correct_trust_score === "number" ? raw.correct_trust_score : undefined,
      feedback_type:
        raw.feedback_type === "false_positive" || raw.feedback_type === "false_negative"
          ? raw.feedback_type
          : "correct",
      comment: typeof raw.comment === "string" ? raw.comment : undefined,
      checks_summary: typeof raw.checks_summary === "string" ? raw.checks_summary : undefined,
    });
  });
  return out;
}
