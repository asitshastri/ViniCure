import { withApi } from "@/lib/api/with-api";
import { appointmentParams, getConsultations } from "@/modules/consultations";

// The assigned doctor ends the consultation for everyone (P6-04). Every seat is revoked, so no
// token can be renewed afterwards.

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/consultations/:appointmentId/end",
    auth: "session",
    roles: ["doctor"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "write",
    params: appointmentParams,
    audit: { action: "consultation.end", entity: "appointment" },
    doc: { summary: "End the video consultation", tags: ["consultations"] },
  },
  async ({ actor, params }) => getConsultations().end(actor, params.appointmentId),
);
