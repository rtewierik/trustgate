import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestOrigin } from "@/lib/get-request-origin";
import { createNumberVerificationAuthLink } from "@/lib/nac";
import {
  saveVerification,
  type VerificationRecord,
  PENDING_VERIFICATION_TTL_MINUTES,
} from "@/lib/firestore";
import { v4 as uuidv4 } from "uuid";

const InitiateSchema = z.object({
  subject: z.object({
    phone_number: z.string().min(1),
    country: z.string().length(2),
  }),
  redirect_uri: z.string().url(),
  claims: z
    .object({
      given_name: z.string().optional(),
      family_name: z.string().optional(),
      date_of_birth: z.string().optional(),
    })
    .optional(),
  checks: z
    .array(z.enum(["number_verification", "sim_swap", "kyc_match"]))
    .optional(),
  policy: z
    .object({
      min_trust_score: z.number().min(0).max(100).default(75),
      sim_swap_max_age_hours: z.number().min(0).optional(),
    })
    .optional(),
  metadata: z.record(z.string()).optional(),
});

/**
 * POST /v1/verifications/initiate
 * Initialize verification: create a pending verification in Firestore and return an auth link.
 * After the user completes the redirect, the callback runs verification and updates the same
 * document (status: approved/denied). Use GET /v1/completed-verifications?state=<id> to fetch the result.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = InitiateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      subject,
      redirect_uri,
      claims = {},
      checks = ["number_verification", "sim_swap", "kyc_match"],
      policy = { min_trust_score: 75, sim_swap_max_age_hours: 72 },
      metadata,
    } = parsed.data;

    const verificationId = uuidv4();
    const phoneNumber = subject.phone_number;
    const normalizedPhone = phoneNumber.startsWith("+")
      ? phoneNumber
      : `+${phoneNumber}`;
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + PENDING_VERIFICATION_TTL_MINUTES * 60 * 1000
    );

    const record: VerificationRecord = {
      verification_id: verificationId,
      subject: { phone_number: normalizedPhone, country: subject.country },
      claims,
      checks,
      policy,
      status: "pending",
      redirect_uri,
      expires_at: expiresAt.toISOString(),
      created_at: now.toISOString(),
      metadata,
    };
    await saveVerification(record);

    // Dynamic callback base. Prefer forwarded headers (Cloud Run/App Hosting use X-Forwarded-Host)
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : undefined) ||
      getRequestOrigin(request);
    const callbackUrl = `${baseUrl}/api/v1/verifications/number-verification/callback`;

    const authorization_url = await createNumberVerificationAuthLink(
      normalizedPhone,
      callbackUrl,
      verificationId
    );

    return NextResponse.json({
      authorization_url,
      verification_id: verificationId,
      message:
        "Redirect the end user to authorization_url. After they complete the flow, the callback will run verification and write the result. Use GET /v1/completed-verifications?state=<verification_id> to fetch the completed verification.",
    });
  } catch (err) {
    console.error("Verification initiate error:", err);
    return NextResponse.json(
      {
        error: "Failed to initiate verification",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
