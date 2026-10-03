import { MOCK_BACKUP, MOCK_CODES, MOCK_PHONE_RATE_LIMITED_SUFFIX, MOCK_STAFF } from "@/mocks/auth";
import type { Role } from "@/lib/types";

// Components call these functions only. In P2 they call the auth API.
// Replies never say whether an account exists (no account enumeration).

const delay = (ms = 450) => new Promise((resolve) => setTimeout(resolve, ms));

export type OtpRequestResult =
  { status: "sent"; resendInSeconds: number } | { status: "rate_limited"; retryInMinutes: number };

export type OtpVerifyResult =
  | { status: "ok" }
  | { status: "wrong" }
  | { status: "expired" }
  | { status: "locked"; retryInMinutes: number };

export type StaffSignInResult =
  | { status: "totp_required"; role: Exclude<Role, "patient"> }
  | { status: "invalid" }
  | { status: "locked"; retryInMinutes: number };

export type StaffCodeResult =
  | { status: "ok"; redirectTo: string }
  | { status: "wrong" }
  | { status: "locked"; retryInMinutes: number };

export async function requestPatientOtp(phone: string): Promise<OtpRequestResult> {
  await delay();
  if (phone.endsWith(MOCK_PHONE_RATE_LIMITED_SUFFIX))
    return { status: "rate_limited", retryInMinutes: 10 };
  return { status: "sent", resendInSeconds: 30 };
}

export async function verifyPatientOtp(code: string): Promise<OtpVerifyResult> {
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
  await delay();
  if (email.startsWith(MOCK_STAFF.lockedEmailPrefix))
    return { status: "locked", retryInMinutes: 15 };
  if (password === MOCK_STAFF.wrongPassword) return { status: "invalid" };
  pendingRole = roleFromEmail(email);
  return { status: "totp_required", role: pendingRole };
}

export async function verifyStaffTotp(code: string): Promise<StaffCodeResult> {
  await delay();
  if (code === MOCK_CODES.locked) return { status: "locked", retryInMinutes: 15 };
  if (code === MOCK_CODES.wrong) return { status: "wrong" };
  return { status: "ok", redirectTo: homeFor[pendingRole] };
}

export async function verifyStaffBackupCode(code: string): Promise<StaffCodeResult> {
  await delay();
  if (code === MOCK_BACKUP.invalid) return { status: "wrong" };
  return { status: "ok", redirectTo: homeFor[pendingRole] };
}

export async function requestPasswordReset(): Promise<{ status: "sent" }> {
  await delay();
  return { status: "sent" };
}

export async function submitNewPassword(
  current?: string,
): Promise<{ status: "ok" } | { status: "wrong_current" } | { status: "link_expired" }> {
  await delay();
  if (current === MOCK_STAFF.wrongPassword) return { status: "wrong_current" };
  return { status: "ok" };
}

export async function submitDoctorApplication(): Promise<{ status: "received" }> {
  await delay();
  return { status: "received" };
}
