import type { Metadata } from "next";
import Link from "next/link";
import { MagnifyingGlass } from "@phosphor-icons/react/ssr";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { lookupPatients } from "@/lib/data/staff";

export const metadata: Metadata = { title: "User lookup" };

const statusTone = { active: "success", suspended: "danger", pending: "warning" } as const;
const statusLabel = { active: "Active", suspended: "Suspended", pending: "Waiting to verify" };
const apptLabel = {
  completed: "Completed",
  upcoming: "Upcoming",
  cancelled: "Cancelled",
  no_show: "Patient did not join",
} as const;

export default async function LookupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").slice(0, 60);
  const results = lookupPatients(q);
  return (
    <>
      <PageHeader
        title="User lookup"
        description="Find a patient by name or user number. You see account and booking details only. Health records need break-glass access."
      />
      <form
        action="/staff/lookup"
        method="get"
        role="search"
        aria-label="Find a patient"
        className="mb-6 flex flex-wrap items-end gap-3"
      >
        <div className="min-w-0 flex-1 basis-64">
          <label htmlFor="lk-q" className="mb-1 block text-sm font-medium">
            Name or user number
          </label>
          <Input
            id="lk-q"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={60}
            autoComplete="off"
            leading={<MagnifyingGlass className="size-5" />}
          />
        </div>
        <Button type="submit">Search</Button>
      </form>
      {q.trim().length < 2 ? (
        <p className="text-ink-muted" role="status">
          Type at least 2 characters to search.
        </p>
      ) : results.length === 0 ? (
        <EmptyState
          icon={<MagnifyingGlass />}
          title="No patients found"
          description="Check the spelling or try the user number. Searching by phone number is not available."
        />
      ) : (
        <>
          <p className="text-ink-muted mb-3" role="status">
            {results.length} {results.length === 1 ? "patient" : "patients"} found.
          </p>
          <ul className="grid min-w-0 gap-4">
            {results.map((p) => (
              <li key={p.id} className="border-line bg-surface min-w-0 rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold">{p.name}</h2>
                    <p className="text-ink-muted text-sm">
                      {p.id}. {p.phoneMasked}. Joined {p.joined}
                    </p>
                  </div>
                  <Badge tone={statusTone[p.status]}>{statusLabel[p.status]}</Badge>
                </div>
                <h3 className="mt-3 text-sm font-semibold">Recent bookings</h3>
                {p.bookings.length === 0 ? (
                  <p className="text-ink-muted text-sm">No bookings yet.</p>
                ) : (
                  <ul className="mt-1 grid gap-1 text-sm">
                    {p.bookings.map((b) => (
                      <li key={b.id}>
                        {b.id}. {b.date}. {b.doctor}. {apptLabel[b.status]}
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  href={`/staff/break-glass?patient=${p.id}`}
                  className={buttonStyles({ variant: "secondary", size: "sm", className: "mt-3" })}
                >
                  Ask for record access<span className="sr-only"> for {p.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
