import { getVideoProvider } from "../../lib/adapters/registry";
import { getConfig } from "../../lib/config/config";
import { getDatabase, queryable, txRunner } from "../../lib/db/pool";
import { globalSingleton } from "../../lib/singleton";
import { AuditService } from "../../lib/audit/audit";
import { PgAuditStore } from "../../lib/audit/repo";
import { getCrypto } from "../../lib/crypto/crypto";
import { getConsent } from "../consent";
import { getQueue } from "../../lib/queue/producer";
import { isEnabled } from "../../lib/config/flags";
import { getStorage } from "../../lib/storage";
import { ConsultationRepo } from "./repo";
import { RecordingRepo } from "./recording-repo";
import { RecordingService } from "./recording";
import { ConsultationService } from "./service";

export * from "./schemas";
export { ConsultationService } from "./service";
export { RecordingService } from "./recording";

const holder = globalSingleton("consultations", () => ({
  service: undefined as ConsultationService | undefined,
  recording: undefined as RecordingService | undefined,
}));

export function getRecording(): RecordingService {
  holder.recording ??= new RecordingService({
    repo: new RecordingRepo(queryable(getDatabase()), txRunner()),
    video: getVideoProvider,
    enabled: () => isEnabled("recording"),
    retentionDays: () => getConfig().RECORDING_RETENTION_DAYS,
    newKey: () => getStorage().newKey("recording", "video/mp4"),
    bucket: () => {
      const bucket = getConfig().S3_BUCKET_RECORDINGS;
      if (!bucket) throw new Error("S3_BUCKET_RECORDINGS is not set");
      return bucket;
    },
    enqueueStore: async (recordingId) => {
      await (await getQueue()).enqueue("recording.store", { recordingId });
    },
    storage: getStorage,
  });
  return holder.recording;
}

export function getConsultations(): ConsultationService {
  holder.service ??= new ConsultationService({
    repo: new ConsultationRepo(queryable(getDatabase()), txRunner()),
    video: getVideoProvider,
    consent: { missingFor: (userId, patientId) => getConsent().missingFor(userId, patientId) },
    crypto: getCrypto,
    phiLog: (entry) =>
      new AuditService(new PgAuditStore(queryable(getDatabase()))).recordPhiAccess(entry),
    stopRecording: (consultationId) =>
      getRecording().stopForConsultation(consultationId, "call_ended"),
    appId: () => getConfig().AGORA_APP_ID ?? "fake_app_id",
    tokenTtlSeconds: () => getConfig().VIDEO_TOKEN_TTL_SECONDS,
    window: () => ({
      earlyMinutes: getConfig().VIDEO_JOIN_EARLY_MINUTES,
      lateMinutes: getConfig().VIDEO_JOIN_LATE_MINUTES,
    }),
  });
  return holder.service;
}

/** Replaces the service (tests). Pass undefined to reset. */
export function setConsultationsForTest(service: ConsultationService | undefined): void {
  holder.service = service;
  holder.recording = undefined;
}
