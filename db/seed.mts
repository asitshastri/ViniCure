import pg from "pg";
import { readFileSync } from "node:fs";
import { seedDemo, seedDemoConsents, seedReference } from "../src/db/seed.mts";
import { DEV_FILE, saveDevAccounts, seedAccounts } from "../src/db/seed-accounts.mts";

// pnpm db:seed          reference data (specialties). Safe anywhere.
// pnpm db:seed --demo   also fake doctors with working hours and DRAFT consent texts. Never in production.
//   pnpm db:seed --demo --accounts   also test accounts you can sign in with (local computer only).
// Connects with DATABASE_URL (the app role). The URL is never printed.

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const demo = process.argv.includes("--demo");
const accounts = process.argv.includes("--accounts");
if (accounts && !demo) {
  console.error("--accounts needs --demo (the accounts use the demo doctors).");
  process.exit(1);
}
if (demo && process.env.NODE_ENV === "production") {
  console.error("Demo data is never loaded in production.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  const db = {
    query: async (text: string, params?: unknown[]) => ({
      rows: (await client.query(text, params)).rows as Record<string, unknown>[],
    }),
  };
  await seedReference(db);
  console.log("specialties seeded");
  if (demo) {
    console.log(`demo doctors added: ${await seedDemo(db)}`);
    console.log(`draft consent texts added: ${await seedDemoConsents(db)}`);
  }
  if (accounts) {
    const fresh = await seedAccounts(process.env);
    let existing: Record<string, unknown> = {};
    try {
      existing = (
        JSON.parse(readFileSync(DEV_FILE, "utf8")) as { accounts: Record<string, unknown> }
      ).accounts;
    } catch {
      // first run
    }
    saveDevAccounts(fresh as never, existing);
    console.log(`test accounts ready (details in ${DEV_FILE}, which git ignores)`);
  }
} catch (error) {
  console.error("seed failed:", (error as Error).message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
