import type { ZodError } from "zod";
import { logger as defaultLogger } from "../logging/logger";
import type { Logger } from "pino";
import { AppError, type FieldIssue } from "./app-error";
import { ERROR_CODES } from "./codes";

export type Problem = {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  requestId: string;
  errors?: FieldIssue[];
};

const TYPE_BASE = "https://vinicure.example/errors/";

// Zod issues become paths and messages only. The submitted value is never copied,
// because it can be a phone number, a note or a password.
export function zodToIssues(error: ZodError): FieldIssue[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    if (issue.code === "unrecognized_keys") {
      const keys = issue.keys.join(", ");
      return { path, message: `Unknown field: ${keys}` };
    }
    return { path, message: issue.message };
  });
}

/** Turns anything thrown into an AppError. Unknown errors become internal_error with no detail. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (isZodError(error)) {
    return new AppError("validation_failed", { issues: zodToIssues(error), cause: error });
  }
  if (error instanceof SyntaxError) {
    return new AppError("invalid_json", { cause: error });
  }
  return new AppError("internal_error", { cause: error });
}

function isZodError(error: unknown): error is ZodError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "ZodError" &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

export function toProblem(error: AppError, requestId: string): Problem {
  const problem: Problem = {
    type: `${TYPE_BASE}${error.code.replaceAll("_", "-")}`,
    title: error.title,
    status: error.status,
    code: error.code,
    detail: error.detail,
    requestId,
  };
  if (error.issues && error.issues.length > 0) problem.errors = error.issues;
  return problem;
}

type ResponseOptions = { requestId: string; logger?: Logger };

/** Builds the JSON error response. Logs server faults with the original error; 4xx at info level. */
export function problemResponse(
  error: unknown,
  { requestId, logger = defaultLogger }: ResponseOptions,
): Response {
  const appError = toAppError(error);
  const problem = toProblem(appError, requestId);

  if (appError.status >= 500) {
    logger.error({
      requestId,
      code: appError.code,
      status: appError.status,
      err: appError.cause ?? appError,
    });
  } else {
    logger.info({ requestId, code: appError.code, status: appError.status });
  }

  return new Response(JSON.stringify(problem), {
    status: appError.status,
    headers: {
      "Content-Type": "application/problem+json",
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
      ...appError.headers,
    },
  });
}

export const ALL_ERROR_CODES = Object.keys(ERROR_CODES) as (keyof typeof ERROR_CODES)[];
