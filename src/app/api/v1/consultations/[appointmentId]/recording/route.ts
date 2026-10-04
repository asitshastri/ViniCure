import { withApi } from "@/lib/api/with-api";
import { appointmentParams, getRecording } from "@/modules/consultations";

// What the call screen shows about recording (P6-08): whether it is offered, the text to agree
// to, who has agreed and whether the call is being recorded. Only the patient's account or the
// assigned doctor (404 for anyone else). With the feature off, the answer says so and nothing else.

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/consultations/:appointmentId/recording",
    auth: "session",
    roles: ["patient", "doctor"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "auth_read",
    params: appointmentParams,
    doc: { summary: "Recording state of the video consultation", tags: ["consultations"] },
  },
  async ({ actor, params }) => getRecording().state(actor, params.appointmentId),
);
