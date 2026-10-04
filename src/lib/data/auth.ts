import * as api from "./auth-api";
import { MOCK_BACKUP, MOCK_CODES, MOCK_PHONE_RATE_LIMITED_SUFFIX, MOCK_STAFF } from "@/mocks/auth";
import type { Role } from "@/lib/types";

// Components call these functions only. In P2 they call the auth API.
// Replies never say whether an account exists (no account enumeration).

// Mock mode keeps every state reachable without a server (UI preview). Real mode calls the API.
// NEXT_PUBLIC_UI_MOCK_AUTH is a public build-time switch; it only changes which screens' data
// source is used and cannot unlock anything, because the server checks every request itself.
export const MOCK_AUTH = process.env.NEXT_PUBLIC_UI_MOCK_AUTH === "true";

const delay = (ms = 450) => new Promise((resolve) => setTimeout(resolve, ms));

export type OtpRequestResult =
  | { status: "sent"; resendInSeconds: number }
  | { status: "rate_limited"; retryInMinutes: number }
  | { status: "captcha_failed" }
  | { status: "unavailable" };

export type OtpVerifyResult =
  | { status: "ok" }
  | { status: "wrong" }
  | { status: "expired" }
  | { status: "locked"; retryInMinutes: number }
  | { status: "unavailable" };

export type StaffSignInResult =
  | { status: "totp_required"; role: Exclude<Role, "patient"> }
  | { status: "invalid" }
  | { status: "locked"; retryInMinutes: number };

export type StaffCodeResult =
  | { status: "ok"; redirectTo: string }
  | { status: "wrong" }
  | { status: "locked"; retryInMinutes: number };

export async function requestPatientOtp(
  phone: string,
  captchaToken?: string,
): Promise<OtpRequestResult> {
  if (!MOCK_AUTH) return api.requestOtp(phone, captchaToken);
  await delay();
  if (phone.endsWith(MOCK_PHONE_RATE_LIMITED_SUFFIX))
    return { status: "rate_limited", retryInMinutes: 10 };
  return { status: "sent", resendInSeconds: 30 };
}

export async function verifyPatientOtp(phone: string, code: string): Promise<OtpVerifyResult> {
  if (!MOCK_AUTH) return api.verifyOtp(phone, code);
  await delay();
  if (code === MOCK_CODES.locked) return { status: "locked", retryInMinutes: 15 };
  if (code === MOCK_CODES.expired) return { status: "expired" };
  if (code === MOCK_CODES.wrong) return { status: "wrong" };
  return { status: "ok" };
}

function roleFromEmail(email: string): Exclude<Role, "patient"> {
  if (email.includes(MOCK_STAFF.adminEmailPart)) return "admin";
  if (email.includes(MOCK_STAFF.supportEmailPart)) return "support";
  return "doctor";
}

const homeFor: Record<Role, string> = {
  patient: "/patient/dashboard",
  doctor: "/doctor/dashboard",
  admin: "/admin/dashboard",
  support: "/staff/queue",
};

export function homePathFor(role: Role): string {
  return homeFor[role];
}

let pendingRole: Exclude<Role, "patient"> = "doctor";

export async function signInStaff(email: string, password: string): Promise<StaffSignInResult> {
  if (!MOCK_AUTH) return api.signIn(email, password);
  await delay();
  if (email.startsWith(MOCK_STAFF.lockedEmailPrefix))
    return { status: "locked", retryInMinutes: 15 };
  if (password === MOCK_STAFF.wrongPassword) return { status: "invalid" };
  pendingRole = roleFromEmail(email);
  return { status: "totp_required", role: pendingRole };
}

export async function verifyStaffTotp(code: string): Promise<StaffCodeResult> {
  if (!MOCK_AUTH) return api.verifyTotp(code);
  await delay();
  if (code === MOCK_CODES.locked) return { status: "locked", retryInMinutes: 15 };
  if (code === MOCK_CODES.wrong) return { status: "wrong" };
  return { status: "ok", redirectTo: homeFor[pendingRole] };
}

export async function verifyStaffBackupCode(code: string): Promise<StaffCodeResult> {
  if (!MOCK_AUTH) return api.verifyBackup(code);
  await delay();
  if (code === MOCK_BACKUP.invalid) return { status: "wrong" };
  return { status: "ok", redirectTo: homeFor[pendingRole] };
}

export type { NewPasswordResult, ResetRequestResult } from "./auth-api";

export async function requestPasswordReset(email: string): Promise<api.ResetRequestResult> {
  if (!MOCK_AUTH) return api.requestReset(email);
  await delay();
  return { status: "sent" };
}

/** Sets a new password from a reset link (token) or, with `current`, from the signed-in page. */
export async function submitNewPassword(input: {
  password: string;
  token?: string;
  current?: string;
}): Promise<api.NewPasswordResult> {
  if (!MOCK_AUTH) {
    return input.token !== undefined
      ? api.resetPassword(input.token, input.password)
      : api.changePassword(input.current ?? "", input.password);
  }
  await delay();
  if (input.current === MOCK_STAFF.wrongPassword) return { status: "wrong_current" };
  return { status: "ok" };
}

export async function submitDoctorApplication(): Promise<{ status: "received" }> {
  await delay();
  return { status: "received" };
}

export async function signOutCurrentSession(): Promise<void> {
  if (!MOCK_AUTH) await api.signOut();
}

/** Remembers the name typed at registration, once the patient has signed in. */
export async function saveRegistrationName(name: string): Promise<void> {
  if (!MOCK_AUTH) await api.setDisplayName(name);
}
