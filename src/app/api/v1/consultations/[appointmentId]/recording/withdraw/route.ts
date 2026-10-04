import { withApi } from "@/lib/api/with-api";
import { appointmentParams, getRecording } from "@/modules/consultations";

// One person takes their recording agreement back (P6-08). A recording in progress stops at once.
// Never refused because the feature is off.

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/consultations/:appointmentId/recording/withdraw",
    auth: "session",
    roles: ["patient", "doctor"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "write",
    params: appointmentParams,
    audit: { action: "consultation.recording_withdraw", entity: "appointment" },
    doc: { summary: "Withdraw the recording agreement", tags: ["consultations"] },
  },
  async ({ actor, params }) => getRecording().withdraw(actor, params.appointmentId),
);
