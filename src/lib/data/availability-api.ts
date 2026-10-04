// Browser calls for a doctor's own hours and time off (P4-08). The server checks the caller is the
// doctor and re-checks every rule; these only send the request and turn the answer into words.

import type { HoursView, TimeOffView } from "@/modules/scheduling/availability-schemas";

type Json = Record<string, unknown>;

async function call(method: string, path: string, body?: unknown) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: Json = {};
  try {
    json = (await response.json()) as Json;
  } catch {
    // No body (204) or not JSON.
  }
  return { status: response.status, json };
}

export type SaveOutcome =
  { status: "ok" } | { status: "fields"; message: string } | { status: "error"; message: string };

const firstIssue = (json: Json): string | undefined =>
  (json.errors as { message: string }[] | undefined)?.[0]?.message;

export async function saveHours(rules: HoursView["rules"]): Promise<SaveOutcome> {
  const { status, json } = await call("PUT", "/api/v1/doctor/availability", { rules });
  if (status === 200) return { status: "ok" };
  if (status === 422)
    return { status: "fields", message: firstIssue(json) ?? "Check the hours and try again." };
  return { status: "error", message: "We could not save your hours. Nothing changed. Try again." };
}

export type AddTimeOffOutcome =
  | { status: "ok"; item: TimeOffView; affected: number }
  | { status: "fields"; message: string }
  | { status: "error"; message: string };

export async function addTimeOff(input: {
  from: string;
  to: string;
  reason?: string;
}): Promise<AddTimeOffOutcome> {
  const { status, json } = await call("POST", "/api/v1/doctor/time-off", {
    from: input.from,
    to: input.to,
    ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
  });
  if (status === 201) {
    return {
      status: "ok",
      item: {
        id: String(json.id),
        from: String(json.from),
        to: String(json.to),
        reason: json.reason === null || json.reason === undefined ? null : String(json.reason),
      },
      affected: Number(json.affectedAppointments ?? 0),
    };
  }
  if (status === 422 || status === 409) {
    return {
      status: "fields",
      message: firstIssue(json) ?? String(json.detail ?? "Check the dates and try again."),
    };
  }
  return { status: "error", message: "We could not add this time off. Try again." };
}

export async function removeTimeOff(id: string): Promise<boolean> {
  const { status } = await call("DELETE", `/api/v1/doctor/time-off/${encodeURIComponent(id)}`);
  return status === 204;
}
