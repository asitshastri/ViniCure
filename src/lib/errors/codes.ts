// One table for every API error code. Add a code here, never build a response by hand.
// `detail` is the safe default text shown to the caller. Keep it free of personal data.

export const ERROR_CODES = {
  bad_request: {
    status: 400,
    title: "Bad request",
    detail: "The request could not be understood.",
  },
  captcha_failed: {
    status: 400,
    title: "Captcha check failed",
    detail: "Complete the check and try again.",
  },
  invalid_json: {
    status: 400,
    title: "Invalid JSON",
    detail: "The request body is not valid JSON.",
  },
  unauthenticated: { status: 401, title: "Sign in required", detail: "Sign in to continue." },
  payment_signature_invalid: {
    status: 400,
    title: "Payment signature invalid",
    detail: "The payment could not be verified.",
  },
  forbidden: { status: 403, title: "Forbidden", detail: "You do not have access to this." },
  fresh_login_required: {
    status: 403,
    title: "Sign in again",
    detail: "For your safety, sign in again to do this.",
  },
  consent_required: {
    status: 403,
    title: "Consent required",
    detail: "Consent is needed before this can continue.",
  },
  outside_join_window: {
    status: 403,
    title: "Outside join window",
    detail: "This consultation cannot be joined at this time.",
  },
  not_found: { status: 404, title: "Not found", detail: "We could not find that." },
  method_not_allowed: {
    status: 405,
    title: "Method not allowed",
    detail: "This method is not supported here.",
  },
  slot_taken: { status: 409, title: "Slot taken", detail: "That slot was just booked." },
  conflict: { status: 409, title: "Conflict", detail: "This conflicts with the current state." },
  payload_too_large: {
    status: 413,
    title: "Payload too large",
    detail: "The request is larger than allowed.",
  },
  file_rejected: { status: 422, title: "File rejected", detail: "That file cannot be accepted." },
  idempotency_conflict: {
    status: 422,
    title: "Idempotency conflict",
    detail: "This key was already used for a different request.",
  },
  validation_failed: {
    status: 422,
    title: "Validation failed",
    detail: "Some fields are missing or invalid.",
  },
  rate_limited: {
    status: 429,
    title: "Too many requests",
    detail: "Too many requests. Try again shortly.",
  },
  internal_error: {
    status: 500,
    title: "Something went wrong",
    detail: "Something went wrong on our side. Try again.",
  },
  unavailable: {
    status: 503,
    title: "Service unavailable",
    detail: "This service is temporarily unavailable. Try again shortly.",
  },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
