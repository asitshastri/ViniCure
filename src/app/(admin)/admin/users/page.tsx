import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { FilterBar, PageLinks, ThLink } from "@/components/admin/table-kit";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Table, TBody, THead, Tr } from "@/components/ui/table";
import { queryUsers } from "@/lib/data/admin";
import { formatSlotDay } from "@/lib/data/doctors";
import { parseTableQuery, type TableSpec } from "@/lib/schemas/admin";

export const metadata: Metadata = { title: "Users" };

const spec: TableSpec = {
  sorts: ["name", "role", "joined", "status"],
  defaultSort: "joined",
  defaultDir: "desc",
  filters: {
    role: ["patient", "doctor", "support", "admin"],
    status: ["active", "suspended", "pending"],
  },
};
const tone: Record<string, BadgeTone> = {
  active: "success",
  suspended: "danger",
  pending: "warning",
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseTableQuery(await searchParams, spec);
  const res = queryUsers(query);
  const ctx = { base: "/admin/users", query, spec };
  return (
    <>
      <PageHeader title="Users" description="Everyone with an account. Phone numbers are masked." />
      <FilterBar
        ctx={ctx}
        searchLabel="Search by name"
        filters={[
          {
            name: "role",
            label: "Role",
            options: spec.filters!.role!.map((v) => ({
              value: v,
              label: v[0]!.toUpperCase() + v.slice(1),
            })),
          },
          {
            name: "status",
            label: "Status",
            options: spec.filters!.status!.map((v) => ({
              value: v,
              label: v[0]!.toUpperCase() + v.slice(1),
            })),
          },
        ]}
      />
      <Table>
        <caption className="sr-only">Users</caption>
        <THead>
          <tr>
            <ThLink column="name" label="Name" ctx={ctx} />
            <ThLink column="role" label="Role" ctx={ctx} />
            <th scope="col" className="px-4 py-3 font-semibold">
              Phone
            </th>
            <ThLink column="joined" label="Joined" ctx={ctx} />
            <ThLink column="status" label="Status" ctx={ctx} />
          </tr>
        </THead>
        <TBody>
          {res.rows.map((u) => (
            <Tr key={u.id}>
              <th scope="row" className="px-4 py-3 font-medium">
                {u.name}
                <span className="text-ink-muted block text-xs font-normal">{u.id}</span>
              </th>
              <td className="px-4 py-3 capitalize">{u.role}</td>
              <td className="px-4 py-3 tabular-nums">{u.phoneMasked}</td>
              <td className="px-4 py-3">{formatSlotDay(u.joined)}</td>
              <td className="px-4 py-3">
                <Badge tone={tone[u.status] ?? "neutral"}>
                  {u.status[0]!.toUpperCase() + u.status.slice(1)}
                </Badge>
              </td>
            </Tr>
          ))}
        </TBody>
      </Table>
      <PageLinks ctx={ctx} page={res.page} pageCount={res.pageCount} total={res.total} />
    </>
  );
}
