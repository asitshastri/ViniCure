// Redaction for log objects. Runs on every log call, so a field added later is
// still masked if its key looks sensitive. Messages are not scanned: never put
// personal data in a log message, pass it as a field instead.

export const REDACTED = "[REDACTED]";

const EXACT_KEYS = new Set([
  "phone",
  "phonenumber",
  "mobile",
  "mobilenumber",
  "email",
  "emailaddress",
  "name",
  "fullname",
  "firstname",
  "lastname",
  "displayname",
  "address",
  "addressline",
  "otp",
  "authorization",
  "cookie",
  "setcookie",
  "password",
  "passcode",
  "pin",
  "totp",
  "secret",
  "apikey",
  "dob",
  "dateofbirth",
]);

const PARTIAL_KEYS = ["token", "password", "secret", "cookie", "credential", "otp"];

const MAX_DEPTH = 8;

// Normalises "phone_number", "phoneNumber" and "Phone-Number" to "phonenumber".
function normalise(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isSensitiveKey(key: string): boolean {
  // Encrypted columns: notes_enc, notes-enc, notesEnc.
  if (/[_-]enc$/i.test(key) || /[a-z0-9]Enc$/.test(key)) return true;
  const flat = normalise(key);
  if (EXACT_KEYS.has(flat)) return true;
  return PARTIAL_KEYS.some((part) => flat.includes(part));
}

export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[TRUNCATED]";
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1, seen));
  }
  if (value instanceof Date) return value;

  const out: Record<string, unknown> = {};
  if (value instanceof Error) {
    // Keep type, message and stack for debugging. Extra fields are redacted below.
    out.type = value.name;
    out.message = value.message;
    out.stack = value.stack;
  }
  for (const [key, inner] of Object.entries(value)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redact(inner, depth + 1, seen);
  }
  return out;
}
