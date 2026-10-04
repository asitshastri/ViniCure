import { clientIp, withApi } from "@/lib/api/with-api";
import { appointmentParams, getRecording, recordingConsentBody } from "@/modules/consultations";

// One person agrees to recording of this consultation (P6-08), to the text currently in force.
// The agreement covers this consultation only. Closed (404) while the feature is off.

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/consultations/:appointmentId/recording/consent",
    auth: "session",
    roles: ["patient", "doctor"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "write",
    params: appointmentParams,
    body: recordingConsentBody,
    audit: { action: "consultation.recording_consent", entity: "appointment" },
    doc: { summary: "Agree to recording this consultation", tags: ["consultations"] },
  },
  async ({ actor, params, body, request }) =>
    getRecording().consent(actor, params.appointmentId, body, clientIp(request)),
);
