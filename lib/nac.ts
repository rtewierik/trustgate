/**
 * Nokia Network as Code (CAMARA) API client.
 * Replace with real SDK when NAC_API_KEY and NAC_BASE_URL are set.
 * See: https://networkascode.nokia.io/docs
 */

const NAC_BASE_URL = process.env.NAC_BASE_URL || "https://network-as-code.nokia.com";
const NAC_API_KEY = process.env.NAC_API_KEY;

export interface NumberVerificationResult {
  verified: boolean;
  detail?: string;
}

export interface SimSwapResult {
  swapped: boolean;
  last_swap_hours_ago?: number;
  detail?: string;
}

export interface KycMatchResult {
  match: boolean;
  match_level?: "high" | "medium" | "low" | "none";
  detail?: string;
}

export async function numberVerification(phoneNumber: string, _country: string): Promise<NumberVerificationResult> {
  if (!NAC_API_KEY) {
    return { verified: true, detail: "mock: no NAC key" };
  }
  try {
    const res = await fetch(`${NAC_BASE_URL}/number-verification/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NAC_API_KEY}`,
      },
      body: JSON.stringify({ phoneNumber }),
    });
    const data = (await res.json()) as { verified?: boolean };
    return { verified: !!data.verified, detail: res.status === 200 ? undefined : await res.text() };
  } catch (e) {
    return { verified: false, detail: String(e) };
  }
}

export async function simSwap(phoneNumber: string, _country: string): Promise<SimSwapResult> {
  if (!NAC_API_KEY) {
    return { swapped: false, last_swap_hours_ago: 999, detail: "mock: no NAC key" };
  }
  try {
    const res = await fetch(`${NAC_BASE_URL}/sim-swap/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NAC_API_KEY}`,
      },
      body: JSON.stringify({ phoneNumber }),
    });
    const data = (await res.json()) as { swapped?: boolean; lastSwapHoursAgo?: number };
    return {
      swapped: !!data.swapped,
      last_swap_hours_ago: data.lastSwapHoursAgo ?? 999,
      detail: res.status === 200 ? undefined : await res.text(),
    };
  } catch (e) {
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
    const res = await fetch(`${NAC_BASE_URL}/kyc/match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NAC_API_KEY}`,
      },
      body: JSON.stringify({ phoneNumber, country, ...claims }),
    });
    const data = (await res.json()) as { match?: boolean; matchLevel?: string };
    return {
      match: !!data.match,
      match_level: (data.matchLevel as KycMatchResult["match_level"]) ?? "high",
      detail: res.status === 200 ? undefined : await res.text(),
    };
  } catch (e) {
    return { match: false, match_level: "none", detail: String(e) };
  }
}
