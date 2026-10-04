import { createHmac, timingSafeEqual } from "node:crypto";

// TOTP (RFC 6238): 6 digits, 30 second steps, HMAC-SHA1, the format every authenticator app
// reads. Better Auth's two-factor plugin uses the secret string itself as the key, so the code
// here does the same: a code made by the plugin and a code checked here agree.

export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
/** Codes from one step before and after are accepted, for clock drift. */
const WINDOW_STEPS = 1;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32(bytes: Buffer): string {
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) {
    out += ALPHABET[Number.parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  }
  return out;
}

export function totpCode(secret: string, atMs: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 1000 / TOTP_PERIOD_SECONDS)));
  const hmac = createHmac("sha1", Buffer.from(secret)).update(counter).digest();
  const offset = (hmac[hmac.length - 1] as number) & 0x0f;
  const value = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/** True when `code` is the current code (or one step either side). Constant time per candidate. */
export function verifyTotp(secret: string, code: string, nowMs: number = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  let ok = false;
  for (let step = -WINDOW_STEPS; step <= WINDOW_STEPS; step++) {
    const expected = Buffer.from(totpCode(secret, nowMs + step * TOTP_PERIOD_SECONDS * 1000));
    if (timingSafeEqual(expected, Buffer.from(code))) ok = true;
  }
  return ok;
}

/** The otpauth:// address an authenticator app reads from the QR code. */
export function totpUri(input: { secret: string; issuer: string; account: string }): string {
  const label = `${encodeURIComponent(input.issuer)}:${encodeURIComponent(input.account)}`;
  const query = new URLSearchParams({
    secret: base32(Buffer.from(input.secret)),
    issuer: input.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
