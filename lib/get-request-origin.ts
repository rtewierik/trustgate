import type { NextRequest } from "next/server";

/**
 * Get the public origin for the request. Use this instead of request.nextUrl.origin
 * when running behind a reverse proxy (e.g. Cloud Run, Firebase App Hosting), where
 * nextUrl may reflect the container address (0.0.0.0:8080) rather than the real host.
 * Reads X-Forwarded-Host and X-Forwarded-Proto when present.
 */
export function getRequestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) {
    const protocol =
      forwardedProto === "https" || forwardedProto === "http"
        ? forwardedProto
        : "https";
    return `${protocol}://${forwardedHost}`;
  }
  return request.nextUrl.origin;
}
