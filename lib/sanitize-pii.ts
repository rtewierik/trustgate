/**
 * Sanitize data before persisting or returning to clients so that no PII
 * is stored or exposed once a verification is completed (approved/denied).
 */

/** Safe error messages that never contain PII. */
const SAFE_ERROR_CODES: Record<string, string> = {
  invalid_request: "Invalid request",
  invalid_grant: "Authorization failed or expired",
  expired: "Verification expired",
  access_denied: "Access denied",
  unknown_device: "Unknown device",
};

/**
 * Returns a generic error message safe to store and show to users.
 * Never includes raw provider messages or stack traces that might contain PII.
 */
export function sanitizeErrorMessage(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "Verification failed";
  const lower = trimmed.toLowerCase();
  for (const [code, message] of Object.entries(SAFE_ERROR_CODES)) {
    if (lower.includes(code)) return message;
  }
  return "Verification failed";
}

/** Keys allowed in check_result.detail (non-PII). */
const ALLOWED_DETAIL_KEYS = new Set(["last_swap_hours_ago", "match_level", "explanation", "weight_impact"]);

/**
 * Returns a detail object with only non-PII keys.
 * Drops "message" and any other keys that might contain user data.
 */
export function sanitizeCheckResultDetail(
  detail: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!detail || typeof detail !== "object") return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (ALLOWED_DETAIL_KEYS.has(key) && value !== undefined) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Sanitize the check_results array so no detail contains PII.
 */
export function sanitizeCheckResults(
  checks: Array<{ name: string; status: string; detail?: Record<string, unknown> }>
): Array<{ name: string; status: string; detail?: Record<string, unknown> }> {
  return checks.map((c) => ({
    name: c.name,
    status: c.status,
    detail: sanitizeCheckResultDetail(c.detail),
  }));
}
