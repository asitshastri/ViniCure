import type { Role } from "@/lib/types";
import type { OtpRequestResult, OtpVerifyResult, StaffCodeResult, StaffSignInResult } from "./auth";

// The real sign-in calls (P2-12): the browser talks to /api/auth (Better Auth) and /api/v1.
// The session lives in an HttpOnly cookie that the server sets; nothing here stores a token.
// Replies never say whether an account exists: every failure of the password step is "invalid".

type Json = Record<string, unknown>;

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  let json: Json = {};
  try {
    json = (await response.json()) as Json;
  } catch {
    // An empty or non-JSON body is treated as "no details".
  }
  return { status: response.status, json, retryAfter: Number(response.headers.get("retry-after")) };
}

const minutes = (seconds: number) => Math.max(1, Math.ceil((seconds || 600) / 60));
const codeOf = (json: Json) => String(json.code ?? "");

/** +91 and the ten digits from the form (the schema already stripped other forms). */
export const toE164 = (tenDigits: string) => `+91${tenDigits}`;

export async function requestOtp(phone: string, captchaToken?: string): Promise<OtpRequestResult> {
  const { status, json, retryAfter } = await post(
    "/api/auth/phone-number/send-otp",
    { phoneNumber: toE164(phone) },
    captchaToken ? { "x-captcha-token": captchaToken } : {},
  );
  if (status === 200) return { status: "sent", resendInSeconds: 30 };
  if (status === 429) return { status: "rate_limited", retryInMinutes: minutes(retryAfter) };
  if (status === 400 && codeOf(json) === "captcha_failed") return { status: "captcha_failed" };
  return { status: "unavailable" };
}

export async function verifyOtp(phone: string, code: string): Promise<OtpVerifyResult> {
  const { status, json, retryAfter } = await post("/api/auth/phone-number/verify", {
    phoneNumber: toE164(phone),
    code,
  });
  if (status === 200) return { status: "ok" };
  if (status === 429) return { status: "locked", retryInMinutes: minutes(retryAfter) };
  const code2 = codeOf(json);
  if (code2 === "TOO_MANY_ATTEMPTS") return { status: "locked", retryInMinutes: 15 };
  if (code2 === "OTP_EXPIRED" || code2 === "OTP_NOT_FOUND") return { status: "expired" };
  if (status === 403) return { status: "unavailable" };
  return { status: "wrong" };
}

export async function setDisplayName(name: string): Promise<void> {
  await post("/api/auth/update-user", { name });
}

export async function signIn(email: string, password: string): Promise<StaffSignInResult> {
  const { status, json, retryAfter } = await post("/api/auth/sign-in/email", { email, password });
  if (status === 429) return { status: "locked", retryInMinutes: minutes(retryAfter) };
  if (status === 200 && json.twoFactorRedirect === true) {
    // The role is learned after the code step; this value only picks wording.
    return { status: "totp_required", role: "doctor" as Exclude<Role, "patient"> };
  }
  // Wrong password, unknown email, unverified email, no authenticator, locked account: one answer.
  return { status: "invalid" };
}

async function finishStaff(path: string, code: string): Promise<StaffCodeResult> {
  const { status, retryAfter } = await post(path, { code });
  if (status === 429) return { status: "locked", retryInMinutes: minutes(retryAfter) };
  // Better Auth answers 403 once the account is locked after too many wrong codes.
  if (status === 403) return { status: "locked", retryInMinutes: 15 };
  if (status !== 200) return { status: "wrong" };
  const me = await fetch("/api/v1/me", { credentials: "same-origin", cache: "no-store" });
  const roles = me.ok ? (((await me.json()) as { roles?: string[] }).roles ?? []) : [];
  return { status: "ok", redirectTo: homeForRoles(roles) };
}

export const verifyTotp = (code: string) => finishStaff("/api/auth/two-factor/verify-totp", code);
export const verifyBackup = (code: string) =>
  finishStaff("/api/auth/two-factor/verify-backup-code", code);

export function homeForRoles(roles: readonly string[]): string {
  if (roles.includes("admin") || roles.includes("super_admin")) return "/admin/dashboard";
  if (roles.includes("support")) return "/staff/queue";
  if (roles.includes("doctor")) return "/doctor/dashboard";
  return "/patient/dashboard";
}

export async function signOut(): Promise<void> {
  await post("/api/auth/sign-out", {});
}

// ---- Staff invitation (P2-06, P2-12) ----

export type EnrolResult =
  | { status: "ok"; email: string; role: string; totpUri: string; backupCodes: string[] }
  | { status: "invalid_link" }
  | { status: "rate_limited"; retryInMinutes: number }
  | { status: "unavailable" };

export async function enrolInvitation(token: string): Promise<EnrolResult> {
  const { status, json, retryAfter } = await post(
    `/api/v1/invitations/${encodeURIComponent(token)}/enrol`,
    {},
  );
  if (status === 404) return { status: "invalid_link" };
  if (status === 429) return { status: "rate_limited", retryInMinutes: minutes(retryAfter) };
  if (status !== 200) return { status: "unavailable" };
  return {
    status: "ok",
    email: String(json.email),
    role: String(json.role),
    totpUri: String(json.totpUri),
    backupCodes: (json.backupCodes as string[]) ?? [],
  };
}

export type AcceptResult =
  | { status: "ok" }
  | { status: "invalid_link" }
  | { status: "fields"; errors: Record<string, string> }
  | { status: "rate_limited"; retryInMinutes: number }
  | { status: "unavailable" };

export async function acceptInvitation(input: {
  token: string;
  name: string;
  password: string;
  code: string;
}): Promise<AcceptResult> {
  const { token, ...body } = input;
  const { status, json, retryAfter } = await post(
    `/api/v1/invitations/${encodeURIComponent(token)}/accept`,
    body,
  );
  if (status === 200) return { status: "ok" };
  if (status === 404) return { status: "invalid_link" };
  if (status === 429) return { status: "rate_limited", retryInMinutes: minutes(retryAfter) };
  if (status === 422 || status === 400) {
    const issues = (json.issues as { path: string; message: string }[] | undefined) ?? [];
    const errors: Record<string, string> = {};
    for (const issue of issues) errors[issue.path] ??= issue.message;
    if (Object.keys(errors).length > 0) return { status: "fields", errors };
    return { status: "fields", errors: { code: "Set up the authenticator app first." } };
  }
  return { status: "unavailable" };
}
