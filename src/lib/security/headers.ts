// Security headers and the Origin check used by src/proxy.ts. Pure functions so
// they can be tested without a running server.

export type HeaderOptions = {
  nonce: string;
  production: boolean;
  pathname: string;
};

/** Pages that may use the camera and microphone: the patient and doctor call screens only. */
const CALL_PATHS = [/^\/consultation\/[^/]+(\/|$)/, /^\/doctor\/consultations\/[^/]+(\/|$)/];

export function allowsMedia(pathname: string): boolean {
  return CALL_PATHS.some((pattern) => pattern.test(pathname));
}

export function buildCsp({
  nonce,
  production,
}: Pick<HeaderOptions, "nonce" | "production">): string {
  const directives = [
    "default-src 'self'",
    // strict-dynamic lets the nonce-approved Next.js scripts load their chunks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${production ? "" : " 'unsafe-eval'"}`,
    `style-src 'self' 'nonce-${nonce}'`,
    // Style attributes (chart widths, progress bars) cannot carry a nonce.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "media-src 'self' blob:",
    // Development needs a websocket for hot reload. The video SDK origin is added with P6.
    `connect-src 'self'${production ? "" : " ws://localhost:* ws://127.0.0.1:*"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (production) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function buildPermissionsPolicy(pathname: string): string {
  const media = allowsMedia(pathname) ? "(self)" : "()";
  return [
    `camera=${media}`,
    `microphone=${media}`,
    "geolocation=()",
    "payment=(self)",
    "usb=()",
    "serial=()",
    "bluetooth=()",
    "interest-cohort=()",
  ].join(", ");
}

export function securityHeaders(options: HeaderOptions): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Security-Policy": buildCsp(options),
    "Permissions-Policy": buildPermissionsPolicy(options.pathname),
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  // HSTS is only sent in production, where the site is served over HTTPS.
  if (options.production) {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }
  return headers;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Paths that are called by other servers and carry a signature instead of an Origin. */
const SIGNED_PATHS = [/^\/api\/webhooks\//];

export type OriginCheckInput = {
  method: string;
  pathname: string;
  origin: string | null;
  host: string | null;
  allowedOrigins: readonly string[];
  /** Also accept an Origin whose host equals the request Host. Development only: it ignores the scheme. */
  allowHostMatch?: boolean;
};

/** True when a mutating request comes from our own site. Safe methods always pass. */
export function isOriginAllowed({
  method,
  pathname,
  origin,
  host,
  allowedOrigins,
  allowHostMatch = false,
}: OriginCheckInput): boolean {
  if (!MUTATING.has(method.toUpperCase())) return true;
  if (SIGNED_PATHS.some((pattern) => pattern.test(pathname))) return true;
  if (!origin || origin === "null") return false;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (allowedOrigins.includes(parsed.origin)) return true;
  return allowHostMatch && host !== null && parsed.host === host;
}
