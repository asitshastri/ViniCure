import { ERROR_CODES, type ErrorCode } from "./codes";

export type FieldIssue = { path: string; message: string };

type AppErrorOptions = {
  /** Safe text for the caller. Defaults to the catalogue text. Never put personal data here. */
  detail?: string;
  /** Field problems for validation_failed. Paths and messages only, never submitted values. */
  issues?: FieldIssue[];
  /** Extra response headers, such as Retry-After. */
  headers?: Record<string, string>;
  /** Original error, kept for the server log only. Never sent to the caller. */
  cause?: unknown;
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly title: string;
  readonly detail: string;
  readonly issues?: FieldIssue[];
  readonly headers?: Record<string, string>;

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    const entry = ERROR_CODES[code];
    super(options.detail ?? entry.detail, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = entry.status;
    this.title = entry.title;
    this.detail = options.detail ?? entry.detail;
    this.issues = options.issues;
    this.headers = options.headers;
  }
}

export const errors = {
  unauthenticated: (o?: AppErrorOptions) => new AppError("unauthenticated", o),
  forbidden: (o?: AppErrorOptions) => new AppError("forbidden", o),
  // Use for objects the caller does not own too, so existence is not revealed.
  notFound: (o?: AppErrorOptions) => new AppError("not_found", o),
  conflict: (o?: AppErrorOptions) => new AppError("conflict", o),
  slotTaken: (o?: AppErrorOptions) => new AppError("slot_taken", o),
  validation: (issues: FieldIssue[], o?: AppErrorOptions) =>
    new AppError("validation_failed", { ...o, issues }),
  rateLimited: (retryAfterSeconds: number, o?: AppErrorOptions) =>
    new AppError("rate_limited", {
      ...o,
      headers: { ...o?.headers, "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))) },
    }),
  unavailable: (o?: AppErrorOptions) => new AppError("unavailable", o),
  internal: (o?: AppErrorOptions) => new AppError("internal_error", o),
};
