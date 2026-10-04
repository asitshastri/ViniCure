// Security headers and the Origin check used by src/proxy.ts. Pure functions so
// they can be tested without a running server.

export type HeaderOptions = {
  nonce: string;
  production: boolean;
  pathname: string;
  /** Extra origins the browser may send data to, such as the error-tracking ingest host. */
  connectOrigins?: readonly string[];
};

/** Pages that may use the camera and microphone: the patient and doctor call screens only. */
const CALL_PATHS = [/^\/consultation\/[^/]+(\/|$)/, /^\/doctor\/consultations\/[^/]+(\/|$)/];

export function allowsMedia(pathname: string): boolean {
  return CALL_PATHS.some((pattern) => pattern.test(pathname));
}

/**
 * The booking page opens Razorpay's checkout widget: its script, its frame and its few calls are
 * allowed there and nowhere else, so the rest of the site keeps the strict policy.
 */
const CHECKOUT_PATHS = [/^\/book\/[^/]+\/?$/];
const RAZORPAY = {
  script: "https://checkout.razorpay.com",
  frame: "https://api.razorpay.com",
  connect: ["https://api.razorpay.com", "https://lumberjack.razorpay.com"],
  img: "https://cdn.razorpay.com",
};

export function allowsCheckout(pathname: string): boolean {
  return CHECKOUT_PATHS.some((pattern) => pattern.test(pathname));
}

export function buildCsp({
  nonce,
  production,
  connectOrigins = [],
  pathname = "/",
}: Pick<HeaderOptions, "nonce" | "production" | "connectOrigins"> & { pathname?: string }): string {
  const checkout = allowsCheckout(pathname);
  const connect = [...connectOrigins, ...(checkout ? RAZORPAY.connect : [])];
  const directives = [
    "default-src 'self'",
    // strict-dynamic lets the nonce-approved Next.js scripts load their chunks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${checkout ? ` ${RAZORPAY.script}` : ""}${production ? "" : " 'unsafe-eval'"}`,
    `style-src 'self' 'nonce-${nonce}'`,
    // Style attributes (chart widths, progress bars) cannot carry a nonce.
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' blob: data:${checkout ? ` ${RAZORPAY.img}` : ""}`,
    "font-src 'self'",
    "media-src 'self' blob:",
    // Development needs a websocket for hot reload. The video SDK origin is added with P6.
    `connect-src 'self'${connect.map((origin) => ` ${origin}`).join("")}${production ? "" : " ws://localhost:* ws://127.0.0.1:*"}`,
    ...(checkout ? [`frame-src 'self' ${RAZORPAY.frame}`] : []),
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
    allowsCheckout(pathname) ? `payment=(self "${RAZORPAY.frame}")` : "payment=(self)",
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
    // The widget may open a bank or UPI page in a popup and needs to hear back from it.
    "Cross-Origin-Opener-Policy": allowsCheckout(options.pathname)
      ? "same-origin-allow-popups"
      : "same-origin",
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
