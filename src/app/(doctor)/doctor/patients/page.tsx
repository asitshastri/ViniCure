import type { Metadata } from "next";
import Link from "next/link";
import { MagnifyingGlass, Users } from "@phosphor-icons/react/ssr";
import { PatientsView } from "@/components/doctor/patients-view";
import { PageHeader } from "@/components/shell/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { getDoctorPatients } from "@/lib/data/doctor";

export const metadata: Metadata = { title: "Patients" };

const FILTERS = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "followup", label: "Follow-up" },
] as const;

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; kind?: string | string[] }>;
}) {
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = (first(sp.q) ?? "").slice(0, 80).trim();
  const kind = FILTERS.find((f) => f.id === first(sp.kind))?.id ?? "all";
  const all = getDoctorPatients();
  const list = all.filter(
    (p) =>
      (kind === "all" || p.kind === kind) && (!q || p.name.toLowerCase().includes(q.toLowerCase())),
  );
  const href = (k: string) =>
    `/doctor/patients?${new URLSearchParams({ ...(q ? { q } : {}), ...(k !== "all" ? { kind: k } : {}) }).toString()}`.replace(
      /\?$/,
      "",
    );

  return (
    <>
      <PageHeader
        title="Patients"
        description="Only patients who booked you appear here. Opening a summary is logged."
      />
      <div className="mb-5 grid gap-4">
        <form
          action="/doctor/patients"
          method="get"
          role="search"
          aria-label="Search patients"
          className="flex max-w-xl gap-2"
        >
          {kind !== "all" ? <input type="hidden" name="kind" value={kind} /> : null}
          <div className="min-w-0 flex-1">
            <label htmlFor="pq" className="sr-only">
              Search by name
            </label>
            <Input
              id="pq"
              name="q"
              type="search"
              defaultValue={q}
              maxLength={80}
              placeholder="Search by name"
              autoComplete="off"
              leading={<MagnifyingGlass className="size-5" />}
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        <nav aria-label="Patient types">
          <ul className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <li key={f.id}>
                <Link
                  href={href(f.id)}
                  aria-current={kind === f.id ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium",
                    kind === f.id
                      ? "bg-primary border-primary text-white"
                      : "border-line-strong bg-surface hover:bg-primary-soft",
                  )}
                >
                  {f.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      {list.length ? (
        <PatientsView patients={list} />
      ) : (
        <EmptyState
          as="h2"
          icon={<Users />}
          title={all.length ? "No patients match" : "No patients yet"}
          description={
            all.length
              ? "Try another name or remove the filter."
              : "Patients appear after they book a consultation with you."
          }
          action={
            all.length ? <ButtonLink href="/doctor/patients">Show all</ButtonLink> : undefined
          }
        />
      )}
    </>
  );
}
