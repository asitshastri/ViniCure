// Browser calls for the patient's appointments (P4-08): cancel, move, review. The server decides
// whether each is allowed; these only send the request and turn the answer into words.

type Json = Record<string, unknown>;

async function call(method: string, path: string, body: unknown) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: Json = {};
  try {
    json = (await response.json()) as Json;
  } catch {
    // No body or not JSON.
  }
  return { status: response.status, json };
}

const enc = encodeURIComponent;

export type ChangeOutcome =
  | { status: "ok" }
  | { status: "taken" }
  | { status: "refused"; message: string }
  | { status: "error" };

/** The screen's reasons, mapped to the fixed list the server accepts. No free text is sent. */
const REASON: Record<string, string> = {
  conflict: "schedule_conflict",
  better: "changed_mind",
  doctor: "changed_mind",
  mistake: "booked_by_mistake",
  other: "other",
};

export async function cancelBooking(id: string, reasonId: string): Promise<ChangeOutcome> {
  const { status, json } = await call("POST", `/api/v1/appointments/${enc(id)}/cancel`, {
    reason: REASON[reasonId] ?? "other",
  });
  if (status === 200) return { status: "ok" };
  if (status === 409)
    return { status: "refused", message: String(json.detail ?? "This cannot be cancelled now.") };
  return { status: "error" };
}

export async function moveBooking(id: string, startAt: string): Promise<ChangeOutcome> {
  const { status, json } = await call("POST", `/api/v1/appointments/${enc(id)}/reschedule`, {
    startAt,
  });
  if (status === 200) return { status: "ok" };
  if (status === 409 && json.code === "slot_taken") return { status: "taken" };
  if (status === 409)
    return { status: "refused", message: String(json.detail ?? "This cannot be moved now.") };
  return { status: "error" };
}

export async function reviewBooking(
  id: string,
  rating: number,
  comment: string,
): Promise<ChangeOutcome> {
  const text = comment.trim();
  const { status, json } = await call("POST", `/api/v1/appointments/${enc(id)}/review`, {
    rating,
    ...(text.length >= 3 ? { comment: text } : {}),
  });
  if (status === 201) return { status: "ok" };
  if (status === 409)
    return { status: "refused", message: String(json.detail ?? "This cannot be reviewed.") };
  return { status: "error" };
}
