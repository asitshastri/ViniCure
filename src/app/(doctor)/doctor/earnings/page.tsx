import type { Metadata } from "next";
import { Bank, Info } from "@phosphor-icons/react/ssr";
import { Notice } from "@/components/auth/notice";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getEarningLines, getPayouts } from "@/lib/data/doctor";
import { formatSlotDay } from "@/lib/data/doctors";
import { formatRupees } from "@/lib/format";

export const metadata: Metadata = { title: "Earnings" };

const payoutTone: Record<string, { label: string; tone: BadgeTone }> = {
  paid: { label: "Paid", tone: "success" },
  processing: { label: "Processing", tone: "info" },
  on_hold: { label: "On hold", tone: "warning" },
};

export default function EarningsPage() {
  const payouts = getPayouts();
  const lines = getEarningLines();
  const processing = payouts
    .filter((p) => p.status === "processing")
    .reduce((s, p) => s + p.netPaise, 0);
  const held = payouts.filter((p) => p.status === "on_hold");
  const paid = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + p.netPaise, 0);

  return (
    <>
      <PageHeader
        title="Earnings"
        description="What you earned, the platform fee, and when it reaches your bank."
      />
      <div className="grid min-w-0 gap-8">
        {held.length ? (
          <Notice tone="warning" title="A payout is on hold">
            {held[0]?.note} Add or verify your bank account in your profile to release it.
          </Notice>
        ) : null}
        <section aria-label="Summary" className="grid gap-3 sm:grid-cols-3">
          <Card>
            <p className="text-ink-muted text-sm">On its way to you</p>
            <p className="font-display text-3xl font-semibold tabular-nums">
              {formatRupees(processing)}
            </p>
            <p className="text-ink-muted text-sm">
              Next payout on Wed 7 Oct. [Schedule to be confirmed.]
            </p>
          </Card>
          <Card>
            <p className="text-ink-muted text-sm">Paid this month</p>
            <p className="font-display text-3xl font-semibold tabular-nums">{formatRupees(paid)}</p>
          </Card>
          <Card>
            <p className="text-ink-muted flex items-center gap-2 text-sm">
              <Bank aria-hidden className="size-4" />
              Bank account
            </p>
            <p className="mt-1 font-semibold">HDFC Bank ••••1234</p>
            <p className="text-warning text-sm font-medium">Verification pending</p>
          </Card>
        </section>

        <section aria-labelledby="po-h" className="min-w-0">
          <h2 id="po-h" className="mb-3 text-xl font-semibold">
            Payouts
          </h2>
          <div
            role="region"
            aria-label="Payouts table, scrolls sideways on small screens"
            tabIndex={0}
            className="border-line bg-surface overflow-x-auto rounded-xl border"
          >
            <table className="w-full min-w-[40rem] text-left">
              <caption className="sr-only">Weekly payouts, newest first</caption>
              <thead className="bg-primary-tint text-ink-muted text-sm">
                <tr>
                  <th scope="col" className="p-3 font-semibold">
                    Week
                  </th>
                  <th scope="col" className="p-3 text-right font-semibold">
                    Consultations
                  </th>
                  <th scope="col" className="p-3 text-right font-semibold">
                    Fees collected
                  </th>
                  <th scope="col" className="p-3 text-right font-semibold">
                    Platform fee
                  </th>
                  <th scope="col" className="p-3 text-right font-semibold">
                    You receive
                  </th>
                  <th scope="col" className="p-3 font-semibold">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-line divide-y">
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <th scope="row" className="p-3 font-medium whitespace-nowrap">
                      {p.period}
                    </th>
                    <td className="p-3 text-right tabular-nums">{p.consultations}</td>
                    <td className="p-3 text-right tabular-nums">{formatRupees(p.grossPaise)}</td>
                    <td className="p-3 text-right tabular-nums">{formatRupees(p.feePaise)}</td>
                    <td className="p-3 text-right font-semibold tabular-nums">
                      {formatRupees(p.netPaise)}
                    </td>
                    <td className="p-3">
                      <Badge tone={payoutTone[p.status]!.tone}>{payoutTone[p.status]!.label}</Badge>
                      {p.paidOn ? (
                        <span className="text-ink-muted ml-2 text-sm">
                          {formatSlotDay(p.paidOn)}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-ink-muted mt-3 flex gap-2 text-sm">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            The platform fee is a share of each fee, taken before payout. [Rate, tax deducted at
            source and GST treatment to be confirmed.]
          </p>
        </section>

        <section aria-labelledby="ln-h" className="min-w-0">
          <h2 id="ln-h" className="mb-3 text-xl font-semibold">
            Recent consultations
          </h2>
          <ul className="divide-line border-line bg-surface divide-y overflow-hidden rounded-xl border">
            {lines.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="font-semibold">{l.patient}</p>
                  <p className="text-ink-muted text-sm">
                    {formatSlotDay(l.date)}.{" "}
                    {l.mode === "audio" ? "Audio" : l.mode === "followup" ? "Follow-up" : "Video"}.
                  </p>
                </div>
                <p className="text-right">
                  <span className="font-semibold tabular-nums">{formatRupees(l.netPaise)}</span>
                  <span className="text-ink-muted block text-xs">
                    of {formatRupees(l.grossPaise)}
                  </span>
                </p>
                <Badge tone={l.status === "paid" ? "success" : "info"}>
                  {l.status === "paid" ? "Paid" : "Processing"}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
