/**
 * Verification feedback (Option A): store human corrections and inject into Gemini prompt.
 * No PII; used to improve future trust score decisions.
 */

import * as admin from "firebase-admin";
import { getFirestore } from "./firestore";
import type { StoredCheckInputs } from "./verification-types";

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
  /** NAC outcomes for that verification (no PII). Lets Gemini compare to current verification and infer if correction applies. */
  verification_input?: StoredCheckInputs;
}

function parseStoredCheckInputs(v: unknown): StoredCheckInputs | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const nv = o.number_verification;
  const ss = o.sim_swap;
  const kyc = o.kyc_match;
  if (!nv || typeof nv !== "object" || !ss || typeof ss !== "object" || !kyc || typeof kyc !== "object") return null;
  const nvObj = nv as Record<string, unknown>;
  const ssObj = ss as Record<string, unknown>;
  const kycObj = kyc as Record<string, unknown>;
  const verified_claims =
    kycObj.verified_claims && typeof kycObj.verified_claims === "object" && !Array.isArray(kycObj.verified_claims)
      ? (kycObj.verified_claims as Record<string, "true" | "false" | "not_available">)
      : undefined;
  const raw_match_results =
    kycObj.raw_match_results && typeof kycObj.raw_match_results === "object" && !Array.isArray(kycObj.raw_match_results)
      ? (kycObj.raw_match_results as Record<string, string | number>)
      : undefined;
  const selected_claim_keys =
    Array.isArray(kycObj.selected_claim_keys) && kycObj.selected_claim_keys.every((x) => typeof x === "string")
      ? (kycObj.selected_claim_keys as string[])
      : undefined;
  return {
    number_verification: {
      verified: Boolean(nvObj.verified),
      ...(typeof nvObj.detail === "string" && { detail: nvObj.detail }),
    },
    sim_swap: {
      swapped: Boolean(ssObj.swapped),
      ...(typeof ssObj.last_swap_hours_ago === "number" && { last_swap_hours_ago: ssObj.last_swap_hours_ago }),
      ...(typeof ssObj.detail === "string" && { detail: ssObj.detail }),
    },
    kyc_match: {
      match: Boolean(kycObj.match),
      ...(typeof kycObj.match_level === "string" && { match_level: kycObj.match_level }),
      ...(verified_claims && { verified_claims }),
      ...(raw_match_results && { raw_match_results }),
      ...(selected_claim_keys && { selected_claim_keys }),
    },
  };
}

export async function saveFeedback(
  data: Omit<VerificationFeedbackRecord, "created_at">
): Promise<void> {
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
    const verification_input = parseStoredCheckInputs(raw.verification_input);
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
      verification_input: verification_input ?? undefined,
    });
  });
  return out;
}
