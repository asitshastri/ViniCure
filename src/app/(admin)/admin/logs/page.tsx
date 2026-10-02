import type { Metadata } from "next";
import Link from "next/link";
import { LockSimple } from "@phosphor-icons/react/ssr";
import { PageHeader } from "@/components/shell/page-header";
import { FilterBar, PageLinks, ThLink } from "@/components/admin/table-kit";
import { Table, TBody, THead, Tr } from "@/components/ui/table";
import { queryAudit } from "@/lib/data/admin";
import { cn } from "@/lib/cn";
import { parseTableQuery, type TableSpec } from "@/lib/schemas/admin";

export const metadata: Metadata = { title: "Audit logs" };

const spec: TableSpec = {
  sorts: ["when", "actor", "role", "action"],
  defaultSort: "when",
  defaultDir: "desc",
  filters: { role: ["admin", "support", "doctor", "system"] },
};
const roleLabel = { admin: "Admin", support: "Support", doctor: "Doctor", system: "System" };

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const kind = raw.view === "phi" ? "phi" : "audit";
  const query = parseTableQuery(raw, spec);
  const res = queryAudit(query, kind);
  const extra: Record<string, string> = kind === "phi" ? { view: "phi" } : {};
  const ctx = { base: "/admin/logs", query, spec, extra };
  const tabs = [
    { id: "audit", label: "Admin actions", href: "/admin/logs" },
    { id: "phi", label: "Health record access", href: "/admin/logs?view=phi" },
  ];
  return (
    <>
      <PageHeader
        title="Audit logs"
        description={
          kind === "phi"
            ? "Every time a person opened a patient's health record, and why."
            : "Every action by admins, support staff and the system."
        }
      />
      <nav aria-label="Log type" className="mb-4 flex gap-1">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={t.href}
            aria-current={t.id === kind ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-lg px-4 font-semibold",
              t.id === kind ? "bg-primary text-white" : "hover:bg-primary-soft text-ink",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <p className="text-ink-muted mb-4 flex items-center gap-2 text-sm">
        <LockSimple aria-hidden className="size-4 shrink-0" />
        Logs are read-only. Nobody can edit or delete an entry.
      </p>
      <FilterBar
        ctx={ctx}
        searchLabel="Search by person or action"
        filters={[
          {
            name: "role",
            label: "Role",
            options: Object.entries(roleLabel).map(([value, label]) => ({ value, label })),
          },
        ]}
      />
      <Table>
        <caption className="sr-only">
          {kind === "phi" ? "Health record access log" : "Admin action log"}
        </caption>
        <THead>
          <tr>
            <ThLink column="when" label="When" ctx={ctx} />
            <ThLink column="actor" label="Who" ctx={ctx} />
            <ThLink column="role" label="Role" ctx={ctx} />
            <ThLink column="action" label="Action" ctx={ctx} />
            <th scope="col" className="px-4 py-3 font-semibold">
              Target
            </th>
          </tr>
        </THead>
        <TBody>
          {res.rows.map((r) => (
            <Tr key={r.id}>
              <td className="px-4 py-3 whitespace-nowrap tabular-nums">{r.when}</td>
              <th scope="row" className="px-4 py-3 font-medium">
                {r.actor}
              </th>
              <td className="px-4 py-3 capitalize">{r.role}</td>
              <td className="px-4 py-3">{r.action}</td>
              <td className="px-4 py-3">{r.target}</td>
            </Tr>
          ))}
        </TBody>
      </Table>
      <PageLinks ctx={ctx} page={res.page} pageCount={res.pageCount} total={res.total} />
    </>
  );
}
