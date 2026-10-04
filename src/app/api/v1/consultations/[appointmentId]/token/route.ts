import { withApi } from "@/lib/api/with-api";
import { appointmentParams, getConsultations } from "@/modules/consultations";

// A fresh token for someone already in the room (P6-04), asked for when the video SDK warns that
// theirs is about to lapse. Refused once the consultation ended or the seat was revoked.

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/consultations/:appointmentId/token",
    auth: "session",
    roles: ["patient", "doctor"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "write",
    params: appointmentParams,
    audit: { action: "consultation.token", entity: "appointment" },
    doc: { summary: "Renew the video token", tags: ["consultations"] },
  },
  async ({ actor, params }) => getConsultations().renew(actor, params.appointmentId),
);
