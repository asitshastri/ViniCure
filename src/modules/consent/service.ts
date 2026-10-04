import { errors } from "../../lib/errors/app-error";
import { logger } from "../../lib/logging/logger";
import { uuidv7 } from "../../lib/ids";
import { assertAllowed, can, type Principal } from "../identity/policy";
import type { ConsentRepo, PolicyRow } from "./repo";
import {
  JOIN_CONSENT_KINDS,
  type ConsentPolicyView,
  type GrantConsentsBody,
  type JoinConsentView,
} from "./schemas";

// Consent before a video consultation (P6-05). The patient (or the parent of a child) agrees to
// the telemedicine and video texts once per patient and version; a new version is asked again.
// The texts come from legal (P9-10). With no text in force nothing can be agreed to, and a video
// visit stays closed: it fails shut, with a log line for operations.

type Deps = { repo: ConsentRepo };

const view = (p: PolicyRow): ConsentPolicyView => ({
  policyId: p.id,
  kind: p.kind,
  version: p.version,
  language: p.language,
  body: p.body,
});

export class ConsentService {
  constructor(private readonly deps: Deps) {}

  /**
   * The texts that still need an answer for this patient: the current text of each kind with no
   * live agreement to that version. Throws "unavailable" when a kind has no text in force.
   */
  async missingFor(userId: string, patientId: string): Promise<PolicyRow[]> {
    const current = await this.deps.repo.currentPolicies(JOIN_CONSENT_KINDS);
    if (current.length < JOIN_CONSENT_KINDS.length) {
      logger.error({ event: "consent_policy_missing" });
      throw errors.unavailable({ detail: "Video visits are not open yet." });
    }
    const live = await this.deps.repo.liveConsents(userId, patientId, JOIN_CONSENT_KINDS);
    return current.filter((p) => !live.some((l) => l.kind === p.kind && l.version === p.version));
  }

  private async subject(principal: Principal, appointmentId: string) {
    const subject = await this.deps.repo.subjectOfAppointment(appointmentId);
    // Someone else's appointment is the same 404 as one that does not exist.
    if (!subject) throw errors.notFound();
    assertAllowed(can.patientProfile.write(principal, { ownerUserId: subject.accountUserId }));
    return subject;
  }

  /** What this appointment's patient must still agree to. */
  async required(principal: Principal, appointmentId: string): Promise<JoinConsentView> {
    const subject = await this.subject(principal, appointmentId);
    const missing = await this.missingFor(subject.accountUserId, subject.patientId);
    return { required: missing.map(view) };
  }

  /**
   * Records agreement to the named texts. Only texts that are currently asked for can be agreed
   * to (an old version or an unrelated policy is refused), so the record always matches what the
   * person was shown. A parent agreeing for a child is recorded as such.
   */
  async grant(
    principal: Principal,
    appointmentId: string,
    input: GrantConsentsBody,
    ip: string | null,
  ): Promise<JoinConsentView> {
    const subject = await this.subject(principal, appointmentId);
    const missing = await this.missingFor(subject.accountUserId, subject.patientId);
    const asked = new Set(missing.map((p) => p.id));
    const wanted = [...new Set(input.policyIds)];
    if (wanted.some((id) => !asked.has(id))) {
      throw errors.validation([
        { path: "policyIds", message: "Reload the page: these texts are not the current ones." },
      ]);
    }
    for (const policyId of wanted) {
      await this.deps.repo.grant({
        id: uuidv7(),
        userId: subject.accountUserId,
        patientId: subject.patientId,
        policyId,
        givenByUserId: subject.onBehalf ? principal.userId : null,
        ip,
      });
    }
    return this.required(principal, appointmentId);
  }

  /** The person takes an agreement back. From then on the join is closed until they agree again. */
  async withdraw(principal: Principal, consentId: string): Promise<{ withdrawn: true }> {
    const consent = await this.deps.repo.findConsent(consentId);
    // Someone else's record is the same 404 as one that does not exist.
    if (!consent || consent.userId !== principal.userId) throw errors.notFound();
    assertAllowed(can.patientProfile.write(principal, { ownerUserId: consent.userId }));
    if (!(await this.deps.repo.withdraw(consentId, principal.userId))) {
      throw errors.conflict({ detail: "This agreement was already withdrawn." });
    }
    return { withdrawn: true };
  }
}
