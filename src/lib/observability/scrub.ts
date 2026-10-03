import { REDACTED, redact } from "../logging/redact";

// PII scrubbing for Sentry events (browser and server). Sentry receives the same
// redaction as the logs (backend-architecture.md section 15): no request bodies, no
// cookies or auth headers, no query strings, no user details beyond an internal ID,
// and no phone numbers or email addresses inside messages.

const HEADERS_TO_KEEP = new Set([
  "user-agent",
  "accept",
  "accept-language",
  "content-type",
  "referer",
]);
const PHONE_IN_TEXT = /\+?\d[\d\s().-]{8,}\d/g;
const EMAIL_IN_TEXT = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const BEARER_IN_TEXT = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;

/** Masks phone numbers, email addresses and bearer tokens inside free text. */
export function scrubText(text: string): string {
  return text
    .replace(EMAIL_IN_TEXT, REDACTED)
    .replace(BEARER_IN_TEXT, REDACTED)
    .replace(PHONE_IN_TEXT, REDACTED);
}

/** A URL with its query string and fragment removed; they can hold tokens or search terms. */
export function scrubUrl(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

type Loose = Record<string, unknown>;

function scrubStrings(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrubText(value);
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => scrubStrings(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Loose).map(([key, inner]) => [key, scrubStrings(inner, depth + 1)]),
  );
}

/**
 * For Sentry's beforeSend and beforeBreadcrumb. Takes an event-shaped object and
 * returns a scrubbed copy. Generic so it works for error events and transactions.
 */
export function scrubEvent<T extends object>(input: T): T {
  const event = { ...(input as Loose) };

  const request = event.request as Loose | undefined;
  if (request) {
    const headers = (request.headers ?? {}) as Record<string, string>;
    const kept = Object.fromEntries(
      Object.entries(headers).filter(([name]) => HEADERS_TO_KEEP.has(name.toLowerCase())),
    );
    event.request = {
      ...(typeof request.method === "string" ? { method: request.method } : {}),
      ...(typeof request.url === "string" ? { url: scrubUrl(request.url) } : {}),
      headers: kept,
      // No cookies, no query string, no body.
    };
  }

  // Keep only an internal ID. Never an email, phone, name or IP.
  const user = event.user as Loose | undefined;
  if (user) {
    event.user = typeof user.id === "string" ? { id: user.id } : undefined;
  }

  if (event.extra) event.extra = redact(scrubStrings(event.extra));
  if (event.contexts) event.contexts = redact(scrubStrings(event.contexts));
  if (event.tags) event.tags = redact(scrubStrings(event.tags));
  if (typeof event.message === "string") event.message = scrubText(event.message);
  if (typeof event.transaction === "string") event.transaction = scrubUrl(event.transaction);
  if (event.server_name) delete event.server_name;

  const exception = event.exception as { values?: Loose[] } | undefined;
  if (exception?.values) {
    event.exception = {
      ...exception,
      values: exception.values.map((entry) => ({
        ...entry,
        ...(typeof entry.value === "string" ? { value: scrubText(entry.value) } : {}),
      })),
    };
  }

  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = (event.breadcrumbs as Loose[]).map(scrubBreadcrumb);
  }

  return event as T;
}

export function scrubBreadcrumb<T extends object>(input: T): T {
  const crumb = { ...(input as Loose) };
  if (typeof crumb.message === "string") crumb.message = scrubText(crumb.message);
  if (crumb.data) {
    const data = redact(scrubStrings(crumb.data)) as Loose;
    if (typeof data.url === "string") data.url = scrubUrl(data.url);
    if (typeof data.to === "string") data.to = scrubUrl(data.to);
    if (typeof data.from === "string") data.from = scrubUrl(data.from);
    delete data.request_body_size;
    crumb.data = data;
  }
  return crumb as T;
}

/** Shared options for every runtime (server, edge, browser). */
export function sentryBaseOptions(dsn: string, environment: string) {
  return {
    dsn,
    environment,
    sendDefaultPii: false,
    // Sample sparingly until traffic is known (P11).
    tracesSampleRate: 0.05,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
