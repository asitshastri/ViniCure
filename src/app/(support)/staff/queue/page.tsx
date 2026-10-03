import type { Metadata } from "next";
import Link from "next/link";
import { Clock, WarningCircle } from "@phosphor-icons/react/ssr";
import { PageHeader } from "@/components/shell/page-header";
import { FilterBar, PageLinks, ThLink } from "@/components/admin/table-kit";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Table, TBody, THead, Tr } from "@/components/ui/table";
import { formatDue, minutesToDue, queryTickets } from "@/lib/data/staff";
import { parseTableQuery, type TableSpec } from "@/lib/schemas/admin";

export const metadata: Metadata = { title: "Ticket queue" };

const spec: TableSpec = {
  sorts: ["due", "opened", "priority", "status", "topic"],
  defaultSort: "due",
  defaultDir: "asc",
  filters: {
    status: ["new", "open", "waiting", "solved"],
    priority: ["high", "normal", "low"],
    topic: ["booking", "payment", "technical", "records", "doctor", "other"],
  },
};
const statusLabel = { new: "New", open: "Open", waiting: "Waiting for them", solved: "Solved" };
const statusTone: Record<string, BadgeTone> = {
  new: "warning",
  open: "info",
  waiting: "neutral",
  solved: "success",
};
const priorityLabel = { high: "High", normal: "Normal", low: "Low" };
const topicLabel = {
  booking: "Booking",
  payment: "Payment",
  technical: "Technical",
  records: "Records",
  doctor: "Doctor",
  other: "Other",
};

export default async function SupportQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseTableQuery(await searchParams, spec);
  const res = queryTickets(query);
  const ctx = { base: "/staff/queue", query, spec };
  const opts = (m: Record<string, string>) =>
    Object.entries(m).map(([value, label]) => ({ value, label }));
  return (
    <>
      <PageHeader
        title="Ticket queue"
        description="Open requests from patients and doctors, most urgent first."
      />
      <FilterBar
        ctx={ctx}
        searchLabel="Search by ticket, subject or name"
        filters={[
          { name: "status", label: "Status", options: opts(statusLabel) },
          { name: "priority", label: "Priority", options: opts(priorityLabel) },
          { name: "topic", label: "Topic", options: opts(topicLabel) },
        ]}
      />
      <Table>
        <caption className="sr-only">Support tickets</caption>
        <THead>
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">
              Ticket
            </th>
            <ThLink column="priority" label="Priority" ctx={ctx} />
            <ThLink column="status" label="Status" ctx={ctx} />
            <ThLink column="topic" label="Topic" ctx={ctx} />
            <ThLink column="due" label="Reply due" ctx={ctx} />
          </tr>
        </THead>
        <TBody>
          {res.rows.map((t) => {
            const mins = minutesToDue(t);
            const late = mins !== null && mins < 0;
            return (
              <Tr key={t.id}>
                <th scope="row" className="min-w-56 px-4 py-3 font-medium">
                  <Link href={`/staff/queue/${t.id}`} className="text-primary underline">
                    {t.subject}
                  </Link>
                  <span className="text-ink-muted block text-sm font-normal">
                    {t.id}. {t.requester}
                  </span>
                </th>
                <td className="px-4 py-3">{priorityLabel[t.priority]}</td>
                <td className="px-4 py-3">
                  <Badge tone={statusTone[t.status]}>{statusLabel[t.status]}</Badge>
                </td>
                <td className="px-4 py-3">{topicLabel[t.topic]}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {mins === null ? (
                    <span className="text-ink-muted">Closed</span>
                  ) : (
                    <span
                      className={
                        late
                          ? "text-danger inline-flex items-center gap-1 font-semibold"
                          : "inline-flex items-center gap-1"
                      }
                    >
                      {late ? (
                        <WarningCircle aria-hidden weight="fill" className="size-4" />
                      ) : (
                        <Clock aria-hidden className="size-4" />
                      )}
                      {formatDue(mins)}
                    </span>
                  )}
                </td>
              </Tr>
            );
          })}
        </TBody>
      </Table>
      <PageLinks ctx={ctx} page={res.page} pageCount={res.pageCount} total={res.total} />
    </>
  );
}
