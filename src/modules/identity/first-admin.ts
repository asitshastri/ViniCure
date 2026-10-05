import type { Queryable } from "../../lib/db/queryable";
import { FakeEmailProvider } from "../../lib/adapters/fakes";
import { uuidv7 } from "../../lib/ids";
import { InvitationService, normalizeEmail, type InvitationCrypto } from "./invitations";
import type { IdentityRepo } from "./repo";

// The first administrator of a new site. Admins are made by invitation, and the first one has
// nobody to invite them, so this is done once, by someone with a shell on the server:
//
//   docker compose exec worker node first-admin.mjs you@example.com
//
// It refuses when any administrator already exists, so it cannot be used later to add one
// quietly. It makes the same invitation an admin would, and prints the link instead of emailing it:
// the person opens it, sets a password and scans the authenticator code, like every staff member.

export class AdminExistsError extends Error {
  constructor() {
    super("an administrator already exists; invite further staff from the admin screens");
  }
}

export async function firstAdminInvitation(deps: {
  db: Queryable;
  repo: IdentityRepo;
  crypto: InvitationCrypto;
  appUrl: string;
  email: string;
}): Promise<{ link: string; expiresInHours: number }> {
  const email = normalizeEmail(deps.email);
  if (!email) throw new Error("that is not an email address");

  const existing = await deps.db.query(
    `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE r.code IN ('admin', 'super_admin') LIMIT 1`,
  );
  if (existing.rows.length > 0) throw new AdminExistsError();

  // Someone has to be the inviter on the record. It is a row, not a login.
  await deps.db.query(
    "INSERT INTO users (id, name, email) VALUES ($1, 'Site setup', 'setup@no-email.invalid') ON CONFLICT DO NOTHING",
    [uuidv7()],
  );
  const setup = (await deps.db.query("SELECT id FROM users WHERE email = 'setup@no-email.invalid'"))
    .rows[0];

  // The service sends mail through a provider; here the link is captured instead of sent.
  const capture = new FakeEmailProvider();
  const service = new InvitationService({
    repo: deps.repo,
    email: capture,
    crypto: deps.crypto,
    appUrl: deps.appUrl,
  });
  const { expiresInSeconds } = await service.create({
    email,
    role: "admin",
    invitedBy: String(setup?.id),
    inviterRoles: ["super_admin"],
  });
  const link = capture.sent.at(-1)?.variables.link;
  if (!link) throw new Error("the invitation link was not made");
  return { link, expiresInHours: expiresInSeconds / 3600 };
}
