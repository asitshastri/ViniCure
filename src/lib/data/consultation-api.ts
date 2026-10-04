// Browser calls for the video consultation (P6-06): join, renew, end and the consent step. The
// server decides everything (who, paid, when, consent); these only carry the answers back.

import type { JoinCredentials } from "@/lib/video";

type Json = Record<string, unknown>;

async function call(path: string, method: "GET" | "POST", body?: unknown) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  let json: Json = {};
  try {
    json = (await response.json()) as Json;
  } catch {
    // No body or not JSON.
  }
  return { status: response.status, json, code: String(json.code ?? "") };
}

export type JoinOutcome =
  | { status: "ok"; credentials: JoinCredentials; role: "patient" | "doctor"; expiresAt: string }
  | { status: "consent_required" }
  | { status: "outside_window" }
  | { status: "not_paid" }
  | { status: "step_up" }
  | { status: "not_open"; message: string }
  | { status: "ended" }
  | { status: "not_found" }
  | { status: "signin" }
  | { status: "unavailable" }
  | { status: "error" };

function credentialsOf(json: Json): JoinCredentials {
  return {
    appId: String(json.appId),
    channel: String(json.channel),
    uid: Number(json.uid),
    token: String(json.token),
  };
}

export async function joinConsultation(appointmentId: string): Promise<JoinOutcome> {
  const { status, json, code } = await call(
    `/api/v1/consultations/${encodeURIComponent(appointmentId)}/join`,
    "POST",
  );
  if (status === 200) {
    return {
      status: "ok",
      credentials: credentialsOf(json),
      role: json.role === "doctor" ? "doctor" : "patient",
      expiresAt: String(json.expiresAt),
    };
  }
  if (status === 401) return { status: "signin" };
  if (status === 404) return { status: "not_found" };
  if (status === 503) return { status: "unavailable" };
  if (code === "consent_required") return { status: "consent_required" };
  if (code === "outside_join_window") return { status: "outside_window" };
  if (code === "step_up_required") return { status: "step_up" };
  if (status === 403) {
    // Either payment is missing or the consultation has ended: the server's own words tell which.
    return /ended/i.test(String(json.detail ?? "")) ? { status: "ended" } : { status: "not_paid" };
  }
  if (status === 409) {
    return /ended/i.test(String(json.detail ?? ""))
      ? { status: "ended" }
      : {
          status: "not_open",
          message: String(json.detail ?? "This appointment cannot be joined."),
        };
  }
  return { status: "error" };
}

export type RenewOutcome =
  { status: "ok"; token: string; expiresAt: string } | { status: "ended" } | { status: "error" };

export async function renewToken(appointmentId: string): Promise<RenewOutcome> {
  const { status, json } = await call(
    `/api/v1/consultations/${encodeURIComponent(appointmentId)}/token`,
    "POST",
  );
  if (status === 200) {
    return { status: "ok", token: String(json.token), expiresAt: String(json.expiresAt) };
  }
  if (status === 403 || status === 404 || status === 409) return { status: "ended" };
  return { status: "error" };
}

export async function endConsultation(
  appointmentId: string,
): Promise<{ status: "ended" | "abandoned" | "error" }> {
  const { status, json } = await call(
    `/api/v1/consultations/${encodeURIComponent(appointmentId)}/end`,
    "POST",
  );
  if (status === 200 && (json.status === "ended" || json.status === "abandoned")) {
    return { status: json.status };
  }
  // Already over is the same as done.
  if (status === 409) return { status: "ended" };
  return { status: "error" };
}

export type ConsentText = { policyId: string; kind: string; version: string; body: string };

export async function loadConsents(
  appointmentId: string,
): Promise<
  { status: "ok"; required: ConsentText[] } | { status: "unavailable" } | { status: "error" }
> {
  const { status, json } = await call(
    `/api/v1/appointments/${encodeURIComponent(appointmentId)}/consents`,
    "GET",
  );
  if (status === 200 && Array.isArray(json.required)) {
    return {
      status: "ok",
      required: (json.required as Json[]).map((p) => ({
        policyId: String(p.policyId),
        kind: String(p.kind),
        version: String(p.version),
        body: String(p.body),
      })),
    };
  }
  if (status === 503) return { status: "unavailable" };
  return { status: "error" };
}

export async function agreeToConsents(
  appointmentId: string,
  policyIds: string[],
): Promise<{ status: "ok" } | { status: "stale" } | { status: "error" }> {
  const { status } = await call(
    `/api/v1/appointments/${encodeURIComponent(appointmentId)}/consents`,
    "POST",
    { policyIds },
  );
  if (status === 200) return { status: "ok" };
  if (status === 422) return { status: "stale" };
  return { status: "error" };
}
