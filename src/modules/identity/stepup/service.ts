import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { uuidv7 } from "../../../lib/ids";
import { describeDevice } from "../sessions";
import type { SecurityNotifier } from "./notifier";
import type { AccountSnapshot, StepUpRepo } from "./repo";
import { assessRisk, type RiskReason } from "./risk";

// Step-up service (P2-18). It decides how much a phone sign-in is trusted, remembers devices,
// and turns recovery codes into an unlocked session. Secrets and tokens are only ever compared
// by hash.

export const RECOVERY_CODE_COUNT = 10;
export const ALERT_TTL_SECONDS = 7 * 24 * 60 * 60;
// No 0, O, 1, I or L: codes are read aloud and typed from paper.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export type SignInDecision = {
  limited: boolean;
  reasons: RiskReason[];
  brandNewAccount: boolean;
  /** The id of the trusted device this browser matched, if any. */
  knownDeviceId: string | null;
};

export type StepUpDeps = {
  repo: StepUpRepo;
  notifier: SecurityNotifier;
  /** Keys the recovery code hashes. */
  secret: string;
  /** Public address for the "not me" link. */
  appUrl: string;
  now?: () => Date;
};

export const hashDeviceToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newDeviceToken = () => randomBytes(32).toString("base64url");

/** Upper case, no dashes or spaces: how a typed code is compared. */
export const normalizeRecoveryCode = (raw: string) => raw.toUpperCase().replace(/[\s-]/g, "");

export class StepUpService {
  constructor(private readonly deps: StepUpDeps) {}

  private get now() {
    return (this.deps.now ?? (() => new Date()))();
  }

  recoveryHash(code: string): string {
    return createHmac("sha256", `recovery:${this.deps.secret}`)
      .update(normalizeRecoveryCode(code))
      .digest("hex");
  }

  // ---- Phone sign-in ----

  /**
   * Decides how far to trust a phone sign-in, using what the account looked like BEFORE this
   * sign-in, then records the sign-in. `deviceToken` is the browser's device cookie, if any.
   */
  async decidePhoneSignIn(
    userId: string,
    deviceToken: string | undefined,
  ): Promise<SignInDecision> {
    const { repo } = this.deps;
    const snapshot = await repo.snapshot(userId);
    if (!snapshot)
      return {
        limited: true,
        reasons: ["new_device"],
        brandNewAccount: false,
        knownDeviceId: null,
      };
    const device = deviceToken ? await repo.findDevice(userId, hashDeviceToken(deviceToken)) : null;
    const brandNewAccount = snapshot.lastActiveAt === null && snapshot.phoneChangedAt === null;
    const risk = assessRisk({
      now: this.now,
      knownDevice: device !== null,
      brandNewAccount,
      lastActiveAt: snapshot.lastActiveAt,
      phoneVerifiedAt: snapshot.phoneVerifiedAt,
      phoneChangedAt: snapshot.phoneChangedAt,
      forceStepUpAt: snapshot.forceStepUpAt,
    });
    await repo.stampPhoneSignIn(userId);
    return {
      limited: risk.high,
      reasons: risk.reasons,
      brandNewAccount,
      knownDeviceId: device?.id ?? null,
    };
  }

  /**
   * After the session exists: renew a known device, or trust a brand-new account's first device,
   * or (new device, limited) raise a notice. Returns a device token to put in the cookie when a
   * device was registered.
   */
  async finishPhoneSignIn(input: {
    userId: string;
    sessionId: string;
    decision: SignInDecision;
    userAgent: string | null;
  }): Promise<{ newDeviceToken?: string }> {
    const { repo } = this.deps;
    const { decision, userId } = input;
    if (decision.knownDeviceId && !decision.limited) {
      await repo.touchDevice(decision.knownDeviceId);
      return {};
    }
    if (decision.brandNewAccount) {
      return { newDeviceToken: await this.trust(userId, input.userAgent) };
    }
    if (!decision.knownDeviceId)
      await this.raiseNewDeviceAlert(userId, input.sessionId, input.userAgent);
    return {};
  }

  private async trust(userId: string, userAgent: string | null): Promise<string> {
    const token = newDeviceToken();
    await this.deps.repo.trustDevice({
      id: uuidv7(),
      userId,
      deviceHash: hashDeviceToken(token),
      label: describeDevice(userAgent),
    });
    return token;
  }

  /** Registers this browser as unlocked (after Google or a recovery code). Returns its cookie value. */
  async trustThisBrowser(
    userId: string,
    existingToken: string | undefined,
    userAgent: string | null,
  ): Promise<string> {
    if (existingToken) {
      const hash = hashDeviceToken(existingToken);
      await this.deps.repo.trustDevice({
        id: uuidv7(),
        userId,
        deviceHash: hash,
        label: describeDevice(userAgent),
      });
      return existingToken;
    }
    return this.trust(userId, userAgent);
  }

  private async raiseNewDeviceAlert(userId: string, sessionId: string, userAgent: string | null) {
    const { repo, notifier, appUrl } = this.deps;
    const token = randomBytes(32).toString("base64url");
    await repo.createAlert({
      id: uuidv7(),
      userId,
      sessionId,
      tokenHash: hashDeviceToken(token),
      ttlSeconds: ALERT_TTL_SECONDS,
    });
    const snapshot: AccountSnapshot | null = await repo.snapshot(userId);
    await notifier.newDeviceSignIn({
      email:
        snapshot && snapshot.emailVerified && !snapshot.email.endsWith("@no-email.invalid")
          ? snapshot.email
          : null,
      notMeLink: `${appUrl.replace(/\/$/, "")}/not-me?token=${encodeURIComponent(token)}`,
      device: describeDevice(userAgent),
    });
  }

  // ---- Unlocking ----

  /** Google proved the account: clear the flag. (The session itself is made unlimited by the caller.) */
  async googleProved(userId: string): Promise<void> {
    await this.deps.repo.clearForceStepUp(userId);
  }

  /**
   * Spends a recovery code to unlock the session. Returns false for a wrong, used or malformed
   * code. The caller limits attempts. On success the patient is told through every other method.
   */
  async unlockWithRecoveryCode(input: {
    userId: string;
    sessionId: string;
    code: string;
  }): Promise<boolean> {
    const { repo, notifier } = this.deps;
    const normalized = normalizeRecoveryCode(input.code);
    if (!/^[A-Z2-9]{10}$/.test(normalized)) return false;
    if (!(await repo.spendRecoveryCode(input.userId, this.recoveryHash(normalized)))) return false;
    await repo.unlockSession(input.userId, input.sessionId, "recovery_code");
    await repo.clearForceStepUp(input.userId);
    const snapshot = await repo.snapshot(input.userId);
    await notifier.recoveryCodeUsed({
      email:
        snapshot && snapshot.emailVerified && !snapshot.email.endsWith("@no-email.invalid")
          ? snapshot.email
          : null,
      phone: await repo.deliverablePhone(input.userId),
    });
    return true;
  }

  /** Ten new single-use codes, shown once. Any unused older codes stop working. */
  async generateRecoveryCodes(userId: string): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
      let raw = "";
      for (let i = 0; i < 10; i++) raw += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      return raw;
    });
    await this.deps.repo.replaceRecoveryCodes(
      userId,
      codes.map((code) => ({ id: uuidv7(), hash: this.recoveryHash(code) })),
    );
    return codes.map((code) => `${code.slice(0, 5)}-${code.slice(5)}`);
  }

  // ---- "This was not me" ----

  /** Opens a "not me" link: everything ends and step-up is forced. False for a bad link. */
  async notMe(token: string): Promise<boolean> {
    const userId = await this.deps.repo.consumeAlert(hashDeviceToken(token));
    if (!userId) return false;
    await this.deps.repo.flagNotMe(userId);
    return true;
  }

  // ---- Number change ----

  /** After a number change was proven by a code to the new number. */
  async numberChanged(input: {
    userId: string;
    keepSessionId: string | null;
    keepDeviceToken: string | undefined;
    oldPhone: string | null;
  }): Promise<void> {
    const { repo, notifier } = this.deps;
    await repo.afterNumberChange(
      input.userId,
      input.keepSessionId,
      input.keepDeviceToken ? hashDeviceToken(input.keepDeviceToken) : undefined,
    );
    const snapshot = await repo.snapshot(input.userId);
    await notifier.numberChanged({
      email:
        snapshot && snapshot.emailVerified && !snapshot.email.endsWith("@no-email.invalid")
          ? snapshot.email
          : null,
      oldPhone: input.oldPhone,
    });
  }
}
