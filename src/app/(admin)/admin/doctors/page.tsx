import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { FilterBar, PageLinks, ThLink } from "@/components/admin/table-kit";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Table, TBody, THead, Tr } from "@/components/ui/table";
import { queryDoctors } from "@/lib/data/admin";
import { formatSlotDay } from "@/lib/data/doctors";
import { parseTableQuery, type TableSpec } from "@/lib/schemas/admin";

export const metadata: Metadata = { title: "Doctors" };

const spec: TableSpec = {
  sorts: ["name", "specialty", "rating", "consultations", "joined", "status"],
  defaultSort: "name",
  filters: { status: ["live", "paused", "pending"] },
};
const tone: Record<string, BadgeTone> = { live: "success", paused: "warning", pending: "info" };
const label: Record<string, string> = {
  live: "Live",
  paused: "Paused",
  pending: "Waiting for approval",
};

export default async function AdminDoctorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseTableQuery(await searchParams, spec);
  const res = queryDoctors(query);
  const ctx = { base: "/admin/doctors", query, spec };
  return (
    <>
      <PageHeader
        title="Doctors"
        description="Registered doctors on ViniCure. Applications are reviewed on the KYC page."
      />
      <FilterBar
        ctx={ctx}
        searchLabel="Search by name or registration"
        filters={[
          {
            name: "status",
            label: "Status",
            options: Object.entries(label).map(([value, l]) => ({ value, label: l })),
          },
        ]}
      />
      <Table>
        <caption className="sr-only">Doctors</caption>
        <THead>
          <tr>
            <ThLink column="name" label="Doctor" ctx={ctx} />
            <ThLink column="specialty" label="Specialty" ctx={ctx} />
            <th scope="col" className="px-4 py-3 font-semibold">
              Registration
            </th>
            <ThLink column="rating" label="Rating" ctx={ctx} align="right" />
            <ThLink column="consultations" label="Consultations" ctx={ctx} align="right" />
            <ThLink column="joined" label="Joined" ctx={ctx} />
            <ThLink column="status" label="Status" ctx={ctx} />
          </tr>
        </THead>
        <TBody>
          {res.rows.map((d) => (
            <Tr key={d.id}>
              <th scope="row" className="px-4 py-3 font-medium">
                {d.name}
              </th>
              <td className="px-4 py-3">{d.specialty}</td>
              <td className="px-4 py-3 tabular-nums">{d.registrationNumber}</td>
              <td className="px-4 py-3 text-right tabular-nums">{d.rating.toFixed(1)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{d.consultations}</td>
              <td className="px-4 py-3">{formatSlotDay(d.joined)}</td>
              <td className="px-4 py-3">
                <Badge tone={tone[d.status] ?? "neutral"}>{label[d.status]}</Badge>
              </td>
            </Tr>
          ))}
        </TBody>
      </Table>
      <PageLinks ctx={ctx} page={res.page} pageCount={res.pageCount} total={res.total} />
      <p className="text-ink-muted mt-4 text-sm">
        Waiting for approval? Open{" "}
        <Link href="/admin/kyc" className="text-primary underline">
          KYC reviews
        </Link>
        .
      </p>
    </>
  );
}
