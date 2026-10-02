import Link from "next/link";
import { Clock, PhoneCall, VideoCamera, Warning } from "@phosphor-icons/react/ssr";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { formatCountdown } from "@/lib/data/appointments";
import { formatClock, START_OPENS_MINUTES } from "@/lib/data/doctor";
import type { DoctorConsultView } from "@/lib/types";

export function NextConsult({ c }: { c: DoctorConsultView }) {
  const Icon = c.mode === "audio" ? PhoneCall : VideoCamera;
  return (
    <section
      aria-labelledby="next-h"
      className="border-line bg-surface shadow-card rounded-2xl border p-5 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="next-h" className="text-xl font-semibold">
          Next consultation
        </h2>
        <Link
          href="/doctor/calendar"
          className="text-primary min-h-11 content-center font-semibold underline"
        >
          View schedule
        </Link>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Badge
          tone={c.canStart ? "success" : "info"}
          icon={<Clock weight="fill" className="size-3.5" />}
        >
          {formatClock(c.time)}.{" "}
          {c.canStart ? "Starting now" : `In ${formatCountdown(c.minutesUntil)}`}
        </Badge>
        <Badge tone="neutral">{c.kind === "new" ? "New patient" : "Follow-up"}</Badge>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <Avatar name={c.patientName} size="lg" />
        <div className="min-w-0">
          <p className="font-display text-xl font-semibold">
            {c.patientName}{" "}
            <span className="text-ink-muted text-base font-normal">({c.ageSex})</span>
          </p>
          <p className="text-ink-muted">{c.reason}</p>
        </div>
      </div>
      {c.allergies.length ? (
        <p className="bg-danger-soft text-danger mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium">
          <Warning aria-hidden weight="fill" className="size-5 shrink-0" />
          Allergy: {c.allergies.join(", ")}
        </p>
      ) : null}
      <div className="mt-5">
        {c.canStart ? (
          <ButtonLink href={`/doctor/consultations/${c.id}`} size="lg" className="w-full sm:w-auto">
            <Icon aria-hidden weight="fill" className="size-5" /> Start consultation
          </ButtonLink>
        ) : (
          <>
            <Button size="lg" disabled aria-describedby="start-note" className="w-full sm:w-auto">
              <Icon aria-hidden className="size-5" /> Start consultation
            </Button>
            <p id="start-note" className="text-ink-muted mt-2 text-sm">
              You can start {START_OPENS_MINUTES} minutes before the time. You can open the
              patient’s details now.
            </p>
            <Link
              href={`/doctor/consultations/${c.id}`}
              className="text-primary mt-1 inline-block min-h-11 content-center font-semibold underline"
            >
              Review patient details
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
