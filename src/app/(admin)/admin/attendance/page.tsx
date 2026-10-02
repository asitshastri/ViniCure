import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { FilterBar, PageLinks, ThLink } from "@/components/admin/table-kit";
import { Table, TBody, THead, Tr } from "@/components/ui/table";
import { queryAttendance } from "@/lib/data/admin";
import { parseTableQuery, type TableSpec } from "@/lib/schemas/admin";

export const metadata: Metadata = { title: "Attendance" };

const spec: TableSpec = {
  sorts: ["doctor", "scheduled", "online", "onTime", "noShows"],
  defaultSort: "onTime",
  defaultDir: "asc",
};

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseTableQuery(await searchParams, spec);
  const res = queryAttendance(query);
  const ctx = { base: "/admin/attendance", query, spec };
  return (
    <>
      <PageHeader
        title="Doctor attendance"
        description="How reliably doctors are online for their booked hours, last 30 days. Lowest on-time rate first."
      />
      <FilterBar ctx={ctx} searchLabel="Search by doctor" filters={[]} />
      <Table>
        <caption className="sr-only">Doctor attendance</caption>
        <THead>
          <tr>
            <ThLink column="doctor" label="Doctor" ctx={ctx} />
            <ThLink column="scheduled" label="Scheduled hours" ctx={ctx} align="right" />
            <ThLink column="online" label="Online hours" ctx={ctx} align="right" />
            <ThLink column="onTime" label="Joined on time" ctx={ctx} align="right" />
            <ThLink column="noShows" label="Missed consultations" ctx={ctx} align="right" />
          </tr>
        </THead>
        <TBody>
          {res.rows.map((r) => (
            <Tr key={r.id}>
              <th scope="row" className="px-4 py-3 font-medium">
                {r.doctor}
              </th>
              <td className="px-4 py-3 text-right tabular-nums">{r.scheduledHours}</td>
              <td className="px-4 py-3 text-right tabular-nums">{r.onlineHours}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {r.onTimePercent}%
                {r.onTimePercent < 85 ? (
                  <span className="text-warning ml-1 font-medium">(low)</span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{r.noShows}</td>
            </Tr>
          ))}
        </TBody>
      </Table>
      <PageLinks ctx={ctx} page={res.page} pageCount={res.pageCount} total={res.total} />
    </>
  );
}
