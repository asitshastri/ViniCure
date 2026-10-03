import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/ssr";
import { formatSlotDay, formatSlotTime } from "@/lib/data/doctors";
import type { AppointmentView } from "@/lib/types";
import { StatusBadge } from "./status-badge";

/** Compact rows for the dashboard. Each row opens the full appointments page. */
export function MiniList({ items, label }: { items: AppointmentView[]; label: string }) {
  return (
    <ul
      aria-label={label}
      className="divide-line border-line bg-surface divide-y overflow-hidden rounded-xl border"
    >
      {items.map((a) => (
        <li key={a.id}>
          <Link
            href={`/patient/appointments?tab=${a.status === "upcoming" ? "upcoming" : a.status === "cancelled" ? "cancelled" : "past"}`}
            className="hover:bg-primary-tint flex min-h-16 items-center gap-3 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{a.doctorName}</p>
              <p className="text-ink-muted text-sm">
                {formatSlotDay(a.date)}, {formatSlotTime(a.time)}. {a.forWhom}.
              </p>
            </div>
            <StatusBadge status={a.status} />
            <CaretRight aria-hidden className="text-ink-faint size-4 shrink-0" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
