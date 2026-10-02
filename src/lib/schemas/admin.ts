type Raw = Record<string, string | string[] | undefined>;

export type TableSpec = {
  /** Columns that may be sorted. Anything else in the URL is ignored. */
  sorts: readonly string[];
  defaultSort: string;
  defaultDir?: "asc" | "desc";
  /** Filter name to its allowed values. */
  filters?: Record<string, readonly string[]>;
  pageSize?: number;
};

export type TableQuery = {
  sort: string;
  dir: "asc" | "desc";
  filters: Record<string, string>;
  q: string;
  page: number;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Reads a table's state from the URL. Only values on the allow-lists get through, so a made-up sort or filter does nothing. */
export function parseTableQuery(raw: Raw, spec: TableSpec): TableQuery {
  const s = first(raw.sort);
  const sort = s && spec.sorts.includes(s) ? s : spec.defaultSort;
  const d = first(raw.dir);
  const dir = d === "asc" || d === "desc" ? d : (spec.defaultDir ?? "asc");
  const filters: Record<string, string> = {};
  for (const [k, allowed] of Object.entries(spec.filters ?? {})) {
    const v = first(raw[k]);
    if (v && allowed.includes(v)) filters[k] = v;
  }
  const q = (first(raw.q) ?? "").slice(0, 60).trim();
  const p = Number(first(raw.page));
  const page = Number.isInteger(p) && p >= 1 && p <= 200 ? p : 1;
  return { sort, dir, filters, q, page };
}

/** Builds the same page's URL with changes. Defaults are left out. */
export function tableHref(
  base: string,
  query: TableQuery,
  spec: TableSpec,
  change: Partial<{
    sort: string;
    dir: string;
    page: number;
    filters: Record<string, string | undefined>;
    q: string;
  }>,
  extra: Record<string, string> = {},
): string {
  const p = new URLSearchParams(extra);
  const sort = change.sort ?? query.sort;
  const dir = change.dir ?? query.dir;
  if (sort !== spec.defaultSort || dir !== (spec.defaultDir ?? "asc")) {
    p.set("sort", sort);
    p.set("dir", dir);
  }
  const filters = { ...query.filters, ...(change.filters ?? {}) };
  for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
  const q = change.q ?? query.q;
  if (q) p.set("q", q);
  const page = change.page ?? query.page;
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}
