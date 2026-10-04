import { withApi } from "@/lib/api/with-api";
import { appointmentParams, getRecording } from "@/modules/consultations";

// The assigned doctor stops recording (P6-08); the call goes on.

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/consultations/:appointmentId/recording/stop",
    auth: "session",
    roles: ["doctor"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "write",
    params: appointmentParams,
    audit: { action: "consultation.recording_stop", entity: "appointment" },
    doc: { summary: "Stop recording the consultation", tags: ["consultations"] },
  },
  async ({ actor, params }) => getRecording().stop(actor, params.appointmentId),
);
