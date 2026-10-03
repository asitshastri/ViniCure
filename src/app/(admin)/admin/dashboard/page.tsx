import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarCheck,
  CurrencyInr,
  IdentificationCard,
  ShieldCheck,
  Stethoscope,
  Wallet,
} from "@phosphor-icons/react/ssr";
import { LineChart } from "@/components/admin/charts";
import { PageHeader } from "@/components/shell/page-header";
import { StatTile } from "@/components/ui/card";
import { getDaily, getKpis } from "@/lib/data/admin";
import { formatSlotDay } from "@/lib/data/doctors";
import { formatRupees } from "@/lib/format";

export const metadata: Metadata = { title: "Admin dashboard" };

export default function AdminDashboardPage() {
  const k = getKpis();
  const daily = getDaily();
  const data = daily.map((d) => ({ label: formatSlotDay(d.date), value: d.consultations }));
  const peak = daily.reduce((a, b) => (b.consultations > a.consultations ? b : a));
  const attention = [
    {
      href: "/admin/kyc",
      icon: IdentificationCard,
      text: `${k.pendingKyc} doctor applications waiting for review`,
    },
    {
      href: "/admin/revenue#refunds",
      icon: Wallet,
      text: `${k.pendingRefunds} refund requests need a decision`,
    },
    {
      href: "/admin/data-requests",
      icon: ShieldCheck,
      text: `${k.openRequests} patient data requests are open`,
    },
  ];
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="How ViniCure is doing today. No patient health details appear in admin."
      />
      <div className="grid min-w-0 gap-6">
        <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            icon={<CalendarCheck />}
            label="Consultations today"
            value={String(k.today)}
            change="+9%"
            note="vs last Friday"
          />
          <StatTile
            icon={<Stethoscope />}
            label="Doctors live"
            value={String(k.activeDoctors)}
            note={`${14 - k.activeDoctors} paused or pending`}
          />
          <StatTile
            icon={<CurrencyInr />}
            label="Fees this week"
            value={formatRupees(k.weekRevenuePaise)}
            change="+7%"
            note="vs last week"
          />
          <StatTile
            icon={<IdentificationCard />}
            label="Applications waiting"
            value={String(k.pendingKyc)}
            good={false}
            direction="up"
            change="+1"
            note="since yesterday"
          />
        </section>
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <LineChart
            title="Consultations per day"
            subtitle="Last 14 days"
            data={data}
            unit="Consultations"
            summary={`Consultations per day over the last 14 days. Lowest ${Math.min(...daily.map((d) => d.consultations))}, highest ${peak.consultations} on ${formatSlotDay(peak.date)}, latest ${daily.at(-1)?.consultations}. A table view is available.`}
          />
          <section
            aria-labelledby="att-h"
            className="border-line bg-surface shadow-card h-fit rounded-xl border p-5"
          >
            <h2 id="att-h" className="text-lg font-semibold">
              Needs attention
            </h2>
            <ul className="mt-3 grid gap-2">
              {attention.map(({ href, icon: Icon, text }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="hover:bg-primary-tint flex min-h-14 items-center gap-3 rounded-lg px-2 py-2"
                  >
                    <Icon aria-hidden className="text-primary size-6 shrink-0" />
                    <span>{text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
