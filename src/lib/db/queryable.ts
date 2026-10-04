// The smallest database handle a repository needs. A pg Pool satisfies it; tests can
// pass a wrapper around an in-process Postgres. Only repo.ts files use it.
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Runs several statements as one unit: all of them happen or none do. The function gets a
 * Queryable bound to the one transaction. Used where a change must not be seen half done.
 */
export interface TxRunner {
  transaction<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
}
