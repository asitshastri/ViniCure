import { errors } from "./errors/app-error";

// Page links (cursors) are base64url JSON that the server made. The reader refuses anything that
// is not exactly the expected shape, so a forged link can only fail, never reach a query.

const bad = () => errors.validation([{ path: "cursor", message: "This page link is not valid." }]);

export function encodeCursor(value: { t: string; i: string }): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** t is a UTC time with microseconds, i is a UUID. */
export function decodeCursor(cursor: string): { t: string; i: string } {
  try {
    const p = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (
      typeof p.t !== "string" ||
      typeof p.i !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(p.t) ||
      !/^[0-9a-f-]{36}$/.test(p.i)
    ) {
      throw bad();
    }
    return { t: p.t, i: p.i };
  } catch {
    throw bad();
  }
}

/** SQL fragment that prints a timestamptz column with microseconds, matching decodeCursor. */
export const cursorTimeSql = (column: string): string =>
  "to_char(" + column + " AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')";
