import { NextRequest, NextResponse } from "next/server";
import { getRequestOrigin } from "@/lib/get-request-origin";
import { numberVerification, simSwap, kycMatch } from "@/lib/nac";
import { computeTrustScoreWithGemini } from "@/lib/trust-score-gemini";
import { getVerification, completeVerification } from "@/lib/firestore";
import { sanitizeErrorMessage, sanitizeCheckResults } from "@/lib/sanitize-pii";
import type { StoredCheckInputs } from "@/lib/verification-types";

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

  if (!state) {
    const message = "Redirect must include state query parameter.";
    const finalOrigin = getRequestOrigin(request);
    const redirectUrl = new URL(`${finalOrigin}/demo/verification-popup`);
    redirectUrl.searchParams.set("error_message", message);
    return NextResponse.redirect(redirectUrl.toString());
  }

  if (searchParams.has("error_description") && searchParams.get("error_description")) {
    const record = await getVerification(state);
    if (record?.status === "pending") {
      const rawMessage = searchParams.get("error_description")!;
      const message = sanitizeErrorMessage(rawMessage);
      const policy = record.policy ?? { min_trust_score: 75 };
      const syntheticNumVer = { verified: false as const, detail: message };
      const syntheticSimSwap = { swapped: false, last_swap_hours_ago: 999 };
      const syntheticKycMatch = { match: false as const, match_level: "none" as const };
      const result = await computeTrustScoreWithGemini(
        syntheticNumVer,
        syntheticSimSwap,
        syntheticKycMatch,
        policy
      );
      const sanitizedCheckResults = sanitizeCheckResults(result.checks);
      const check_inputs: StoredCheckInputs = {
        number_verification: { verified: syntheticNumVer.verified, ...(syntheticNumVer.detail && { detail: syntheticNumVer.detail }) },
        sim_swap: { swapped: syntheticSimSwap.swapped, ...(syntheticSimSwap.last_swap_hours_ago !== undefined && { last_swap_hours_ago: syntheticSimSwap.last_swap_hours_ago }) },
        kyc_match: { match: syntheticKycMatch.match, ...(syntheticKycMatch.match_level && { match_level: syntheticKycMatch.match_level }) },
      };
      await completeVerification(state, {
        status: "denied",
        trust_score: result.trust_score,
        decision: result.decision,
        check_inputs,
        check_results: sanitizedCheckResults,
        completed_at: new Date().toISOString(),
        expires_at: null,
        ...(result.risk_level != null && { risk_level: result.risk_level }),
        ...(result.summary != null && result.summary !== "" && { summary: result.summary }),
        ...(result.recommendation != null && result.recommendation !== "" && { recommendation: result.recommendation }),
      });
    }
  }

  if (!code) {
    const message = "Redirect must include code query parameter.";
    const finalOrigin = getRequestOrigin(request);
    const redirectUrl = new URL(`${finalOrigin}/demo/verification-popup`);
    redirectUrl.searchParams.set("error_message", message);
    if (state) redirectUrl.searchParams.set("state", state);
    return NextResponse.redirect(redirectUrl.toString());
  }

  const record = await getVerification(state);
  if (!record) {
    const message = sanitizeErrorMessage("The request ID (state) is invalid or expired.");
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

  const subject = record.subject;
  if (!subject) {
    const message = sanitizeErrorMessage("Verification data incomplete.");
    const finalOrigin = getRequestOrigin(request);
    const redirectUrl = `${finalOrigin}/demo/verification-popup?error_message=${encodeURIComponent(message)}&state=${encodeURIComponent(state)}`;
    return NextResponse.redirect(redirectUrl);
  }
  const phoneNumber = subject.phone_number;
  const country = subject.country;
  const claims = { ...(record.claims ?? {}), country };
  const { checks, policy } = record;

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
        ? kycMatch(phoneNumber, claims)
        : Promise.resolve({ match: true, match_level: "high" as const }),
    ]);

    const result = await computeTrustScoreWithGemini(
      numVer,
      simSwapRes,
      kycRes,
      policy
    );

    const status = result.decision === "allow" ? "approved" : "denied";
    const now = new Date();
    const sanitizedCheckResults = sanitizeCheckResults(result.checks);
    const sanitizedError = numVer.detail ? sanitizeErrorMessage(numVer.detail) : undefined;
    const check_inputs: StoredCheckInputs = {
      number_verification: { verified: numVer.verified, ...(numVer.detail && { detail: numVer.detail }) },
      sim_swap: {
        swapped: simSwapRes.swapped,
        ...(simSwapRes.last_swap_hours_ago !== undefined && { last_swap_hours_ago: simSwapRes.last_swap_hours_ago }),
        ...("detail" in simSwapRes && simSwapRes.detail && { detail: simSwapRes.detail }),
      },
      kyc_match: {
        match: kycRes.match,
        ...(kycRes.match_level && { match_level: kycRes.match_level }),
        ...("verified_claims" in kycRes && kycRes.verified_claims && { verified_claims: kycRes.verified_claims }),
        ...("raw_match_results" in kycRes && kycRes.raw_match_results && { raw_match_results: kycRes.raw_match_results }),
        ...("selected_claim_keys" in kycRes && kycRes.selected_claim_keys && { selected_claim_keys: kycRes.selected_claim_keys }),
      },
    };

    await completeVerification(state, {
      status,
      trust_score: result.trust_score,
      decision: result.decision,
      check_inputs,
      check_results: sanitizedCheckResults,
      completed_at: now.toISOString(),
      expires_at: null,
      ...(result.risk_level != null && { risk_level: result.risk_level }),
      ...(result.summary != null && result.summary !== "" && { summary: result.summary }),
      ...(result.recommendation != null && result.recommendation !== "" && { recommendation: result.recommendation }),
      ...(sanitizedError && { error: sanitizedError }),
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
    redirectUrl.searchParams.set("trust_score", String(result.trust_score));
    if (sanitizedError)
      redirectUrl.searchParams.set("detail", sanitizedError);

    return NextResponse.redirect(redirectUrl.toString());
  } catch (err) {
    console.error("[NAC] number-verification callback error:", err);
    const rawMessage = err instanceof Error ? err.message : "Unknown error";
    const message = sanitizeErrorMessage(rawMessage);
    await completeVerification(state, {
      status: "denied",
      trust_score: 0,
      decision: "deny",
      check_results: [],
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
