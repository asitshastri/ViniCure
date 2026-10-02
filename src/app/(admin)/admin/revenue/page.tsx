import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { RefundQueue } from "@/components/admin/refund-queue";
import { StackedBars } from "@/components/admin/charts";
import { PrototypeHint } from "@/components/auth/notice";
import { Table, TBody, THead, Tr } from "@/components/ui/table";
import { getRefunds, getWeeklyRevenue } from "@/lib/data/admin";
import { formatRupees } from "@/lib/format";

export const metadata: Metadata = { title: "Revenue and refunds" };

export default function RevenuePage() {
  const weeks = getWeeklyRevenue();
  const last = weeks.at(-1)!;
  const sum = (w: (typeof weeks)[number]) => w.video + w.audio + w.followup;
  return (
    <>
      <PageHeader
        title="Revenue and refunds"
        description="What patients paid by week, split by consultation type, and the refunds waiting for a decision."
      />
      <div className="flex min-w-0 flex-col gap-8">
        <StackedBars
          title="Weekly revenue by consultation type"
          subtitle="Last 8 weeks, before doctor payouts"
          data={weeks.map((w) => ({
            label: w.week,
            values: { video: w.video, audio: w.audio, followup: w.followup },
          }))}
          series={[
            { key: "video", label: "Video", color: "teal" },
            { key: "audio", label: "Audio", color: "amber" },
            { key: "followup", label: "Follow-up", color: "blue" },
          ]}
          unit="rupees"
          summary={`Revenue grew every week, from ${formatRupees(sum(weeks[0]!))} to ${formatRupees(sum(last))}. Video is about three quarters of it.`}
        />
        <section
          aria-labelledby="refunds-heading"
          id="refunds"
          className="flex min-w-0 scroll-mt-20 flex-col gap-3"
        >
          <h2 id="refunds-heading" className="text-xl font-semibold">
            Refund requests
          </h2>
          <PrototypeHint>
            Approving or declining asks for your password again. In this prototype any password
            works except “wrong”.
          </PrototypeHint>
          <RefundQueue items={getRefunds()} />
        </section>
        <section aria-labelledby="payouts" className="flex min-w-0 flex-col gap-3">
          <h2 id="payouts" className="text-xl font-semibold">
            Weekly totals
          </h2>
          <Table className="min-w-0">
            <caption className="sr-only">Weekly totals</caption>
            <THead>
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Week starting
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Total
                </th>
              </tr>
            </THead>
            <TBody>
              {[...weeks].reverse().map((w) => (
                <Tr key={w.week}>
                  <th scope="row" className="px-4 py-3 font-medium">
                    {w.week}
                  </th>
                  <td className="px-4 py-3 text-right tabular-nums">{formatRupees(sum(w))}</td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </section>
      </div>
    </>
  );
}
