import { logger } from "./logging/logger";
import { globalSingleton } from "./singleton";

// Graceful shutdown: modules register a close function (database pool, cache,
// queue), and the process runs them once on SIGTERM or SIGINT. The worker exits
// when they are done. The web server leaves exiting to Next.js, which drains
// in-flight requests first.

type Hook = { name: string; close: () => Promise<void> };

const state = globalSingleton("shutdown", () => ({
  hooks: [] as Hook[],
  installed: false,
  running: false,
}));

export function registerShutdownHook(name: string, close: () => Promise<void>): void {
  state.hooks.push({ name, close });
}

export async function runShutdownHooks(timeoutMs = 10_000): Promise<void> {
  if (state.running) return;
  state.running = true;
  const hooks = [...state.hooks].reverse(); // last registered, first closed
  await Promise.race([
    Promise.all(
      hooks.map(async (hook) => {
        try {
          await hook.close();
        } catch (err) {
          logger.error({ event: "shutdown_hook_failed", hook: hook.name, err });
        }
      }),
    ),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs).unref()),
  ]);
}

export function installSignalHandlers(options: { exit: boolean }): void {
  if (state.installed) return;
  state.installed = true;
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      logger.info({ event: "shutdown", signal });
      void runShutdownHooks().then(() => {
        if (options.exit) process.exit(0);
      });
    });
  }
}

export function resetLifecycleForTest(): void {
  state.hooks.length = 0;
  state.running = false;
  state.installed = false;
}
