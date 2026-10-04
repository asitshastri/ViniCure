import { getVideoProvider } from "../../lib/adapters/registry";
import { getConfig } from "../../lib/config/config";
import { getDatabase, queryable, txRunner } from "../../lib/db/pool";
import { globalSingleton } from "../../lib/singleton";
import { getConsent } from "../consent";
import { ConsultationRepo } from "./repo";
import { ConsultationService } from "./service";

export * from "./schemas";
export { ConsultationService } from "./service";

const holder = globalSingleton("consultations", () => ({
  service: undefined as ConsultationService | undefined,
}));

export function getConsultations(): ConsultationService {
  holder.service ??= new ConsultationService({
    repo: new ConsultationRepo(queryable(getDatabase()), txRunner()),
    video: getVideoProvider,
    consent: { missingFor: (userId, patientId) => getConsent().missingFor(userId, patientId) },
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
}
