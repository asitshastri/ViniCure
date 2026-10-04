import { withApi } from "@/lib/api/with-api";
import { appointmentParams, getRecording } from "@/modules/consultations";

// The assigned doctor starts recording (P6-08), only while the call is live and only when both
// people have agreed for this consultation. Closed (404) while the feature is off.

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/consultations/:appointmentId/recording/start",
    auth: "session",
    roles: ["doctor"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "write",
    params: appointmentParams,
    audit: { action: "consultation.recording_start", entity: "appointment" },
    doc: { summary: "Start recording the consultation", tags: ["consultations"] },
  },
  async ({ actor, params }) => getRecording().start(actor, params.appointmentId),
);
