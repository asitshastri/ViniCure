/** Whole years between a date of birth (YYYY-MM-DD) and now. */
export function ageFromDob(dob: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(`${dob}T00:00:00Z`).getTime()) / 31_557_600_000));
}
