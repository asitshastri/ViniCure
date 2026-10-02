// FAKE sign-in rules for the UI-first phase (D-007). Replaced by Better Auth in P2.
// Demo values, shown on the pages so reviewers can reach every state:
//   Patient OTP "123456" works. "000000" is expired. Anything else is wrong. 5 wrong tries lock the number.
//   Phone 9999999999 simulates a send limit. Staff: staff@example.test with any strong password,
//   TOTP "123456", backup code "ABCD-1234". Password "Locked-Account-1!" simulates a lockout.
export const MOCK_GOOD_OTP = "123456";
export const MOCK_EXPIRED_OTP = "000000";
export const MOCK_LIMITED_PHONE = "9999999999";
export const MOCK_LOCKED_PASSWORD = "Locked-Account-1!";
export const MOCK_GOOD_BACKUP = "ABCD-1234";
export const MAX_ATTEMPTS = 5;
