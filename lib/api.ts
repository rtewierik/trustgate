/** Base URL for API requests. Empty string when running in browser (same origin). */
export const API_BASE =
  typeof window !== "undefined" ? "" : process.env.NEXT_PUBLIC_API_URL || "";
