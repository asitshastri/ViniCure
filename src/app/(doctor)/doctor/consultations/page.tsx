import type { Metadata } from "next";
import Link from "next/link";
import { CalendarBlank } from "@phosphor-icons/react/ssr";
import { ConsultList } from "@/components/doctor/consult-row";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { getDoctorConsults, getTodayDate } from "@/lib/data/doctor";

export const metadata: Metadata = { title: "Consultations" };

const TABS = [
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past" },
] as const;

export default async function ConsultationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const raw = (await searchParams).tab;
  const tab = TABS.find((t) => t.id === raw)?.id ?? "today";
  const today = getTodayDate();
  const all = getDoctorConsults();
  const lists = {
    today: all.filter((c) => c.date === today),
    upcoming: all
      .filter((c) => c.date > today && c.status === "upcoming")
      .sort((a, b) => a.minutesUntil - b.minutesUntil),
    past: all.filter((c) => c.date < today).sort((a, b) => b.date.localeCompare(a.date)),
  };
  const items = lists[tab].sort((a, b) =>
    tab === "past" ? 0 : a.time.localeCompare(b.time) * (tab === "today" ? 1 : 0),
  );

  return (
    <>
      <PageHeader
        title="Consultations"
        description="Open a consultation to see the patient, their files and to write the prescription."
      />
      <nav aria-label="Consultation lists" className="mb-6 min-w-0">
        <ul className="border-line flex gap-1 overflow-x-auto border-b">
          {TABS.map((t) => (
            <li key={t.id}>
              <Link
                href={`/doctor/consultations?tab=${t.id}`}
                aria-current={tab === t.id ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-4 font-semibold whitespace-nowrap",
                  tab === t.id
                    ? "border-primary text-primary"
                    : "text-ink-muted hover:text-ink border-transparent",
                )}
              >
                {t.label}
                <span className="bg-primary-soft text-primary rounded-full px-2 text-sm tabular-nums">
                  {lists[t.id].length}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {items.length ? (
        <ConsultList items={items} label={`${tab} consultations`} showDate={tab !== "today"} />
      ) : (
        <EmptyState
          as="h2"
          icon={<CalendarBlank />}
          title="Nothing here"
          description="Consultations in this list will appear here."
        />
      )}
    </>
  );
}
