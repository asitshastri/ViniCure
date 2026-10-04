import { AdapterError, type VideoProvider } from "../../lib/adapters/types";
import { AppError, errors } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import { logger } from "../../lib/logging/logger";
import type { StorageService } from "../../lib/storage/storage";
import { PURPOSE_POLICY, detectType } from "../../lib/storage/policy";
import { assertAllowed, can, type Principal } from "../identity/policy";
import type { RecordingContext, RecordingRepo } from "./recording-repo";
import type { RecordingConsentBody, RecordingView } from "./schemas";

// Recording a consultation (P6-08). It is off unless FEATURE_RECORDING is on, and even then:
//   * both people agree, each for this one consultation, to the recording text in force;
//   * only the assigned doctor starts or stops it, and only while the call is live;
//   * the provider writes into our own private bucket in Mumbai, at a key we chose;
//   * a withdrawal by either person, or the end of the consultation, stops it at once;
//   * a worker job checks the file (a real mp4 of a sane size) before it is registered, and a
//     daily job deletes it when its retention period is over.
// The database repeats the two-consent rule (trigger), so no code path can record without it.
// Nothing here lets anyone play a recording back: that is a separate, logged decision.

type Deps = {
  repo: RecordingRepo;
  video: () => VideoProvider;
  /** FEATURE_RECORDING. */
  enabled: () => boolean;
  /** Days to keep a recording. Undefined means it was never decided, so recording stays closed. */
  retentionDays: () => number | undefined;
  /** A random storage key for a new recording, and the bucket the provider must write to. */
  newKey: () => string;
  bucket: () => string;
  /** Asks the worker to check and register the file. */
  enqueueStore: (recordingId: string) => Promise<void>;
  storage: () => StorageService;
};

export class RecordingService {
  constructor(private readonly deps: Deps) {}

  private canRecord(): boolean {
    return this.deps.enabled() && typeof this.deps.video().startRecording === "function";
  }

  /** 404 for anyone who is not the patient's account or the assigned doctor, or before any join. */
  private async context(appointmentId: string): Promise<RecordingContext> {
    const ctx = await this.deps.repo.contextByAppointment(appointmentId);
    if (!ctx) throw errors.notFound();
    return ctx;
  }

  private relation(principal: Principal, ctx: RecordingContext) {
    const facts = {
      ownerUserId: ctx.patientAccountUserId,
      assigned: ctx.doctorUserId !== null && ctx.doctorUserId === principal.userId,
    };
    return { facts, consent: can.consultation.recordingConsent(principal, facts) };
  }

  /** What the call screen shows about recording. Nothing is promised when it is off. */
  async state(principal: Principal, appointmentId: string): Promise<RecordingView> {
    const ctx = await this.context(appointmentId);
    const decision = assertAllowed(this.relation(principal, ctx).consent);
    if (!this.canRecord()) {
      return {
        enabled: false,
        consentText: null,
        agreed: { me: false, other: false },
        recording: false,
      };
    }
    const policy = await this.deps.repo.currentPolicy();
    const live = policy ? await this.deps.repo.liveConsents(ctx.consultationId, policy.id) : [];
    const mine = principal.userId;
    const theirs = decision.relation === "owner" ? ctx.doctorUserId : ctx.patientAccountUserId;
    const me = live.some((c) => c.userId === mine);
    return {
      // With no text in force nobody can agree, so recording is not offered.
      enabled: policy !== null,
      consentText:
        policy && !me
          ? {
              policyId: policy.id,
              version: policy.version,
              language: policy.language,
              body: policy.body,
            }
          : null,
      agreed: { me, other: theirs !== null && live.some((c) => c.userId === theirs) },
      recording: (await this.deps.repo.activeFor(ctx.consultationId)) !== null,
    };
  }

  /** This person agrees, for this consultation, to the text in force. */
  async consent(
    principal: Principal,
    appointmentId: string,
    input: RecordingConsentBody,
    ip: string | null,
  ): Promise<RecordingView> {
    if (!this.canRecord()) throw errors.notFound();
    const ctx = await this.context(appointmentId);
    const decision = assertAllowed(this.relation(principal, ctx).consent);
    if (ctx.consultationStatus !== "pending" && ctx.consultationStatus !== "live") {
      throw errors.conflict({ detail: "This consultation has ended." });
    }
    const policy = await this.deps.repo.currentPolicy();
    if (!policy) throw errors.unavailable({ detail: "Recording is not open." });
    // Only the text in force can be agreed to, so the record matches what the person was shown.
    if (input.policyId !== policy.id) {
      throw errors.validation([
        { path: "policyId", message: "Reload the page: this is not the current text." },
      ]);
    }
    const patient = decision.relation === "owner";
    await this.deps.repo.grantConsent({
      id: uuidv7(),
      userId: patient ? ctx.patientAccountUserId : principal.userId,
      patientId: patient ? ctx.patientId : null,
      policyId: policy.id,
      consultationId: ctx.consultationId,
      givenByUserId: patient && ctx.onBehalf ? principal.userId : null,
      ip,
    });
    return this.state(principal, appointmentId);
  }

  /**
   * This person takes their agreement back. Recording stops at once, whether or not the feature
   * is still on (a withdrawal is never refused).
   */
  async withdraw(principal: Principal, appointmentId: string): Promise<{ withdrawn: true }> {
    const ctx = await this.context(appointmentId);
    assertAllowed(this.relation(principal, ctx).consent);
    const count = await this.deps.repo.withdrawConsent(ctx.consultationId, principal.userId);
    // Stop first: the person's wish is honoured even if the provider is slow to answer.
    const stopped = await this.stopForConsultation(ctx.consultationId, "consent_withdrawn");
    if (count === 0 && !stopped) {
      throw errors.conflict({ detail: "There is no recording agreement to withdraw." });
    }
    return { withdrawn: true };
  }

  /** The assigned doctor starts recording, once both people have agreed. */
  async start(principal: Principal, appointmentId: string): Promise<RecordingView> {
    if (!this.canRecord()) throw errors.notFound();
    const ctx = await this.context(appointmentId);
    assertAllowed(
      can.consultation.recordingControl(principal, this.relation(principal, ctx).facts),
    );
    const retentionDays = this.deps.retentionDays();
    if (retentionDays === undefined) {
      logger.error({ event: "recording_retention_missing" });
      throw errors.unavailable({ detail: "Recording is not open." });
    }
    if (ctx.consultationStatus !== "live") {
      throw errors.conflict({ detail: "Recording can start once the call is live." });
    }
    const policy = await this.deps.repo.currentPolicy();
    if (!policy) throw errors.unavailable({ detail: "Recording is not open." });
    const live = await this.deps.repo.liveConsents(ctx.consultationId, policy.id);
    const patientConsent = live.find((c) => c.userId === ctx.patientAccountUserId);
    const doctorConsent = live.find((c) => c.userId === ctx.doctorUserId);
    if (!patientConsent || !doctorConsent) {
      throw new AppError("consent_required", {
        detail: "Both of you must agree to recording first.",
        issues: [
          ...(patientConsent ? [] : [{ path: "consent", message: "patient" }]),
          ...(doctorConsent ? [] : [{ path: "consent", message: "doctor" }]),
        ],
      });
    }
    if (await this.deps.repo.activeFor(ctx.consultationId)) {
      throw errors.conflict({ detail: "This call is already being recorded." });
    }

    const video = this.deps.video();
    const recordingId = uuidv7();
    const objectKey = this.deps.newKey();
    try {
      // The row first: it is refused unless both agreements are live (trigger) and there is no
      // other active recording (unique index). A withdrawal after this point finds it and stops it.
      await this.deps.repo.insert({
        id: recordingId,
        consultationId: ctx.consultationId,
        patientConsentId: patientConsent.id,
        doctorConsentId: doctorConsent.id,
        objectKey,
        retentionDays,
      });
    } catch (error) {
      const e = error as { code?: string; constraint?: string };
      if (e.code === "23505") {
        throw errors.conflict({ detail: "This call is already being recorded." });
      }
      if (e.code === "23514") {
        throw new AppError("consent_required", {
          detail: "Both of you must agree to recording first.",
        });
      }
      throw error;
    }

    let ref: string;
    try {
      ({ recordingRef: ref } = await (
        video.startRecording as NonNullable<VideoProvider["startRecording"]>
      )(ctx.roomRef, { bucket: this.deps.bucket(), objectKey }));
    } catch (error) {
      await this.deps.repo.markFailed(recordingId);
      if (error instanceof AdapterError) {
        logger.error({ event: "recording_start_failed", kind: error.kind });
        throw errors.unavailable({ detail: "Recording could not start. The call goes on." });
      }
      throw error;
    }
    if (!(await this.deps.repo.setProviderRef(recordingId, ref))) {
      // Stopped (consent withdrawn or the call ended) while the provider was starting: undo it.
      await this.stopAtProvider(ref);
    }
    // A withdrawal can commit in the instant between the check above and this row becoming
    // visible, and its own stop would then find nothing. Look once more, now that the row is
    // visible to everyone: either that stop sees it, or the withdrawal is already in the books.
    const still = await this.deps.repo.liveConsents(ctx.consultationId, policy.id);
    if (
      !still.some((c) => c.userId === ctx.patientAccountUserId) ||
      !still.some((c) => c.userId === ctx.doctorUserId)
    ) {
      await this.stopForConsultation(ctx.consultationId, "consent_withdrawn");
    }
    logger.info({ event: "recording_started" });
    return this.state(principal, appointmentId);
  }

  /** The assigned doctor stops recording; the call goes on. */
  async stop(principal: Principal, appointmentId: string): Promise<RecordingView> {
    const ctx = await this.context(appointmentId);
    assertAllowed(
      can.consultation.recordingControl(principal, this.relation(principal, ctx).facts),
    );
    if (!(await this.stopForConsultation(ctx.consultationId, "stopped_by_doctor"))) {
      throw errors.conflict({ detail: "This call is not being recorded." });
    }
    return this.state(principal, appointmentId);
  }

  private async stopAtProvider(ref: string): Promise<boolean> {
    try {
      await (this.deps.video().stopRecording as NonNullable<VideoProvider["stopRecording"]>)(ref);
      return true;
    } catch (error) {
      // The call could still be recorded: this line is an alert for operations.
      logger.error({
        event: "recording_stop_failed",
        kind: error instanceof AdapterError ? error.kind : "unknown",
      });
      return false;
    }
  }

  /**
   * Stops the active recording of a consultation, if there is one, and hands the file to the
   * worker. Called when the doctor stops it, when either person withdraws, and when the
   * consultation ends. Returns whether a recording was running. Never throws for provider trouble:
   * ending a call or honouring a withdrawal must not depend on the provider.
   */
  async stopForConsultation(consultationId: string, reason: string): Promise<boolean> {
    const active = await this.deps.repo.activeFor(consultationId);
    if (!active) return false;
    const stopped = active.providerRef ? await this.stopAtProvider(active.providerRef) : true;
    if (!stopped) {
      await this.deps.repo.markFailed(active.id);
      return true;
    }
    if (await this.deps.repo.markStopped(active.id)) {
      try {
        await this.deps.enqueueStore(active.id);
      } catch (error) {
        // The daily sweep finds a stopped recording whose job was lost.
        logger.error({ event: "recording_enqueue_failed", err: error });
      }
      logger.info({ event: "recording_stopped", reason });
    }
    return true;
  }

  /**
   * The worker's check of a stopped recording's file: it must exist, be a real mp4 and be within
   * the size limit; then it is registered as a file and the recording is finished. A file that
   * is not there yet throws, so the queue retries; a file that fails its checks is deleted.
   */
  async finalize(recordingId: string): Promise<"stored" | "rejected" | "skipped"> {
    const row = await this.deps.repo.find(recordingId);
    if (!row || row.status !== "stopped" || !row.objectKey) return "skipped";
    const storage = this.deps.storage();
    const found = await storage.inspect(row.objectKey);
    if (!found) throw new Error("the recording has not arrived yet");
    const policy = PURPOSE_POLICY.recording;
    const type = detectType(found.head);
    if (found.sizeBytes <= 0 || found.sizeBytes > policy.maxBytes || type !== "video/mp4") {
      await storage.remove("recording", row.objectKey);
      await this.deps.repo.markFailed(row.id);
      logger.error({ event: "recording_rejected" });
      return "rejected";
    }
    if (!row.doctorUserId) throw new Error("recording has no doctor");
    const sha256 = await storage.sha256Of(row.objectKey);
    const done = await this.deps.repo.registerStored({
      recordingId: row.id,
      fileId: uuidv7(),
      ownerUserId: row.doctorUserId,
      patientId: row.patientId,
      storageKey: row.objectKey,
      sizeBytes: found.sizeBytes,
      sha256,
    });
    return done ? "stored" : "skipped";
  }

  /**
   * The daily job: deletes recordings past their retention date (the object first, then the
   * records), re-queues stopped recordings whose job was lost, and fails recordings that were
   * never stopped. Safe to run twice.
   */
  async sweep(): Promise<{ deleted: number; requeued: number; failed: number }> {
    const storage = this.deps.storage();
    let deleted = 0;
    for (const row of await this.deps.repo.expired(200)) {
      // A storage outage throws, so the queue retries; the records stay until the object is gone.
      if (row.objectKey) await storage.remove("recording", row.objectKey);
      await this.deps.repo.markDeleted(row.id, row.fileId);
      deleted++;
    }
    const abandoned = await this.deps.repo.failAbandoned(24);
    if (abandoned > 0) logger.error({ event: "recording_file_missing", abandoned });
    let requeued = 0;
    for (const id of await this.deps.repo.staleStopped(15, 200)) {
      await this.deps.enqueueStore(id);
      requeued++;
    }
    const failed = (await this.deps.repo.failRunaway(6)) + abandoned;
    if (failed > 0) logger.error({ event: "recording_runaway", failed });
    return { deleted, requeued, failed };
  }
}
