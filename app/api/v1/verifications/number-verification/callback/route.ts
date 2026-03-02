import { NextRequest, NextResponse } from "next/server";
import { getRequestOrigin } from "@/lib/get-request-origin";
import { numberVerification, simSwap, kycMatch } from "@/lib/nac";
import { computeTrustScore } from "@/lib/trust-score";
import {
  getVerification,
  updateVerification,
} from "@/lib/firestore";

// https://trustgate--openg-hack26bar-512.us-central1.hosted.app/api/v1/verifications/number-verification/callback?state=nv_mm9dys88_21f063ab&error=invalid_request&error_description=Unknown%20device

/**
 * Callback for the number verification redirect flow.
 * Receives code and state, loads the verification by state, completes number verification,
 * runs SIM swap + KYC, then updates the same document (status: approved/denied) and
 * redirects the user to redirect_uri with verification_id and outcome.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    const message =
      searchParams.get("error_description") ??
      "Redirect must include code and state query parameters.";
    const finalOrigin = getRequestOrigin(request);
    const redirectUrl = `${finalOrigin}/demo/verification-popup?error_message=${encodeURIComponent(message)}`;
    return NextResponse.redirect(redirectUrl);
  }

  const record = await getVerification(state);
  if (!record) {
    const message = "The request ID (state) is invalid or expired.";
    const finalOrigin = getRequestOrigin(request);
    const redirectUrl = `${finalOrigin}/demo/verification-popup?error_message=${encodeURIComponent(message)}&state=${encodeURIComponent(state)}`;
    return NextResponse.redirect(redirectUrl);
  }

  if (record.status !== "pending") {
    const finalOrigin = getRequestOrigin(request);
    const redirectUrl = new URL(
      record.redirect_uri ?? `${finalOrigin}/demo`
    );
    redirectUrl.searchParams.set("number_verification", "already_completed");
    redirectUrl.searchParams.set("state", state);
    redirectUrl.searchParams.set("verification_id", record.verification_id);
    return NextResponse.redirect(redirectUrl.toString());
  }

  const phoneNumber = record.subject.phone_number;
  const country = record.subject.country;
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

    await updateVerification(state, {
      status,
      trust_score,
      decision,
      check_results: checkResults,
      completed_at: now.toISOString(),
      expires_at: null,
      ...(numVer.detail && { error: numVer.detail }),
    });

    const finalOrigin = getRequestOrigin(request);
    const redirectUrl = new URL(
      record.redirect_uri ?? `${finalOrigin}/demo`
    );
    redirectUrl.searchParams.set(
      "number_verification",
      numVer.verified ? "success" : "failed"
    );
    redirectUrl.searchParams.set("state", state);
    redirectUrl.searchParams.set("verification_id", record.verification_id);
    redirectUrl.searchParams.set("status", status);
    redirectUrl.searchParams.set("trust_score", String(trust_score));
    if (numVer.detail)
      redirectUrl.searchParams.set("detail", numVer.detail);

    return NextResponse.redirect(redirectUrl.toString());
  } catch (err) {
    console.error("[NAC] number-verification callback error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    await updateVerification(state, {
      status: "denied",
      completed_at: new Date().toISOString(),
      expires_at: null,
      error: message,
    });

    const finalOrigin = getRequestOrigin(request);
    const redirectUrl = new URL(
      record.redirect_uri ?? `${finalOrigin}/demo/verification-popup`
    );
    redirectUrl.searchParams.set("state", state);
    redirectUrl.searchParams.set("error_message", message);

    return NextResponse.redirect(redirectUrl.toString());
  }
}
