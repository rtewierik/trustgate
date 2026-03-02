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

export const VERIFICATIONS_COLLECTION = "verifications";

export interface VerificationRecord {
  verification_id: string;
  request_id: string;
  subject: { phone_number: string; country: string };
  claims: Record<string, string>;
  checks: string[];
  policy: { min_trust_score: number; sim_swap_max_age_hours?: number };
  status: "pending" | "approved" | "denied";
  trust_score?: number;
  decision?: "allow" | "deny";
  check_results?: Array<{ name: string; status: string; detail?: Record<string, unknown> }>;
  expires_at: string;
  created_at: string;
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

// ---------------------------------------------------------------------------
// Number verification requests (redirect flow: state = request ID)
// Stores the full verification request so callback can run SIM swap + KYC after auth.
// ---------------------------------------------------------------------------

export const NUMBER_VERIFICATION_REQUESTS_COLLECTION = "number_verification_requests";

export interface NumberVerificationRequestRecord {
  state: string;
  phone_number: string;
  country: string;
  redirect_uri?: string;
  status: "pending" | "completed" | "failed";
  verified?: boolean;
  created_at: string;
  completed_at?: string;
  error?: string;
  /** Set in callback when the full verification record is created */
  verification_id?: string;
  subject: { phone_number: string; country: string };
  claims: Record<string, string>;
  checks: string[];
  policy: { min_trust_score: number; sim_swap_max_age_hours?: number };
  metadata?: Record<string, string>;
}

export async function saveNumberVerificationRequest(
  data: NumberVerificationRequestRecord
): Promise<void> {
  const db = getFirestore();
  await db
    .collection(NUMBER_VERIFICATION_REQUESTS_COLLECTION)
    .doc(data.state)
    .set(data);
}

export async function getNumberVerificationRequest(
  state: string
): Promise<NumberVerificationRequestRecord | null> {
  const db = getFirestore();
  const doc = await db
    .collection(NUMBER_VERIFICATION_REQUESTS_COLLECTION)
    .doc(state)
    .get();
  return doc.exists ? (doc.data() as NumberVerificationRequestRecord) : null;
}

export async function updateNumberVerificationRequest(
  state: string,
  update: Partial<
    Pick<
      NumberVerificationRequestRecord,
      "status" | "verified" | "completed_at" | "error" | "verification_id"
    >
  >
): Promise<void> {
  const db = getFirestore();
  await db
    .collection(NUMBER_VERIFICATION_REQUESTS_COLLECTION)
    .doc(state)
    .update(update);
}
