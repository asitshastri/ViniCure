import { withApi } from "@/lib/api/with-api";
import { getPayouts, payoutPeriodQuery } from "@/modules/payments";

// Admin: the CSV to pay doctors from, for one period (P5-09). Names and registration numbers
// only; the bank details are never stored here. Always sent as a download.

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/admin/payouts/export",
    auth: "staff",
    roles: ["admin", "super_admin"],
    roleDenied: "not_found",
    rateLimit: "admin",
    freshLogin: true,
    query: payoutPeriodQuery,
    audit: { action: "payout.export", entity: "payout" },
    doc: { summary: "Download the payout file for a period (CSV)", tags: ["payments", "admin"] },
  },
  async ({ actor, query }) =>
    new Response(await getPayouts().exportCsv(actor, query), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="payouts-${query.periodStart}-${query.periodEnd}.csv"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }),
);
