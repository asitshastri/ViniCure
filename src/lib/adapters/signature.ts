import { createHmac, timingSafeEqual } from "node:crypto";

/** Compares two strings in constant time (different lengths are simply unequal). */
export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export const hmacSha256Hex = (secret: string, data: string): string =>
  createHmac("sha256", secret).update(data).digest("hex");
