import { createHash, randomBytes } from "node:crypto";
import type { EmailProvider } from "../../lib/adapters/types";
import type { Role } from "../../lib/api/types";
import { AppError, errors } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import { PASSWORD_PROBLEM_TEXT, passwordProblem } from "./password";
import { TOTP_ISSUER } from "./staff";
import { totpUri, verifyTotp } from "./totp";
import type { IdentityRepo, InvitableRole } from "./repo";

// Staff invitations (P2-06, backend-architecture.md section 3): an admin invites a doctor,
// admin or support person. The person follows the emailed link, scans a QR code into an
// authenticator app, then sets a password and types the first code. Only then does the account
// exist (one database statement), so there is never a staff account without two-factor.
//
// The link token is 32 random bytes. The database keeps only its SHA-256 hash. A link works
// once, for 72 hours, and is burnt after 5 wrong codes. Every way a link can be invalid (wrong,
// expired, used, revoked, burnt) gives the same answer, so a guesser learns nothing.

export const INVITATION_TTL_SECONDS = 72 * 60 * 60;
export const INVITABLE_ROLES: readonly InvitableRole[] = ["doctor", "admin", "support"];
export const INVITATION_EMAIL_TEMPLATE = "staff_invitation";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export type InvitationCrypto = {
  /** Encrypts a value the way the two-factor plugin stores it. */
  seal(plain: string): Promise<string>;
  unseal(sealed: string): Promise<string>;
  /** A fresh authenticator secret (the plugin's own format: a random string used as the key). */
  newSecret(): string;
  /** Ten single-use backup codes: the codes to show once and the encrypted form to store. */
  newBackupCodes(): Promise<{ codes: string[]; stored: string }>;
  hashPassword(password: string): Promise<string>;
};

export type InvitationDeps = {
  repo: IdentityRepo;
  email: EmailProvider;
  crypto: InvitationCrypto;
  /** Public address of the app, for the link in the email. */
  appUrl: string;
  now?: () => number;
};

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const invalidLink = () =>
  errors.notFound({ detail: "This invitation link is not valid. Ask for a new one." });

export function normalizeEmail(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  return value.length <= 254 && EMAIL.test(value) ? value : null;
}

/** Whether `inviter` may invite someone into `role`. Only a super admin may invite an admin. */
export function mayInvite(inviter: readonly Role[], role: InvitableRole): boolean {
  if (inviter.includes("super_admin")) return true;
  return inviter.includes("admin") && (role === "doctor" || role === "support");
}

export class InvitationService {
  constructor(private readonly deps: InvitationDeps) {}

  /** Admin: creates the invitation and emails the link. Replaces any open invitation for the address. */
  async create(input: {
    email: string;
    role: InvitableRole;
    invitedBy: string;
    inviterRoles: readonly Role[];
  }): Promise<{ invitationId: string; expiresInSeconds: number }> {
    if (!INVITABLE_ROLES.includes(input.role) || !mayInvite(input.inviterRoles, input.role)) {
      throw errors.forbidden();
    }
    const email = normalizeEmail(input.email);
    if (!email) {
      throw errors.validation([{ path: "email", message: "Enter a valid email address." }]);
    }
    const { repo } = this.deps;
    if (await repo.emailTaken(email)) {
      throw errors.conflict({ detail: "That email address already has an account." });
    }

    const token = randomBytes(32).toString("base64url");
    const id = uuidv7();
    await repo.revokeOpenInvitations(email);
    await repo.createInvitation({
      id,
      email,
      roleCode: input.role,
      tokenHash: hashToken(token),
      invitedBy: input.invitedBy,
      ttlSeconds: INVITATION_TTL_SECONDS,
    });

    try {
      await this.deps.email.send({
        to: email,
        templateKey: INVITATION_EMAIL_TEMPLATE,
        variables: {
          link: `${this.deps.appUrl.replace(/\/$/, "")}/invite/${token}`,
          role: input.role,
          hours: String(INVITATION_TTL_SECONDS / 3600),
        },
      });
    } catch (cause) {
      // The link never left the building: close the invitation so no unsent link stays valid.
      await repo.revokeInvitation(id);
      throw errors.unavailable({ cause });
    }
    return { invitationId: id, expiresInSeconds: INVITATION_TTL_SECONDS };
  }

  /**
   * Public, step 1: shows the authenticator secret and the backup codes for this link. Calling
   * it again makes a new secret, so an earlier QR code stops working.
   */
  async enrol(token: string): Promise<{
    email: string;
    role: InvitableRole;
    totpUri: string;
    backupCodes: string[];
  }> {
    const { repo, crypto } = this.deps;
    const invitation = await repo.openInvitation(hashToken(token));
    if (!invitation) throw invalidLink();

    const secret = crypto.newSecret();
    const backup = await crypto.newBackupCodes();
    const stored = await repo.storePendingEnrolment({
      id: invitation.id,
      secret: await crypto.seal(secret),
      backupCodes: backup.stored,
    });
    if (!stored) throw invalidLink();

    return {
      email: invitation.email,
      role: invitation.roleCode,
      totpUri: totpUri({ secret, issuer: TOTP_ISSUER, account: invitation.email }),
      backupCodes: backup.codes,
    };
  }

  /** Public, step 2: sets the password, proves the first code, and creates the account. */
  async accept(input: {
    token: string;
    name: string;
    password: string;
    code: string;
  }): Promise<{ userId: string; email: string }> {
    const { repo, crypto } = this.deps;
    const invitation = await repo.openInvitation(hashToken(input.token));
    if (!invitation) throw invalidLink();

    const name = input.name.trim();
    if (name.length < 2 || name.length > 100 || /\p{Cc}/u.test(name)) {
      throw errors.validation([{ path: "name", message: "Enter your full name." }]);
    }
    const problem = passwordProblem(input.password, invitation.email);
    if (problem) {
      throw errors.validation([{ path: "password", message: PASSWORD_PROBLEM_TEXT[problem] }]);
    }
    if (!invitation.pendingTotpSecret || !invitation.pendingBackupCodes) {
      throw new AppError("bad_request", { detail: "Set up the authenticator app first." });
    }

    const secret = await crypto.unseal(invitation.pendingTotpSecret);
    if (!verifyTotp(secret, input.code, this.deps.now?.())) {
      await repo.recordFailedEnrolment(invitation.id);
      throw errors.validation([{ path: "code", message: "That code is not correct." }]);
    }

    const userId = uuidv7();
    let created: string | null;
    try {
      created = await repo.completeInvitation({
        invitationId: invitation.id,
        userId,
        name,
        accountId: uuidv7(),
        passwordHash: await crypto.hashPassword(input.password),
        twoFactorId: uuidv7(),
        totpSecret: invitation.pendingTotpSecret,
        backupCodes: invitation.pendingBackupCodes,
      });
    } catch (cause) {
      if ((cause as { code?: string }).code === "23505") {
        throw errors.conflict({ detail: "That email address already has an account.", cause });
      }
      throw cause;
    }
    if (!created) throw invalidLink();
    return { userId: created, email: invitation.email };
  }
}
