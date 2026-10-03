import { randomUUID } from "node:crypto";
import pino, { type Logger, type LoggerOptions } from "pino";
import { redact } from "./redact";

const LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
type Level = (typeof LEVELS)[number];

function resolveLevel(raw: string | undefined): Level {
  return LEVELS.find((level) => level === raw) ?? "info";
}

export function buildLoggerOptions(level?: string): LoggerOptions {
  return {
    level: resolveLevel(level),
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    // Authorization and Cookie headers are dropped outright, not only masked.
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "headers.authorization",
        "headers.cookie",
      ],
      remove: true,
    },
    formatters: {
      level: (label) => ({ level: label }),
      // Every bound field and every log object goes through the key-based scrubber.
      log: (object) => redact(object) as Record<string, unknown>,
      bindings: (bindings) => redact(bindings) as Record<string, unknown>,
    },
  };
}

export const logger: Logger = pino(buildLoggerOptions(process.env.LOG_LEVEL));

// Request IDs from outside are accepted only in a safe shape, so they cannot inject log content.
const SAFE_REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

export function newRequestId(incoming?: string | null): string {
  return incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
}

export type RequestLogContext = {
  requestId: string;
  route?: string;
  method?: string;
  userId?: string;
  module?: string;
};

// pino skips the bindings formatter for child loggers, so scrub here.
// Always create child loggers through this function, never with `.child()`.
export function childLogger(bindings: Record<string, unknown>, base: Logger = logger): Logger {
  return base.child(redact(bindings) as Record<string, unknown>);
}

export function requestLogger(context: RequestLogContext, base: Logger = logger): Logger {
  return childLogger(context, base);
}
