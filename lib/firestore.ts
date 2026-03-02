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
 */
export const VERIFICATIONS_COLLECTION = "verifications";

export interface VerificationRecord {
  verification_id: string;
  subject: { phone_number: string; country: string };
  claims: Record<string, string>;
  checks: string[];
  policy: { min_trust_score: number; sim_swap_max_age_hours?: number };
  status: "pending" | "approved" | "denied";
  /** Set at initiate; used by callback for redirect. */
  redirect_uri?: string;
  /** Set in callback when checks complete. */
  trust_score?: number;
  decision?: "allow" | "deny";
  check_results?: Array<{ name: string; status: string; detail?: Record<string, unknown> }>;
  expires_at: string;
  created_at: string;
  /** Set in callback when status moves to approved/denied. */
  completed_at?: string;
  /** Set in callback on failure (e.g. NAC error). */
  error?: string;
  metadata?: Record<string, string>;
}

export async function saveVerification(data: VerificationRecord): Promise<void> {
  const db = getFirestore();
  await db.collection(VERIFICATIONS_COLLECTION).doc(data.verification_id).set(data);
}

export async function getVerification(verificationId: string): Promise<VerificationRecord | null> {
  const db = getFirestore();
  const doc = await db.collection(VERIFICATIONS_COLLECTION).doc(verificationId).get();
  return doc.exists ? (doc.data() as VerificationRecord) : null;
}

export async function updateVerification(
  verificationId: string,
  update: Partial<
    Pick<
      VerificationRecord,
      | "status"
      | "trust_score"
      | "decision"
      | "check_results"
      | "completed_at"
      | "error"
    >
  >
): Promise<void> {
  const db = getFirestore();
  await db.collection(VERIFICATIONS_COLLECTION).doc(verificationId).update(update);
}
