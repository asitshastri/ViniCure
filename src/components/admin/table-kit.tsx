import Link from "next/link";
import { CaretDown, CaretUp, CaretUpDown, MagnifyingGlass } from "@phosphor-icons/react/ssr";
import { Button, buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { tableHref, type TableQuery, type TableSpec } from "@/lib/schemas/admin";

type Ctx = { base: string; query: TableQuery; spec: TableSpec; extra?: Record<string, string> };

/** Column header that sorts by a link, so the sorted state is in the URL and works without JavaScript. */
export function ThLink({
  column,
  label,
  ctx,
  align = "left",
}: {
  column: string;
  label: string;
  ctx: Ctx;
  align?: "left" | "right";
}) {
  const active = ctx.query.sort === column;
  const nextDir = active && ctx.query.dir === "asc" ? "desc" : "asc";
  const Icon = !active ? CaretUpDown : ctx.query.dir === "asc" ? CaretUp : CaretDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (ctx.query.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("px-4 py-3 font-semibold", align === "right" && "text-right")}
    >
      <Link
        href={tableHref(
          ctx.base,
          ctx.query,
          ctx.spec,
          { sort: column, dir: nextDir, page: 1 },
          ctx.extra,
        )}
        className="hover:bg-primary-soft -mx-2 inline-flex min-h-9 items-center gap-1 rounded-md px-2"
      >
        {label}
        <Icon aria-hidden className="size-4" />
        <span className="sr-only">
          {active
            ? `, sorted ${ctx.query.dir === "asc" ? "ascending" : "descending"}. Sort ${nextDir === "asc" ? "ascending" : "descending"}`
            : ", sort ascending"}
        </span>
      </Link>
    </th>
  );
}

export type FilterDef = {
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
};

/** Search and filters as a plain GET form. Choices come from the same allow-lists the server checks. */
export function FilterBar({
  ctx,
  filters,
  searchLabel = "Search",
}: {
  ctx: Ctx;
  filters: FilterDef[];
  searchLabel?: string;
}) {
  const defaultState =
    ctx.query.sort === ctx.spec.defaultSort && ctx.query.dir === (ctx.spec.defaultDir ?? "asc");
  const active = Object.keys(ctx.query.filters).length > 0 || ctx.query.q;
  return (
    <form
      action={ctx.base}
      method="get"
      role="search"
      aria-label={`${searchLabel} and filter`}
      className="mb-4 flex flex-wrap items-end gap-3"
    >
      {Object.entries(ctx.extra ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {!defaultState ? (
        <>
          <input type="hidden" name="sort" value={ctx.query.sort} />
          <input type="hidden" name="dir" value={ctx.query.dir} />
        </>
      ) : null}
      <div className="min-w-0 flex-1 basis-56">
        <label htmlFor="tk-q" className="mb-1 block text-sm font-medium">
          {searchLabel}
        </label>
        <Input
          id="tk-q"
          name="q"
          type="search"
          defaultValue={ctx.query.q}
          maxLength={60}
          autoComplete="off"
          leading={<MagnifyingGlass className="size-5" />}
        />
      </div>
      {filters.map((f) => (
        <div key={f.name} className="basis-40">
          <label htmlFor={`tk-${f.name}`} className="mb-1 block text-sm font-medium">
            {f.label}
          </label>
          <Select id={`tk-${f.name}`} name={f.name} defaultValue={ctx.query.filters[f.name] ?? ""}>
            <option value="">All</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      ))}
      <Button type="submit">Apply</Button>
      {active ? (
        <Link
          href={
            ctx.extra && Object.keys(ctx.extra).length
              ? `${ctx.base}?${new URLSearchParams(ctx.extra)}`
              : ctx.base
          }
          className="text-primary min-h-11 content-center font-semibold underline"
        >
          Clear
        </Link>
      ) : null}
    </form>
  );
}

export function PageLinks({
  ctx,
  page,
  pageCount,
  total,
}: {
  ctx: Ctx;
  page: number;
  pageCount: number;
  total: number;
}) {
  const href = (n: number) => tableHref(ctx.base, ctx.query, ctx.spec, { page: n }, ctx.extra);
  if (total === 0) {
    const clearHref =
      ctx.extra && Object.keys(ctx.extra).length
        ? `${ctx.base}?${new URLSearchParams(ctx.extra)}`
        : ctx.base;
    return (
      <EmptyState
        className="mt-4"
        icon={<MagnifyingGlass />}
        title="Nothing matches"
        description="Try a different search or remove a filter."
        action={
          <Link href={clearHref} className={buttonStyles({ variant: "secondary" })}>
            Clear search and filters
          </Link>
        }
      />
    );
  }
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-ink-muted text-sm" aria-live="polite">
        {total} {total === 1 ? "result" : "results"}. Page {page} of {pageCount}.
      </p>
      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="flex gap-1">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={href(n)}
              aria-label={`Page ${n}`}
              aria-current={n === page ? "page" : undefined}
              className={cn(
                "inline-flex size-11 items-center justify-center rounded-lg font-medium sm:size-10",
                n === page ? "bg-primary text-white" : "hover:bg-primary-soft",
              )}
            >
              {n}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
