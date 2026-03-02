import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { numberVerification, simSwap, kycMatch } from "@/lib/nac";
import { computeTrustScore } from "@/lib/trust-score";
import { saveVerification, listVerifications, type VerificationRecord } from "@/lib/firestore";

export async function GET(request: NextRequest) {
  const limit = Math.min(Number(request.nextUrl.searchParams.get("limit")) || 50, 100);
  const list = await listVerifications(limit);
  return NextResponse.json({
    verifications: list.map((v) => ({
      verification_id: v.verification_id,
      status: v.status,
      trust_score: v.trust_score,
      decision: v.decision,
      subject: v.subject,
      created_at: v.created_at,
    })),
  });
}

const RequestSchema = z.object({
  request_id: z.string().optional(),
  subject: z.object({
    phone_number: z.string().min(1),
    country: z.string().length(2),
  }),
  claims: z.object({
    given_name: z.string().optional(),
    family_name: z.string().optional(),
    date_of_birth: z.string().optional(),
  }).optional(),
  checks: z.array(z.enum(["number_verification", "sim_swap", "kyc_match"])).optional(),
  policy: z.object({
    min_trust_score: z.number().min(0).max(100).default(75),
    sim_swap_max_age_hours: z.number().min(0).optional(),
  }).optional(),
  callback: z.object({
    webhook_url: z.string().url().optional(),
    webhook_secret: z.string().optional(),
  }).optional(),
  metadata: z.record(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      request_id,
      subject,
      claims = {},
      checks = ["number_verification", "sim_swap", "kyc_match"],
      policy = { min_trust_score: 75, sim_swap_max_age_hours: 72 },
      metadata,
    } = parsed.data;

    const verificationId = `ver_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const phoneNumber = subject.phone_number;
    const country = subject.country;

    const [numVer, simSwapRes, kycRes] = await Promise.all([
      checks.includes("number_verification") ? numberVerification(phoneNumber, country) : Promise.resolve({ verified: true }),
      checks.includes("sim_swap") ? simSwap(phoneNumber, country) : Promise.resolve({ swapped: false, last_swap_hours_ago: 999 }),
      checks.includes("kyc_match") ? kycMatch(phoneNumber, country, claims) : Promise.resolve({ match: true, match_level: "high" as const }),
    ]);

    const { trust_score, checks: checkResults, decision } = computeTrustScore(
      "verified" in numVer ? numVer : { verified: true },
      "swapped" in simSwapRes ? simSwapRes : { swapped: false, last_swap_hours_ago: 999 },
      "match" in kycRes ? kycRes : { match: true, match_level: "high" },
      policy
    );

    const status = decision === "allow" ? "approved" : "denied";

    const record: VerificationRecord = {
      verification_id: verificationId,
      request_id: request_id ?? verificationId,
      subject: { phone_number: phoneNumber, country },
      claims,
      checks,
      policy,
      status,
      trust_score,
      decision,
      check_results: checkResults,
      expires_at: expiresAt.toISOString(),
      created_at: now.toISOString(),
      metadata,
    };

    await saveVerification(record);

    const response = {
      verification_id: verificationId,
      status,
      trust_score,
      decision,
      checks: checkResults,
      expires_at: record.expires_at,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("Verification error:", err);
    return NextResponse.json(
      { error: "Internal server error", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
