// FAKE RULES for the UI-first phase (D-007). They exist only so every sign-in state can be reached.
// The real checks happen on the server in P2. Nothing here is a credential.

export const MOCK_CODES = {
  wrong: "000000",
  expired: "111111",
  locked: "999999",
} as const;

export const MOCK_BACKUP = { invalid: "0000-0000" } as const;

export const MOCK_STAFF = {
  wrongPassword: "Wrong#Pass12345",
  lockedEmailPrefix: "locked",
  adminEmailPart: "admin",
  supportEmailPart: "support",
} as const;

export const MOCK_PHONE_RATE_LIMITED_SUFFIX = "0000";
