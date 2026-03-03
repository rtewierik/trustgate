/**
 * Shared types for verification check inputs (NAC results) stored on verification
 * and feedback records. No PII; used so Gemini can compare current verification
 * to past corrections and infer whether a correction should apply.
 */

export interface StoredCheckInputs {
  number_verification: { verified: boolean; detail?: string };
  sim_swap: { swapped: boolean; last_swap_hours_ago?: number; detail?: string };
  kyc_match: {
    match: boolean;
    match_level?: string;
    verified_claims?: Record<string, "true" | "false" | "not_available">;
  };
}
