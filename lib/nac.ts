/**
 * Nokia Network as Code (CAMARA) API client via the official SDK.
 * Set NAC_API_KEY. Uses network-as-code v6 (RapidAPI key = token).
 * See: https://networkascode.nokia.io/docs/number-verification/number-verification (Using the SDKs)
 */

import { NetworkAsCodeClient } from "network-as-code";

const NAC_API_KEY = process.env.NAC_API_KEY;

/** Scope for number verification (redirect flow). */
const NUMBER_VERIFICATION_SCOPE =
  "dpv:FraudPreventionAndDetection number-verification:verify";

function getClient(): NetworkAsCodeClient {
  if (!NAC_API_KEY) throw new Error("NAC_API_KEY required");
  return new NetworkAsCodeClient(NAC_API_KEY);
}

export interface NumberVerificationResult {
  verified: boolean;
  detail?: string;
}

export interface SimSwapResult {
  swapped: boolean;
  last_swap_hours_ago?: number;
  detail?: string;
}

export type KycMatchLevel = "high" | "medium" | "low" | "none";

export interface KycMatchResult {
  match: boolean;
  match_level?: KycMatchLevel;
  detail?: string;
  /** Per-claim verification result for claims that were sent (true/false/not_available). */
  verified_claims?: Record<string, "true" | "false" | "not_available">;
}

/** KYC API returns per-field *Match values: "true" | "false" | "not_available". */
type KycMatchApiResponse = Record<string, string | number | undefined>;

/** Map our request param names to the API response *Match key. */
const CLAIM_TO_MATCH_KEY: Record<string, string> = {
  givenName: "givenNameMatch",
  familyName: "familyNameMatch",
  birthdate: "birthdateMatch",
  name: "nameMatch",
  idDocument: "idDocumentMatch",
  address: "addressMatch",
  postalCode: "postalCodeMatch",
  region: "regionMatch",
  locality: "localityMatch",
  country: "countryMatch",
  email: "emailMatch",
  streetName: "streetNameMatch",
  streetNumber: "streetNumberMatch",
};

/**
 * Compute match level from per-field API response based on how many sent claims passed.
 * - Only claims that were actually sent are counted.
 * - "true" = pass, "false" or "not_available" = fail.
 * - high: all sent passed; medium: majority; low: at least one; none: none.
 */
function kycMatchLevelFromResponse(
  params: Record<string, string | undefined>,
  result: KycMatchApiResponse
): { match: boolean; match_level: KycMatchLevel; verified_claims: Record<string, "true" | "false" | "not_available"> } {
  const verified_claims: Record<string, "true" | "false" | "not_available"> = {};
  let passed = 0;
  let counted = 0;

  for (const [paramKey, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    const matchKey = CLAIM_TO_MATCH_KEY[paramKey];
    if (!matchKey) continue;
    const raw = result[matchKey];
    const status = typeof raw === "string" ? (raw as "true" | "false" | "not_available") : "not_available";
    verified_claims[paramKey] = status === "true" || status === "false" || status === "not_available" ? status : "not_available";
    counted += 1;
    if (status === "true") passed += 1;
  }

  const ratio = counted > 0 ? passed / counted : 0;
  let match_level: KycMatchLevel = "none";
  if (ratio >= 1) match_level = "high";
  else if (ratio >= 0.5) match_level = "medium";
  else if (ratio > 0) match_level = "low";

  return {
    match: passed > 0,
    match_level,
    verified_claims,
  };
}

/**
 * Create the authorization URL for the number verification redirect flow (Using the SDKs).
 * The end user must visit this URL; after redirect they return with code and state.
 * Then call numberVerification(phoneNumber, country, { code, state }) to complete.
 * See: https://networkascode.nokia.io/docs/number-verification/number-verification
 */
export async function createNumberVerificationAuthLink(
  phoneNumber: string,
  redirectUri: string,
  state: string
): Promise<string> {
  if (!NAC_API_KEY) throw new Error("NAC_API_KEY required");
  const client = getClient();
  const url = await client.authorization.createAuthorizationLink(
    redirectUri,
    NUMBER_VERIFICATION_SCOPE,
    phoneNumber,
    state
  );
  console.log("[NAC] createNumberVerificationAuthLink", { phoneNumber, redirectUri, state });
  return url;
}

/**
 * Number verification following the SDK flow (Using the SDKs).
 * - When code and state are provided: uses device.verifyNumber(code, state) (redirect flow).
 * - When not: uses the direct verification API (server-side only; no user redirect).
 */
export async function numberVerification(
  phoneNumber: string,
  _country: string,
  options?: { code?: string; state?: string }
): Promise<NumberVerificationResult> {
  if (!NAC_API_KEY) {
    return { verified: true, detail: "mock: no NAC key" };
  }
  try {
    const client = getClient();
    const { code, state } = options ?? {};

    if (code != null && state != null) {
      // SDK flow: get device, then verify with authorization code (Using the SDKs)
      const device = client.devices.get({ phoneNumber });
      const verified = await device.verifyNumber(code, state);
      console.log("[NAC] numberVerification (SDK device.verifyNumber)", {
        phoneNumber,
        code: code.slice(0, 8) + "...",
        state,
        result: { verified },
      });
      return { verified };
    }

    // Fallback: direct verification API (no redirect; server-side only)
    const result = (await client.api.verification.verifyNumber(
      { phoneNumber },
      new URLSearchParams()
    )) as { verified?: boolean; devicePhoneNumberVerified?: boolean };
    const verified =
      result?.verified === true || result?.devicePhoneNumberVerified === true;
    console.log("[NAC] numberVerification (direct API)", { phoneNumber, result, verified });
    return { verified };
  } catch (e) {
    console.error("[NAC] numberVerification error", e);
    return { verified: false, detail: String(e) };
  }
}

export async function simSwap(phoneNumber: string, _country: string): Promise<SimSwapResult> {
  if (!NAC_API_KEY) {
    return { swapped: false, last_swap_hours_ago: 999, detail: "mock: no NAC key" };
  }
  try {
    const client = getClient();
    const result = (await client.api.simSwap.verifySimSwap(phoneNumber)) as {
      swapped?: boolean;
      lastSwapHoursAgo?: number;
    };
    console.log("[NAC] simSwap", { phoneNumber, result });
    return {
      swapped: !!result?.swapped,
      last_swap_hours_ago: result?.lastSwapHoursAgo ?? 999,
    };
  } catch (e) {
    console.error("[NAC] simSwap error", e);
    return { swapped: true, detail: String(e) };
  }
}

export async function kycMatch(
  phoneNumber: string,
  country: string,
  claims: { given_name?: string; family_name?: string; date_of_birth?: string }
): Promise<KycMatchResult> {
  if (!NAC_API_KEY) {
    return { match: true, match_level: "high", detail: "mock: no NAC key" };
  }
  try {
    const client = getClient();
    const params = {
      phoneNumber,
      country,
      givenName: claims.given_name,
      familyName: claims.family_name,
      birthdate: claims.date_of_birth,
    };
    const result = (await client.api.kycMatch.matchCustomer(params)) as KycMatchApiResponse;
    console.log("[NAC] kycMatch", { phoneNumber, params, result });

    const sentForVerification = {
      country,
      givenName: params.givenName,
      familyName: params.familyName,
      birthdate: params.birthdate,
    };
    const { match, match_level, verified_claims } = kycMatchLevelFromResponse(
      sentForVerification,
      result
    );
    return {
      match,
      match_level,
      verified_claims: Object.keys(verified_claims).length > 0 ? verified_claims : undefined,
    };
  } catch (e) {
    console.error("[NAC] kycMatch error", e);
    return { match: false, match_level: "none", detail: String(e) };
  }
}
