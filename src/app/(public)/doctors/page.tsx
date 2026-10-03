import type { Metadata } from "next";
import { MagnifyingGlass } from "@phosphor-icons/react/ssr";
import { ActiveFilters, activeFilterCount } from "@/components/doctors/active-filters";
import { DirectoryFilters } from "@/components/doctors/directory-filters";
import { DoctorCard } from "@/components/doctors/doctor-card";
import { PaginationLinks } from "@/components/doctors/pagination-links";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getDirectoryFacets, searchDoctors } from "@/lib/data/doctors";
import { parseDirectoryQuery } from "@/lib/schemas/doctors";

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
  const { specialties, languages } = getDirectoryFacets();
  const result = searchDoctors(query);
  const count = activeFilterCount(query);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-3xl font-semibold sm:text-4xl">Find a doctor</h1>
      <p className="text-ink-muted mt-2 max-w-2xl text-lg">
        Every doctor here has a verified medical council registration. Sample profiles for now.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[18rem_1fr] lg:gap-10">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <DirectoryFilters
            query={query}
            specialties={specialties}
            languages={languages}
            activeCount={count}
          />
        </aside>

        <section aria-labelledby="results-heading" className="grid min-w-0 content-start gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="results-heading" className="text-xl font-semibold" aria-live="polite">
              {result.total} {result.total === 1 ? "doctor" : "doctors"} found
            </h2>
            {result.pageCount > 1 ? (
              <p className="text-ink-muted text-sm">
                Page {result.page} of {result.pageCount}
              </p>
            ) : null}
          </div>
          <ActiveFilters query={query} specialties={specialties} />

          {result.items.length ? (
            <ul className="grid gap-4">
              {result.items.map((d) => (
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

          <PaginationLinks query={query} page={result.page} pageCount={result.pageCount} />
        </section>
      </div>
    </div>
  );
}
