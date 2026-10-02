import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { FilterBar, PageLinks, ThLink } from "@/components/admin/table-kit";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Table, TBody, THead, Tr } from "@/components/ui/table";
import { queryAppointments } from "@/lib/data/admin";
import { formatSlotDay } from "@/lib/data/doctors";
import { formatRupees } from "@/lib/format";
import { parseTableQuery, type TableSpec } from "@/lib/schemas/admin";

export const metadata: Metadata = { title: "Appointments" };

const spec: TableSpec = {
  sorts: ["date", "doctor", "type", "status", "fee", "payment"],
  defaultSort: "date",
  defaultDir: "desc",
  filters: {
    status: ["completed", "upcoming", "cancelled", "no_show"],
    type: ["video", "audio", "followup"],
    payment: ["paid", "refunded", "pending"],
  },
};
const statusTone: Record<string, BadgeTone> = {
  completed: "success",
  upcoming: "info",
  cancelled: "danger",
  no_show: "warning",
};
const statusLabel: Record<string, string> = {
  completed: "Completed",
  upcoming: "Upcoming",
  cancelled: "Cancelled",
  no_show: "Patient did not join",
};
const typeLabel: Record<string, string> = { video: "Video", audio: "Audio", followup: "Follow-up" };
const payLabel: Record<string, string> = {
  paid: "Paid",
  refunded: "Refunded",
  pending: "Refund pending",
};

export default async function AdminAppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseTableQuery(await searchParams, spec);
  const res = queryAppointments(query);
  const ctx = { base: "/admin/appointments", query, spec };
  const opts = (m: Record<string, string>) =>
    Object.entries(m).map(([value, label]) => ({ value, label }));
  return (
    <>
      <PageHeader
        title="Appointments"
        description="Bookings across the platform. Reasons for visit and notes are never shown here."
      />
      <FilterBar
        ctx={ctx}
        searchLabel="Search by booking, doctor or patient"
        filters={[
          { name: "status", label: "Status", options: opts(statusLabel) },
          { name: "type", label: "Type", options: opts(typeLabel) },
          { name: "payment", label: "Payment", options: opts(payLabel) },
        ]}
      />
      <Table>
        <caption className="sr-only">Appointments</caption>
        <THead>
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">
              Booking
            </th>
            <ThLink column="date" label="Date" ctx={ctx} />
            <ThLink column="doctor" label="Doctor" ctx={ctx} />
            <th scope="col" className="px-4 py-3 font-semibold">
              Patient
            </th>
            <ThLink column="type" label="Type" ctx={ctx} />
            <ThLink column="status" label="Status" ctx={ctx} />
            <ThLink column="fee" label="Fee" ctx={ctx} align="right" />
            <ThLink column="payment" label="Payment" ctx={ctx} />
          </tr>
        </THead>
        <TBody>
          {res.rows.map((a) => (
            <Tr key={a.id}>
              <th scope="row" className="px-4 py-3 font-medium whitespace-nowrap tabular-nums">
                {a.id}
              </th>
              <td className="px-4 py-3 whitespace-nowrap">{formatSlotDay(a.date)}</td>
              <td className="px-4 py-3">{a.doctor}</td>
              <td className="px-4 py-3">{a.patient}</td>
              <td className="px-4 py-3">{typeLabel[a.type]}</td>
              <td className="px-4 py-3">
                <Badge tone={statusTone[a.status] ?? "neutral"}>{statusLabel[a.status]}</Badge>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{formatRupees(a.feePaise)}</td>
              <td className="px-4 py-3">{payLabel[a.payment]}</td>
            </Tr>
          ))}
        </TBody>
      </Table>
      {res.rows.length === 0 ? <p className="text-ink-muted mt-4">No appointments match.</p> : null}
      <PageLinks ctx={ctx} page={res.page} pageCount={res.pageCount} total={res.total} />
    </>
  );
}
