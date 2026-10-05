import pg from "pg";
import { loadConfig } from "../src/lib/config/config";
import { createAuth } from "../src/modules/identity/auth";
import { AdminExistsError, firstAdminInvitation } from "../src/modules/identity/first-admin";
import { invitationCrypto } from "../src/modules/identity/invitation-crypto";
import { IdentityRepo } from "../src/modules/identity/repo";
import { createStaffPlugins, staffEmailAndPassword } from "../src/modules/identity/staff";

// Makes the one-time invitation for the first administrator of a new site, and prints the link.
//   docker compose exec worker node first-admin.mjs you@example.com
// Runs with the same settings as the website (database, AUTH_SECRET, APP_URL). Refuses if any
// administrator exists. The link works once, for 72 hours; keep it private until it is used.
const email = process.argv[2];
if (!email) {
  console.error("Usage: first-admin.mjs you@example.com");
  process.exit(1);
}
const config = loadConfig(process.env);
if (!config.DATABASE_URL || !config.AUTH_SECRET) {
  console.error("DATABASE_URL and AUTH_SECRET must be set.");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 2 });
const db = {
  query: async (text: string, params?: unknown[]) => ({
    rows: (await pool.query(text, params)).rows as Record<string, unknown>[],
  }),
};
const repo = new IdentityRepo(db);
try {
  const auth = createAuth({
    database: pool,
    secret: config.AUTH_SECRET,
    baseUrl: config.APP_URL,
    trustedOrigins: [config.APP_URL],
    production: false,
    rolesOf: (id) => repo.rolesOf(id),
    emailAndPassword: staffEmailAndPassword,
    plugins: createStaffPlugins(config.AUTH_SECRET),
  });
  const { link, expiresInHours } = await firstAdminInvitation({
    db,
    repo,
    crypto: invitationCrypto(auth),
    appUrl: config.APP_URL,
    email,
  });
  console.log("\nOpen this link to become the first administrator (it works once):\n");
  console.log(link);
  console.log(
    `\nIt expires in ${expiresInHours} hours. You will set a password and an authenticator app.`,
  );
} catch (error) {
  if (error instanceof AdminExistsError) {
    console.error(error.message);
    process.exitCode = 2;
  } else {
    console.error(`Could not make the invitation: ${(error as Error).message}`);
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
