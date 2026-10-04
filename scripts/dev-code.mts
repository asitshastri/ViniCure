import { readFileSync } from "node:fs";
import { totpCode } from "../src/modules/identity/totp";

// Local only: prints the current authenticator code for a test account made by
// `pnpm db:seed --demo --accounts`, for example `pnpm dev:code admin`.
const name = process.argv[2];
let file: { password: string; accounts: Record<string, { email?: string; totpSecret?: string }> };
try {
  file = JSON.parse(readFileSync(".dev-accounts.json", "utf8"));
} catch {
  console.error("No .dev-accounts.json yet. Run: pnpm db:seed --demo --accounts");
  process.exit(1);
}
const account = name ? file.accounts[name] : undefined;
if (!account?.totpSecret) {
  console.error(
    `Pick one of: ${Object.entries(file.accounts)
      .filter(([, a]) => a.totpSecret)
      .map(([k]) => k)
      .join(", ")}`,
  );
  process.exit(1);
}
console.log(
  `${account.email}  code ${totpCode(account.totpSecret, Date.now())}  (valid for the current 30 seconds)`,
);
