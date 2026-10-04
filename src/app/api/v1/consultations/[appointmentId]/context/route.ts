import { withApi } from "@/lib/api/with-api";
import { appointmentParams, getConsultations } from "@/modules/consultations";

// What the assigned doctor sees when opening a consultation (P6-07): who the patient is and what
// they wrote when booking. Only the assigned doctor (404 for anyone else). Every read is written
// to the PHI access log before anything is returned.

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/consultations/:appointmentId/context",
    auth: "session",
    roles: ["doctor"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "auth_read",
    params: appointmentParams,
    audit: { action: "consultation.context", entity: "appointment" },
    doc: {
      summary: "The patient details for the doctor's consultation screen",
      tags: ["consultations"],
    },
  },
  async ({ actor, params }) => getConsultations().console(actor, params.appointmentId),
);
