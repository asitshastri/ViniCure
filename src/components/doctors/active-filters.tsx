import Link from "next/link";
import { X } from "@phosphor-icons/react/ssr";
import {
  SORT_LABELS,
  directoryHref,
  type DirectoryQuery,
  type DoctorSort,
} from "@/lib/schemas/doctors";
import type { Specialty } from "@/lib/types";

export function activeFilterCount(q: DirectoryQuery): number {
  return [
    q.specialty,
    q.language,
    q.maxFee,
    q.today || undefined,
    q.sort !== "relevance" || undefined,
  ].filter(Boolean).length;
}

/** Removable chips. Each one is a link to the same search without that filter. */
export function ActiveFilters({
  query,
  specialties,
  sortLabels = SORT_LABELS,
}: {
  query: DirectoryQuery;
  specialties: Specialty[];
  sortLabels?: Record<DoctorSort, string>;
}) {
  const chips: Array<{ label: string; href: string }> = [];
  const without = (key: keyof DirectoryQuery) =>
    directoryHref(query, { [key]: undefined, page: 1 });
  if (query.q) chips.push({ label: `Search: ${query.q}`, href: without("q") });
  if (query.specialty) {
    const name = specialties.find((s) => s.slug === query.specialty)?.name ?? query.specialty;
    chips.push({ label: name, href: without("specialty") });
  }
  if (query.language) chips.push({ label: query.language, href: without("language") });
  if (query.maxFee) chips.push({ label: `Up to ₹${query.maxFee}`, href: without("maxFee") });
  if (query.today)
    chips.push({ label: "Available today", href: directoryHref(query, { today: false, page: 1 }) });
  if (query.sort !== "relevance")
    chips.push({
      label: `Sorted: ${sortLabels[query.sort]}`,
      href: directoryHref(query, { sort: "relevance", page: 1 }),
    });
  if (!chips.length) return null;
  return (
    <ul aria-label="Active filters" className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <li key={c.label}>
          <Link
            href={c.href}
            className="border-line-strong bg-surface text-ink hover:bg-primary-soft inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors"
          >
            {c.label}
            <X aria-hidden className="size-3.5" />
            <span className="sr-only">Remove filter</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
