// Next.js can bundle the start-up hook (instrumentation.ts) and each route
// separately, so a plain module variable may exist in more than one copy. State
// that must be shared lives on globalThis under a registered symbol instead.
export function globalSingleton<T extends object>(name: string, init: () => T): T {
  const key = Symbol.for(`vinicure.${name}`);
  const store = globalThis as unknown as Record<symbol, T | undefined>;
  store[key] ??= init();
  return store[key] as T;
}
