import { logger as defaultLogger } from "../logging/logger";
import type { Logger } from "pino";
import { AdapterError } from "./types";

// Resilience wrapper for third-party adapters (CLAUDE.md, Reliability):
// timeout on every call, retries only for idempotent calls, a circuit breaker
// per provider, a defined fallback per method, and counters for each outcome.
//
// Only "unavailable" failures (timeouts, outages) count against the breaker and
// are retried. "invalid_input" and "rejected" are the caller's or the
// provider's answer, not an outage, so they pass straight through.

export type MetricEvent =
  | "call"
  | "success"
  | "failure"
  | "timeout"
  | "retry"
  | "circuit_open"
  | "circuit_rejected"
  | "fallback";

export type MetricsSink = (
  event: MetricEvent,
  labels: { provider: string; method: string },
) => void;

export type Clock = {
  now(): number;
  sleep(ms: number): Promise<void>;
};

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export type BreakerOptions = {
  /** Consecutive outage failures that open the circuit. */
  failureThreshold: number;
  /** How long the circuit stays open before one probe call is allowed. */
  openMs: number;
};

export type MethodPolicy<T = unknown> = {
  timeoutMs: number;
  /** Retries are allowed only when repeating the call is safe. Default false. */
  idempotent?: boolean;
  /** Extra attempts after the first for an idempotent call. Default 2. */
  maxRetries?: number;
  /** Base delay for exponential backoff with jitter. Default 200. */
  backoffMs?: number;
  /** What to return when the provider is down. Without it the call fails with "unavailable". */
  fallback?: (error: AdapterError) => T | Promise<T>;
};

type BreakerState = "closed" | "open" | "half_open";

export class CircuitBreaker {
  private state: BreakerState = "closed";
  private failures = 0;
  private openedAt = 0;
  private probing = false;

  constructor(
    private readonly options: BreakerOptions,
    private readonly clock: Clock,
  ) {}

  get current(): BreakerState {
    return this.state;
  }

  /** Returns false when the call must not be made. */
  allow(): boolean {
    if (this.state === "closed") return true;
    if (this.state === "open") {
      if (this.clock.now() - this.openedAt < this.options.openMs) return false;
      this.state = "half_open";
    }
    // Half open: exactly one probe at a time.
    if (this.probing) return false;
    this.probing = true;
    return true;
  }

  success(): void {
    this.state = "closed";
    this.failures = 0;
    this.probing = false;
  }

  /** Returns true when this failure opened the circuit. */
  failure(): boolean {
    this.probing = false;
    this.failures += 1;
    if (this.state === "half_open" || this.failures >= this.options.failureThreshold) {
      const wasOpen = this.state === "open";
      this.state = "open";
      this.openedAt = this.clock.now();
      return !wasOpen;
    }
    return false;
  }

  /** A caller error or provider refusal ends a probe without judging the outage. */
  neutral(): void {
    this.probing = false;
  }
}

export type ResilienceOptions = {
  provider: string;
  breaker?: BreakerOptions;
  metrics?: MetricsSink;
  clock?: Clock;
  logger?: Logger;
  random?: () => number;
};

const DEFAULT_BREAKER: BreakerOptions = { failureThreshold: 5, openMs: 30_000 };

export class Resilience {
  readonly breaker: CircuitBreaker;
  private readonly clock: Clock;
  private readonly logger: Logger;
  private readonly random: () => number;

  constructor(private readonly options: ResilienceOptions) {
    this.clock = options.clock ?? systemClock;
    this.logger = options.logger ?? defaultLogger;
    this.random = options.random ?? Math.random;
    this.breaker = new CircuitBreaker(options.breaker ?? DEFAULT_BREAKER, this.clock);
  }

  private count(event: MetricEvent, method: string) {
    this.options.metrics?.(event, { provider: this.options.provider, method });
  }

  private async attempt<T>(method: string, run: () => Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        run(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new AdapterError("unavailable", `${this.options.provider}.${method} timed out`),
              ),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async call<T>(method: string, run: () => Promise<T>, policy: MethodPolicy<T>): Promise<T> {
    this.count("call", method);
    const retries = policy.idempotent ? (policy.maxRetries ?? 2) : 0;
    let lastError: AdapterError | undefined;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (!this.breaker.allow()) {
        this.count("circuit_rejected", method);
        lastError = new AdapterError(
          "unavailable",
          `${this.options.provider} is temporarily unavailable`,
        );
        break;
      }
      try {
        const result = await this.attempt(method, run, policy.timeoutMs);
        this.breaker.success();
        this.count("success", method);
        return result;
      } catch (error) {
        if (error instanceof AdapterError && error.kind !== "unavailable") {
          // The provider answered. Not an outage, not retried.
          this.breaker.neutral();
          this.count("failure", method);
          throw error;
        }
        const timedOut = error instanceof Error && error.message.endsWith("timed out");
        this.count(timedOut ? "timeout" : "failure", method);
        lastError =
          error instanceof AdapterError
            ? error
            : new AdapterError("unavailable", `${this.options.provider}.${method} failed`, {
                cause: error,
              });
        if (this.breaker.failure()) {
          this.count("circuit_open", method);
          // Never include request data in this log line.
          this.logger.error({ event: "circuit_open", provider: this.options.provider });
        }
        if (attempt < retries) {
          this.count("retry", method);
          const base = policy.backoffMs ?? 200;
          await this.clock.sleep(base * 2 ** attempt * (0.5 + this.random()));
        }
      }
    }

    const failure = lastError ?? new AdapterError("unavailable", `${this.options.provider} failed`);
    if (policy.fallback) {
      this.count("fallback", method);
      this.logger.warn({ event: "adapter_fallback", provider: this.options.provider, method });
      return policy.fallback(failure);
    }
    throw failure;
  }
}

type AsyncMethods<A> = {
  [K in keyof A as A[K] extends (...args: never[]) => Promise<unknown> ? K : never]?: A[K] extends (
    ...args: never[]
  ) => Promise<infer R>
    ? MethodPolicy<R>
    : never;
};

/**
 * Wraps an adapter so every listed async method gets the resilience policy.
 * Methods not listed (such as the synchronous signature checks) pass through unchanged.
 */
export function protect<A extends object>(
  adapter: A,
  options: ResilienceOptions,
  policies: AsyncMethods<A>,
): A {
  const resilience = new Resilience(options);
  return new Proxy(adapter, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      const policy = (policies as Record<string, MethodPolicy<unknown> | undefined>)[
        String(property)
      ];
      if (typeof value !== "function" || !policy) return value;
      return (...args: unknown[]) =>
        resilience.call(
          String(property),
          () => (value as (...a: unknown[]) => Promise<unknown>).apply(target, args),
          policy,
        );
    },
  });
}
