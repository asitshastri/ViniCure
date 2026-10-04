// Browser calls for booking (P4-08): hold a slot, release it. The server decides everything that
// matters: who owns the profile, whether the time is free, the fee. These functions only send the
// request and translate the answer into words for the screen.

type Json = Record<string, unknown>;

async function call(method: string, path: string, body?: unknown, key?: string) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(key ? { "idempotency-key": key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: Json = {};
  try {
    json = (await response.json()) as Json;
  } catch {
    // No body or not JSON.
  }
  return { status: response.status, json };
}

export type HoldInput = {
  patientId: string;
  doctorId: string;
  /** The start of the free slot, as the ISO time the server listed. */
  startAt: string;
  reason: string;
  attendingAdult?: { name: string; relation: string };
};

export type HoldOutcome =
  | { status: "ok"; appointmentId: string; expiresAt: number; feePaise: number }
  | { status: "taken" }
  | { status: "limit"; message: string }
  | { status: "fields"; errors: Record<string, string> }
  | { status: "signin" }
  | { status: "error"; message: string };

/** One key per attempt, so a double click or a retry cannot hold two slots. */
export async function holdAppointment(input: HoldInput): Promise<HoldOutcome> {
  const { status, json } = await call("POST", "/api/v1/appointments", input, crypto.randomUUID());
  if (status === 201) {
    return {
      status: "ok",
      appointmentId: String(json.id),
      expiresAt: new Date(String(json.holdExpiresAt)).getTime(),
      feePaise: Number(json.feePaise),
    };
  }
  if (status === 409 && json.code === "slot_taken") return { status: "taken" };
  if (status === 409) {
    return { status: "limit", message: String(json.detail ?? "You cannot hold another slot now.") };
  }
  if (status === 422) {
    const errors: Record<string, string> = {};
    for (const issue of (json.errors as { path: string; message: string }[] | undefined) ?? []) {
      const key = issue.path.startsWith("attendingAdult") ? "adult" : issue.path;
      errors[key] ??= issue.message;
    }
    if (Object.keys(errors).length > 0) return { status: "fields", errors };
  }
  if (status === 401 || status === 403) return { status: "signin" };
  if (status === 404) {
    return {
      status: "error",
      message: "We could not find that profile or doctor. Reload and try again.",
    };
  }
  return { status: "error", message: "We could not hold the slot. Try again in a moment." };
}

/** Lets go of a held slot. True when it was released. */
export async function releaseAppointment(appointmentId: string): Promise<boolean> {
  const { status } = await call(
    "POST",
    `/api/v1/appointments/${encodeURIComponent(appointmentId)}/cancel`,
    { reason: "changed_mind" },
  );
  return status === 200;
}
