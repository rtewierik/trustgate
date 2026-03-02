import { NextRequest, NextResponse } from "next/server";
import { getRequestOrigin } from "@/lib/get-request-origin";
import { numberVerification, simSwap, kycMatch } from "@/lib/nac";
import { computeTrustScore } from "@/lib/trust-score";
import {
  getNumberVerificationRequest,
  updateNumberVerificationRequest,
  saveVerification,
  type VerificationRecord,
} from "@/lib/firestore";

// https://trustgate--openg-hack26bar-512.us-central1.hosted.app/api/v1/verifications/number-verification/callback?state=nv_mm9dys88_21f063ab&error=invalid_request&error_description=Unknown%20device

/**
 * Callback for the number verification redirect flow.
 * Receives code and state, completes number verification, then runs SIM swap + KYC
 * using the stored request, writes the full verification to the verifications table,
 * and redirects the user to redirect_uri with verification_id and outcome.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    const errorDescription = searchParams.get("error_description");
    return NextResponse.json(
      {
        error: "Missing code or state",
        code: "NUMBER_VERIFICATION_CALLBACK_INVALID",
        message:
          errorDescription ??
          "Redirect must include code and state query parameters.",
      },
      { status: 400 }
    );
  }

  const record = await getNumberVerificationRequest(state);
  if (!record) {
    return NextResponse.json(
      {
        error: "Verification request not found",
        code: "NUMBER_VERIFICATION_NOT_FOUND",
        message: "The request ID (state) is invalid or expired.",
      },
      { status: 404 }
    );
  }

  if (record.status !== "pending") {
    const finalOrigin = getRequestOrigin(request);
    const redirectUrl = new URL(
      record.redirect_uri ?? `${finalOrigin}/dashboard`
    );
    redirectUrl.searchParams.set("number_verification", "already_completed");
    redirectUrl.searchParams.set("state", state);
    if (record.verification_id) {
      redirectUrl.searchParams.set("verification_id", record.verification_id);
    }
    return NextResponse.redirect(redirectUrl.toString());
  }

  const phoneNumber = record.phone_number;
  const country = record.country;
  const { claims, checks, policy, metadata } = record;

  try {
    const numVer = await numberVerification(phoneNumber, country, {
      code,
      state,
    });

    const [simSwapRes, kycRes] = await Promise.all([
      checks.includes("sim_swap")
        ? simSwap(phoneNumber, country)
        : Promise.resolve({ swapped: false, last_swap_hours_ago: 999 }),
      checks.includes("kyc_match")
        ? kycMatch(phoneNumber, country, claims)
        : Promise.resolve({ match: true, match_level: "high" as const }),
    ]);

    const { trust_score, checks: checkResults, decision } = computeTrustScore(
      numVer,
      simSwapRes,
      kycRes,
      policy
    );

    const status = decision === "allow" ? "approved" : "denied";
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const verificationId = `ver_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

    const verificationRecord: VerificationRecord = {
      verification_id: verificationId,
      request_id: verificationId,
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
    await saveVerification(verificationRecord);

    await updateNumberVerificationRequest(state, {
      status: numVer.verified ? "completed" : "failed",
      verified: numVer.verified,
      completed_at: now.toISOString(),
      error: numVer.detail,
      verification_id: verificationId,
    });

    const finalOrigin = getRequestOrigin(request);
    const redirectUrl = new URL(
      record.redirect_uri ?? `${finalOrigin}/dashboard`
    );
    redirectUrl.searchParams.set(
      "number_verification",
      numVer.verified ? "success" : "failed"
    );
    redirectUrl.searchParams.set("state", state);
    redirectUrl.searchParams.set("verification_id", verificationId);
    redirectUrl.searchParams.set("status", status);
    redirectUrl.searchParams.set("trust_score", String(trust_score));
    if (numVer.detail)
      redirectUrl.searchParams.set("detail", numVer.detail);

    return NextResponse.redirect(redirectUrl.toString());
  } catch (err) {
    console.error("[NAC] number-verification callback error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    await updateNumberVerificationRequest(state, {
      status: "failed",
      verified: false,
      completed_at: new Date().toISOString(),
      error: message,
    });

    const finalOrigin = getRequestOrigin(request);
    const redirectUrl = new URL(
      record.redirect_uri ?? `${finalOrigin}/dashboard`
    );
    redirectUrl.searchParams.set("number_verification", "error");
    redirectUrl.searchParams.set("state", state);
    redirectUrl.searchParams.set("detail", message);

    return NextResponse.redirect(redirectUrl.toString());
  }
}
