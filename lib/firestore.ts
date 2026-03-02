import * as admin from "firebase-admin";

let firestoreInstance: admin.firestore.Firestore | null = null;

function getFirestore() {
  if (admin.apps.length === 0) {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const cred = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({ credential: admin.credential.cert(cred), projectId });
    } else if (projectId) {
      admin.initializeApp({ projectId });
    } else {
      throw new Error("Firebase not configured: set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_CLOUD_PROJECT");
    }
    firestoreInstance = admin.firestore();
    firestoreInstance.settings({ ignoreUndefinedProperties: true });
  }
  return firestoreInstance ?? admin.firestore();
}

/**
 * Single collection for all verification lifecycle states.
 * Document ID = verification_id (same as state from initiate).
 * Created at initiate with status "pending"; updated in callback to "approved" or "denied".
 *
 * TTL: A Firestore TTL policy on field "expires_at" (Firestore Timestamp) auto-deletes
 * pending verifications after the expiry time. Completed verifications set expires_at
 * to null so they never expire. Enable with:
 *   gcloud firestore fields ttls update expires_at --collection-group=verifications --enable-ttl
 */
export const VERIFICATIONS_COLLECTION = "verifications";

/** Pending verifications must complete within this window (Firestore TTL uses expires_at). */
export const PENDING_VERIFICATION_TTL_MINUTES = 5;

export interface VerificationRecord {
  verification_id: string;
  /** PII: present only while status is "pending"; removed when transitioning to approved/denied. */
  subject?: { phone_number: string; country: string };
  /** PII: present only while status is "pending"; removed when transitioning to approved/denied. */
  claims?: Record<string, string>;
  checks: string[];
  policy: { min_trust_score: number; sim_swap_max_age_hours?: number };
  status: "pending" | "approved" | "denied";
  /** Set at initiate; used by callback for redirect. */
  redirect_uri?: string;
  /** Set in callback when checks complete. */
  trust_score?: number;
  decision?: "allow" | "deny";
  check_results?: Array<{ name: string; status: string; detail?: Record<string, unknown> }>;
  /** TTL field: set at initiate (pending); set to null when completed so document never expires. */
  expires_at?: string | null;
  created_at: string;
  /** Set in callback when status moves to approved/denied. */
  completed_at?: string;
  /** Set in callback on failure. Must be sanitized (no PII). */
  error?: string;
  metadata?: Record<string, string>;
}

export async function saveVerification(data: VerificationRecord): Promise<void> {
  const db = getFirestore();
  const withExpiresAt: Record<string, unknown> = { ...data };
  if (data.expires_at) {
    withExpiresAt.expires_at = admin.firestore.Timestamp.fromDate(new Date(data.expires_at));
  }
  await db.collection(VERIFICATIONS_COLLECTION).doc(data.verification_id).set(withExpiresAt);
}

export async function getVerification(verificationId: string): Promise<VerificationRecord | null> {
  const db = getFirestore();
  const doc = await db.collection(VERIFICATIONS_COLLECTION).doc(verificationId).get();
  if (!doc.exists) return null;
  const raw = doc.data() as Record<string, unknown>;
  const expiresAt = raw.expires_at;
  if (expiresAt && typeof expiresAt === "object" && "toDate" in expiresAt && typeof expiresAt.toDate === "function") {
    raw.expires_at = (expiresAt as admin.firestore.Timestamp).toDate().toISOString();
  }
  return raw as unknown as VerificationRecord;
}

/**
 * Transition a verification from pending to approved/denied: write completion fields
 * and remove PII (subject, claims) from the document.
 */
export async function completeVerification(
  verificationId: string,
  update: Pick<
    VerificationRecord,
    "status" | "trust_score" | "decision" | "check_results" | "completed_at" | "expires_at"
  > & { error?: string }
): Promise<void> {
  const db = getFirestore();
  const payload: Record<string, unknown> = {
    status: update.status,
    trust_score: update.trust_score,
    decision: update.decision,
    check_results: update.check_results,
    completed_at: update.completed_at,
    expires_at:
      update.expires_at == null
        ? null
        : admin.firestore.Timestamp.fromDate(new Date(update.expires_at)),
    ...(update.error != null && update.error !== "" && { error: update.error }),
  };
  payload.subject = admin.firestore.FieldValue.delete();
  payload.claims = admin.firestore.FieldValue.delete();
  await db.collection(VERIFICATIONS_COLLECTION).doc(verificationId).update(payload);
}
