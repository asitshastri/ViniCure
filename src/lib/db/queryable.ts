// The smallest database handle a repository needs. A pg Pool satisfies it; tests can
// pass a wrapper around an in-process Postgres. Only repo.ts files use it.
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}
