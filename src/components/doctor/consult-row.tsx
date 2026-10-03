import Link from "next/link";
import { CaretRight, PhoneCall, VideoCamera, Warning } from "@phosphor-icons/react/ssr";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatClock } from "@/lib/data/doctor";
import { formatSlotDay } from "@/lib/data/doctors";
import type { DoctorConsultStatus, DoctorConsultView } from "@/lib/types";

const status: Record<DoctorConsultStatus, { label: string; tone: BadgeTone } | null> = {
  upcoming: null,
  completed: { label: "Completed", tone: "success" },
  no_show: { label: "Patient did not join", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

type Props = { c: DoctorConsultView; showDate?: boolean };

/** One consultation. The whole row opens the consultation console (built in F-16). */
export function ConsultRow({ c, showDate = false }: Props) {
  const s = status[c.status];
  const Icon = c.mode === "audio" ? PhoneCall : VideoCamera;
  return (
    <Link
      href={`/doctor/consultations/${c.id}`}
      className="hover:bg-primary-tint flex min-h-20 items-center gap-4 px-4 py-3"
    >
      <div className="w-20 shrink-0">
        <p className="font-semibold tabular-nums">{formatClock(c.time)}</p>
        <p className="text-ink-muted flex items-center gap-1 text-sm">
          <Icon aria-hidden className="size-4" />
          {c.mode === "audio" ? "Audio" : "Video"}
        </p>
        {showDate ? <p className="text-ink-muted text-xs">{formatSlotDay(c.date)}</p> : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {c.patientName} <span className="text-ink-muted font-normal">({c.ageSex})</span>
        </p>
        <p className="text-ink-muted text-sm">
          {c.reason}. {c.kind === "new" ? "New patient" : "Follow-up"}.
        </p>
        {c.allergies.length ? (
          <p className="text-danger mt-1 flex items-center gap-1 text-sm font-medium">
            <Warning aria-hidden weight="fill" className="size-4 shrink-0" />
            Allergy: {c.allergies.join(", ")}
          </p>
        ) : null}
      </div>
      {s ? (
        <Badge tone={s.tone} className="hidden sm:inline-flex">
          {s.label}
        </Badge>
      ) : null}
      <CaretRight aria-hidden className="text-ink-faint size-4 shrink-0" />
    </Link>
  );
}

export function ConsultList({
  items,
  label,
  showDate,
}: {
  items: DoctorConsultView[];
  label: string;
  showDate?: boolean;
}) {
  return (
    <ul
      aria-label={label}
      className="divide-line border-line bg-surface divide-y overflow-hidden rounded-xl border"
    >
      {items.map((c) => (
        <li key={c.id}>
          <ConsultRow c={c} {...(showDate ? { showDate } : {})} />
        </li>
      ))}
    </ul>
  );
}
