import type { Role } from "../../lib/api/types";

// Session lifetimes (backend-architecture.md section 3, proposals):
//   patients  14 days, counted from sign-in
//   staff     8 hours, counted from sign-in
// Both are fixed: a session is never renewed, so the patient signs in again after 14 days and
// a doctor or admin after 8 hours. (Longer idle gaps also trigger the phone recycling step-up.)
// Sensitive actions need a sign-in within the last 15 minutes ("fresh login").

export const PATIENT_SESSION_SECONDS = 14 * 24 * 60 * 60;
export const STAFF_SESSION_SECONDS = 8 * 60 * 60;
export const FRESH_LOGIN_SECONDS = 15 * 60;

const STAFF_ROLES: readonly Role[] = ["doctor", "admin", "super_admin", "support"];

export function isStaff(roles: readonly Role[]): boolean {
  return roles.some((role) => STAFF_ROLES.includes(role));
}

/** When a session should expire: 8 hours after sign-in for staff, 14 days for everyone else. */
export function sessionExpiry(input: { roles: readonly Role[]; createdAt: Date }): Date {
  const seconds = isStaff(input.roles) ? STAFF_SESSION_SECONDS : PATIENT_SESSION_SECONDS;
  return new Date(input.createdAt.getTime() + seconds * 1000);
}

/** True when the person signed in recently enough for a sensitive action. */
export function isFreshLogin(signedInAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - signedInAt.getTime() <= FRESH_LOGIN_SECONDS * 1000;
}
