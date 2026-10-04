import { z } from "zod";

export const DOCTOR_SORTS = [
  "relevance",
  "soonest",
  "fee_asc",
  "fee_desc",
  "experience",
  "rating",
] as const;
export type DoctorSort = (typeof DOCTOR_SORTS)[number];

export const SORT_LABELS: Record<DoctorSort, string> = {
  relevance: "Best match",
  soonest: "Earliest available",
  fee_asc: "Fee, low to high",
  fee_desc: "Fee, high to low",
  experience: "Most experience",
  rating: "Highest rated",
};

/** Fee caps in rupees. Only these values are accepted from the URL. */
export const FEE_CAPS = [500, 750, 1000] as const;

export const PAGE_SIZE = 6;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .catch(undefined)
    .transform((v) => (v ? v : undefined));

const schema = z.object({
  q: text(80),
  specialty: text(40),
  language: text(20),
  maxFee: z.coerce
    .number()
    .refine((n) => (FEE_CAPS as readonly number[]).includes(n))
    .optional()
    .catch(undefined),
  today: z.literal("1").optional().catch(undefined),
  sort: z.enum(DOCTOR_SORTS).catch("relevance"),
  page: z.coerce.number().int().min(1).max(100).catch(1),
  cursor: text(300),
});

export type DirectoryQuery = {
  q?: string;
  specialty?: string;
  language?: string;
  maxFee?: number;
  today: boolean;
  sort: DoctorSort;
  page: number;
  /** Page link from the real directory (it pages by cursor, not by number). */
  cursor?: string;
};

type RawParams = Record<string, string | string[] | undefined>;

/** Reads the URL query. Anything unknown or malformed is dropped, never trusted. */
export function parseDirectoryQuery(raw: RawParams): DirectoryQuery {
  const first = (key: string) => {
    const v = raw[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const parsed = schema.parse({
    q: first("q"),
    specialty: first("specialty"),
    language: first("language"),
    maxFee: first("maxFee"),
    today: first("today"),
    sort: first("sort"),
    page: first("page"),
    cursor: first("cursor"),
  });
  const out: DirectoryQuery = { today: parsed.today === "1", sort: parsed.sort, page: parsed.page };
  if (parsed.q) out.q = parsed.q;
  if (parsed.specialty) out.specialty = parsed.specialty;
  if (parsed.language) out.language = parsed.language;
  if (parsed.maxFee) out.maxFee = parsed.maxFee;
  if (parsed.cursor) out.cursor = parsed.cursor;
  return out;
}

/** Builds a /doctors URL from a query, leaving out defaults. */
export function directoryHref(
  query: DirectoryQuery,
  overrides: Partial<Record<keyof DirectoryQuery, unknown>> = {},
): string {
  // A page link belongs to one search, so changing anything starts from the first page.
  const merged = { ...query, cursor: undefined, ...overrides } as Record<string, unknown>;
  const params = new URLSearchParams();
  for (const key of ["q", "specialty", "language", "maxFee"] as const) {
    const v = merged[key];
    if (v !== undefined && v !== "") params.set(key, String(v));
  }
  if (merged.today) params.set("today", "1");
  if (merged.sort && merged.sort !== "relevance") params.set("sort", String(merged.sort));
  if (typeof merged.page === "number" && merged.page > 1) params.set("page", String(merged.page));
  if (typeof merged.cursor === "string" && merged.cursor) params.set("cursor", merged.cursor);
  const qs = params.toString();
  return qs ? `/doctors?${qs}` : "/doctors";
}

/** What the real directory can sort by, and what to call each. The sample data supports all of them. */
export const REAL_SORTS: readonly DoctorSort[] = ["relevance", "fee_asc", "fee_desc"];
export const REAL_SORT_LABELS: Record<DoctorSort, string> = {
  ...SORT_LABELS,
  relevance: "Name, A to Z",
};
