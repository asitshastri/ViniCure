import { clientIp, withApi } from "@/lib/api/with-api";
import { getConsent, grantConsentsBody } from "@/modules/consent";
import { appointmentIdParams } from "@/modules/scheduling";

// The agreements a patient must give before a video consultation (P6-05). GET lists the texts
// still to be agreed to for this appointment's patient; POST records agreement to the texts
// currently asked for. Only the account that owns the patient profile (404 for anyone else).

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/appointments/:id/consents",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "auth_read",
    params: appointmentIdParams,
    doc: { summary: "Texts to agree to before the video consultation", tags: ["consent"] },
  },
  async ({ actor, params }) => getConsent().required(actor, params.id),
);

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/appointments/:id/consents",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    fullSession: true,
    rateLimit: "write",
    params: appointmentIdParams,
    body: grantConsentsBody,
    audit: { action: "consent.grant", entity: "appointment" },
    doc: { summary: "Agree to the texts asked for this appointment", tags: ["consent"] },
  },
  async ({ actor, params, body, request }) =>
    getConsent().grant(actor, params.id, body, clientIp(request)),
);
