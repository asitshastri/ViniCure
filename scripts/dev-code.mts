import { readFileSync } from "node:fs";
import pg from "pg";
import { hashIdentifier } from "../src/modules/identity/surface";
import { totpCode } from "../src/modules/identity/totp";

// Local only. Prints a sign-in code for the test accounts made by `pnpm db:seed --demo --accounts`:
//   pnpm dev:code admin          the authenticator code for a staff account (also doctor1, support, ...)
//   pnpm dev:code 6000000001     the latest one-time code the site sent to that patient number
const arg = process.argv[2];

async function patientCode(tenDigits: string) {
  const secret = process.env.AUTH_SECRET;
  const url = process.env.DATABASE_URL;
  if (!secret || !url || (process.env.APP_ENV ?? "local") !== "local") {
    console.error("This works on a local computer with .env.local only.");
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const { rows } = await pool.query(
      "SELECT value, created_at FROM auth_verifications WHERE identifier = $1 ORDER BY created_at DESC LIMIT 1",
      [await hashIdentifier(secret)(`+91${tenDigits}`)],
    );
    if (!rows[0]) {
      console.error("No code yet: press 'Send code' on the sign-in page first.");
      process.exit(1);
    }
    console.log(
      `+91${tenDigits}  code ${String(rows[0].value).split(":")[0]}  (sent ${new Date(rows[0].created_at).toLocaleTimeString()})`,
    );
  } finally {
    await pool.end();
  }
}

if (arg && /^[6-9][0-9]{9}$/.test(arg)) {
  await patientCode(arg);
} else {
  let file: {
    password: string;
    accounts: Record<string, { email?: string; totpSecret?: string }>;
  };
  try {
    file = JSON.parse(readFileSync(".dev-accounts.json", "utf8"));
  } catch {
    console.error("No .dev-accounts.json yet. Run: pnpm db:seed --demo --accounts");
    process.exit(1);
  }
  const account = arg ? file.accounts[arg] : undefined;
  if (!account?.totpSecret) {
    const names = Object.entries(file.accounts)
      .filter(([, a]) => a.totpSecret)
      .map(([k]) => k)
      .join(", ");
    console.error(`Pick one of: ${names}, or a patient number such as 6000000001`);
    process.exit(1);
  }
  console.log(
    `${account.email}  code ${totpCode(account.totpSecret, Date.now())}  (valid for the current 30 seconds)`,
  );
}
