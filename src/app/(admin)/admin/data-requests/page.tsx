import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { FilterBar, PageLinks, ThLink } from "@/components/admin/table-kit";
import { RequestActions } from "@/components/admin/request-actions";
import { Table, TBody, THead, Tr } from "@/components/ui/table";
import { queryDataRequests } from "@/lib/data/admin";
import { parseTableQuery, type TableSpec } from "@/lib/schemas/admin";

export const metadata: Metadata = { title: "Data requests" };

const spec: TableSpec = {
  sorts: ["received", "due", "type", "status"],
  defaultSort: "due",
  defaultDir: "asc",
  filters: {
    type: ["export", "deletion", "correction"],
    status: ["new", "in_progress", "done"],
  },
};
const typeLabel: Record<string, string> = {
  export: "Copy of data",
  deletion: "Delete data",
  correction: "Correct data",
};
const statusLabel: Record<string, string> = {
  new: "New",
  in_progress: "In progress",
  done: "Done",
};

export default async function DataRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseTableQuery(await searchParams, spec);
  const res = queryDataRequests(query);
  const ctx = { base: "/admin/data-requests", query, spec };
  const opts = (m: Record<string, string>) =>
    Object.entries(m).map(([value, label]) => ({ value, label }));
  return (
    <>
      <PageHeader
        title="Data requests"
        description="Patients asking for a copy of their data, a correction or deletion. Each one has a due date. Deletion waits if records must be kept by law."
      />
      <FilterBar
        ctx={ctx}
        searchLabel="Search by patient"
        filters={[
          { name: "type", label: "Request", options: opts(typeLabel) },
          { name: "status", label: "Status", options: opts(statusLabel) },
        ]}
      />
      <Table>
        <caption className="sr-only">Data requests</caption>
        <THead>
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">
              Patient
            </th>
            <ThLink column="type" label="Request" ctx={ctx} />
            <ThLink column="received" label="Received" ctx={ctx} />
            <ThLink column="due" label="Due" ctx={ctx} />
            <ThLink column="status" label="Status" ctx={ctx} />
          </tr>
        </THead>
        <TBody>
          {res.rows.map((r) => (
            <Tr key={r.id}>
              <th scope="row" className="px-4 py-3 font-medium">
                {r.patient}
              </th>
              <td className="px-4 py-3">{typeLabel[r.type]}</td>
              <td className="px-4 py-3">{r.received}</td>
              <td className="px-4 py-3">{r.due}</td>
              <td className="px-4 py-3">
                <RequestActions item={r} />
              </td>
            </Tr>
          ))}
        </TBody>
      </Table>
      <PageLinks ctx={ctx} page={res.page} pageCount={res.pageCount} total={res.total} />
    </>
  );
}
