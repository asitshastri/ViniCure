import type { Metadata } from "next";
import Link from "next/link";
import { BellRinging, CheckCircle } from "@phosphor-icons/react/ssr";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDue, minutesToDue, queryTickets } from "@/lib/data/staff";
import { parseTableQuery } from "@/lib/schemas/admin";

export const metadata: Metadata = { title: "Alerts" };

export default function AlertsPage() {
  const all = queryTickets(
    parseTableQuery({}, { sorts: ["due"], defaultSort: "due", defaultDir: "asc" }),
  ).rows;
  const late = all.filter((t) => (minutesToDue(t) ?? 1) < 0);
  const fresh = all.filter((t) => t.status === "new" && t.priority === "high");
  return (
    <>
      <PageHeader title="Alerts" description="Tickets that need you now." />
      {late.length + fresh.length === 0 ? (
        <EmptyState
          icon={<CheckCircle />}
          title="Nothing urgent"
          description="No late tickets and no new high-priority ones."
        />
      ) : (
        <ul className="grid max-w-2xl gap-3">
          {late.map((t) => (
            <li
              key={`l-${t.id}`}
              className="border-danger bg-danger-soft text-danger flex items-start gap-3 rounded-xl border p-4"
            >
              <BellRinging aria-hidden weight="fill" className="mt-0.5 size-5 shrink-0" />
              <span>
                <Link href={`/staff/queue/${t.id}`} className="font-semibold underline">
                  {t.subject}
                </Link>
                <br />
                {t.id}. {formatDue(minutesToDue(t)!)}
              </span>
            </li>
          ))}
          {fresh.map((t) => (
            <li
              key={`n-${t.id}`}
              className="border-line bg-surface flex items-start gap-3 rounded-xl border p-4"
            >
              <BellRinging aria-hidden className="text-primary mt-0.5 size-5 shrink-0" />
              <span>
                New high-priority ticket:{" "}
                <Link
                  href={`/staff/queue/${t.id}`}
                  className="text-primary font-semibold underline"
                >
                  {t.subject}
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
