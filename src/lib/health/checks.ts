import { globalSingleton } from "../singleton";

// Readiness checks. Each module that depends on a service (database, cache,
// storage) registers a read-only check at start-up. A check must not write.

export type ReadinessCheck = () => Promise<void>;

const CHECK_TIMEOUT_MS = 2000;
const checks = globalSingleton("readiness-checks", () => new Map<string, ReadinessCheck>());

export function registerReadinessCheck(name: string, check: ReadinessCheck): void {
  checks.set(name, check);
}

export function clearReadinessChecksForTest(): void {
  checks.clear();
}

export type ReadinessReport = {
  ready: boolean;
  checks: Record<string, "ok" | "fail">;
};

async function runWithTimeout(check: ReadinessCheck): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), CHECK_TIMEOUT_MS);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Runs every check in parallel. The report says ok or fail per name and nothing else. */
export async function runReadinessChecks(): Promise<ReadinessReport> {
  const entries = await Promise.all(
    [...checks.entries()].map(
      async ([name, check]) => [name, await runWithTimeout(check)] as const,
    ),
  );
  const report: ReadinessReport = { ready: true, checks: {} };
  for (const [name, ok] of entries) {
    report.checks[name] = ok ? "ok" : "fail";
    if (!ok) report.ready = false;
  }
  return report;
}
