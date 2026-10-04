import { withApi } from "@/lib/api/with-api";
import { appointmentParams, getConsultations } from "@/modules/consultations";

// Join the video room for an appointment (P6-03). The server checks, in order: the caller is the
// patient's account or the assigned doctor, the appointment is booked and (for the patient) paid,
// now is inside the join window, and the patient has agreed to the video terms. The answer is the
// room, this person's own number in it, and a token for that room and number only.

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/consultations/:appointmentId/join",
    auth: "session",
    roles: ["patient", "doctor"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "write",
    params: appointmentParams,
    audit: { action: "consultation.join", entity: "appointment" },
    doc: { summary: "Join the video consultation", tags: ["consultations"] },
  },
  async ({ actor, params }) => getConsultations().join(actor, params.appointmentId),
);
