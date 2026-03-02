import type { NumberVerificationResult, SimSwapResult, KycMatchResult } from "./nac";

export interface CheckResult {
  name: string;
  status: "pass" | "fail";
  detail?: Record<string, unknown>;
}

export function computeTrustScore(
  numberVerification: NumberVerificationResult,
  simSwap: SimSwapResult,
  kycMatch: KycMatchResult,
  policy: { min_trust_score: number; sim_swap_max_age_hours?: number }
): { trust_score: number; checks: CheckResult[]; decision: "allow" | "deny" } {
  const simSwapMaxHours = policy.sim_swap_max_age_hours ?? 72;
  const checks: CheckResult[] = [];

  const numVerPass = numberVerification.verified;
  checks.push({
    name: "number_verification",
    status: numVerPass ? "pass" : "fail",
    detail: numberVerification.detail ? { message: numberVerification.detail } : undefined,
  });

  const simOk = !simSwap.swapped && (simSwap.last_swap_hours_ago ?? 999) >= simSwapMaxHours;
  checks.push({
    name: "sim_swap",
    status: simOk ? "pass" : "fail",
    detail: { last_swap_hours_ago: simSwap.last_swap_hours_ago },
  });

  const kycOk = kycMatch.match && (kycMatch.match_level === "high" || kycMatch.match_level === "medium");
  checks.push({
    name: "kyc_match",
    status: kycOk ? "pass" : "fail",
    detail: { match_level: kycMatch.match_level },
  });

  let score = 0;
  if (numVerPass) score += 35;
  if (simOk) score += 35;
  if (kycOk) score += 30;
  else if (kycMatch.match) score += 15;

  const decision: "allow" | "deny" = score >= policy.min_trust_score ? "allow" : "deny";
  return { trust_score: Math.min(100, score), checks, decision };
}
