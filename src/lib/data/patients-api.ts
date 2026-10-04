// Browser calls to /api/v1/patients (P2-09). The server decides who may see which profile;
// these functions only send the request and translate the answer.

export type PatientDto = {
  id: string;
  relation: string;
  fullName: string;
  dob: string;
  gender: string;
  isMinor: boolean;
};

export type SaveOutcome =
  | { status: "ok"; patient: PatientDto }
  | { status: "fields"; errors: Record<string, string> }
  | { status: "error"; message: string };

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

const FIELD_NAMES: Record<string, string> = { fullName: "name" };

function outcome(status: number, json: Json): SaveOutcome {
  if (status === 200 || status === 201)
    return { status: "ok", patient: json as unknown as PatientDto };
  if (status === 422) {
    const errors: Record<string, string> = {};
    for (const issue of (json.issues as { path: string; message: string }[] | undefined) ?? []) {
      const key = FIELD_NAMES[issue.path] ?? issue.path;
      errors[key] ??= issue.message;
    }
    if (Object.keys(errors).length > 0) return { status: "fields", errors };
  }
  if (status === 409) {
    return { status: "error", message: String(json.detail ?? "This could not be saved.") };
  }
  return { status: "error", message: "We could not save this. Try again in a moment." };
}

/** Null when the list could not be loaded. */
export async function list(): Promise<PatientDto[] | null> {
  const { status, json } = await call("GET", "/api/v1/patients");
  return status === 200 ? ((json.items as PatientDto[]) ?? []) : null;
}

export async function create(body: Json): Promise<SaveOutcome> {
  const { status, json } = await call("POST", "/api/v1/patients", body);
  return outcome(status, json);
}

export async function update(id: string, body: Json): Promise<SaveOutcome> {
  const { status, json } = await call("PATCH", `/api/v1/patients/${encodeURIComponent(id)}`, body);
  return outcome(status, json);
}

export async function remove(id: string): Promise<boolean> {
  const { status } = await call("DELETE", `/api/v1/patients/${encodeURIComponent(id)}`);
  return status === 204;
}
