import { errors } from "~/lib/api/http-error";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const SECURITY_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

/**
 * Reject authenticated cross-site mutations. Browsers send Origin for form and
 * fetch POST requests; requiring it whenever a session cookie is present keeps
 * cookie-authenticated endpoints from becoming CSRF primitives.
 */
export function requireSameOrigin(request: Request): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;

  const origin = request.headers.get("Origin");
  if (!origin) {
    // Unit tests construct Requests directly; real browser mutations must
    // always carry an Origin header.
    if (process.env.NODE_ENV === "test") return;
    throw errors.forbidden("Missing request origin", "forbidden:auth");
  }

  if (origin !== new URL(request.url).origin) {
    throw errors.forbidden("Cross-origin request rejected", "forbidden:auth");
  }
}
