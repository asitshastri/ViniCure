import type { Metadata } from "next";
import { MagnifyingGlass } from "@phosphor-icons/react/ssr";
import { ActiveFilters, activeFilterCount } from "@/components/doctors/active-filters";
import { DirectoryFilters } from "@/components/doctors/directory-filters";
import { DoctorCard } from "@/components/doctors/doctor-card";
import { CursorLinks, PaginationLinks } from "@/components/doctors/pagination-links";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getDirectoryFacets, searchDoctors } from "@/lib/data/doctors";
import { REAL_SORTS, REAL_SORT_LABELS, parseDirectoryQuery } from "@/lib/schemas/doctors";
import { realFacets, realSearch, isRealDirectory } from "@/lib/data/directory-real";

export const metadata: Metadata = {
  title: "Find a doctor | ViniCure",
  description: "Search registered doctors by symptom, specialty, language and fee.",
};

export default async function DoctorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseDirectoryQuery(await searchParams);
  const real = isRealDirectory();
  const { specialties, languages } = real ? await realFacets() : getDirectoryFacets();
  // The sample data pages by number; the real directory pages by cursor and has no total.
  const sample = real ? undefined : searchDoctors(query);
  const live = real ? await realSearch(query) : undefined;
  const items = sample?.items ?? live?.items ?? [];
  const count = activeFilterCount(query);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-3xl font-semibold sm:text-4xl">Find a doctor</h1>
      <p className="text-ink-muted mt-2 max-w-2xl text-lg">
        Every doctor here has a verified medical council registration.
        {real ? "" : " Sample profiles for now."}
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[18rem_1fr] lg:gap-10">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <DirectoryFilters
            query={query}
            specialties={specialties}
            languages={languages}
            activeCount={count}
            {...(real ? { real: { sorts: REAL_SORTS, labels: REAL_SORT_LABELS } } : {})}
          />
        </aside>

        <section aria-labelledby="results-heading" className="grid min-w-0 content-start gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="results-heading" className="text-xl font-semibold" aria-live="polite">
              {sample
                ? `${sample.total} ${sample.total === 1 ? "doctor" : "doctors"} found`
                : `${items.length} ${items.length === 1 ? "doctor" : "doctors"} shown`}
            </h2>
            {sample && sample.pageCount > 1 ? (
              <p className="text-ink-muted text-sm">
                Page {sample.page} of {sample.pageCount}
              </p>
            ) : null}
          </div>
          <ActiveFilters
            query={query}
            specialties={specialties}
            {...(real ? { sortLabels: REAL_SORT_LABELS } : {})}
          />

          {items.length ? (
            <ul className="grid gap-4">
              {items.map((d) => (
                <li key={d.id}>
                  <DoctorCard doctor={d} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<MagnifyingGlass />}
              title="No doctors match these filters"
              description="Try a different spelling, remove a filter, or start with a general physician who can refer you."
              action={<ButtonLink href="/doctors">Clear all filters</ButtonLink>}
            />
          )}

          {sample ? (
            <PaginationLinks query={query} page={sample.page} pageCount={sample.pageCount} />
          ) : (
            <CursorLinks query={query} nextCursor={live?.nextCursor ?? null} />
          )}
        </section>
      </div>
    </div>
  );
}
