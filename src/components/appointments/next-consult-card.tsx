import Link from "next/link";
import { Clock, SealCheck, VideoCamera, PhoneCall } from "@phosphor-icons/react/ssr";
import { Button, ButtonLink } from "@/components/ui/button";
import { formatCountdown, JOIN_OPENS_MINUTES } from "@/lib/data/appointments";
import { formatSlotDay, formatSlotTime } from "@/lib/data/doctors";
import type { AppointmentView } from "@/lib/types";

function opensAt(a: AppointmentView): string {
  const [h = "0", m = "0"] = a.time.split(":");
  const total = Number(h) * 60 + Number(m) - JOIN_OPENS_MINUTES;
  return formatSlotTime(
    `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`,
  );
}

/** The one strong element on the dashboard: the next call and whether you can join it yet. */
export function NextConsultCard({ appt }: { appt: AppointmentView }) {
  const Icon = appt.mode === "audio" ? PhoneCall : VideoCamera;
  return (
    <section
      aria-labelledby="next-heading"
      className="on-dark bg-dock rounded-2xl p-6 text-white sm:p-8"
    >
      <h2 id="next-heading" className="text-lg font-semibold text-white/80">
        Your next consultation
      </h2>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="font-display text-3xl leading-tight font-semibold sm:text-4xl">
            {formatSlotDay(appt.date)}, {formatSlotTime(appt.time)}
            <span className="ml-2 text-lg font-medium text-white/80">IST</span>
          </p>
          <p className="mt-3 flex items-center gap-2 text-lg">
            <Clock aria-hidden className="size-5 shrink-0" />
            {appt.canJoin ? "Starting now" : `Starts in ${formatCountdown(appt.minutesUntil)}`}
          </p>
          <p className="mt-4 text-xl font-semibold">{appt.doctorName}</p>
          <p className="text-white/80">
            {appt.specialty}. For {appt.forWhom}.
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-white/80">
            <SealCheck aria-hidden weight="fill" className="size-4 shrink-0" />
            Reg. {appt.registrationNumber}
          </p>
        </div>

        <div className="grid gap-3 lg:w-72">
          {appt.canJoin ? (
            <ButtonLink
              href={`/consultation/${appt.id}/lobby`}
              size="lg"
              className="!text-dock hover:bg-primary-soft bg-white"
            >
              <Icon aria-hidden weight="fill" className="size-5" />
              Join now
            </ButtonLink>
          ) : (
            <>
              <Button
                size="lg"
                disabled
                aria-describedby="join-note"
                className="bg-white/20 text-white"
              >
                <Icon aria-hidden className="size-5" />
                Join consultation
              </Button>
              <p id="join-note" className="text-sm text-white/80">
                The join button opens at {opensAt(appt)}, {JOIN_OPENS_MINUTES} minutes before.
              </p>
            </>
          )}
          <Link
            href="/patient/appointments"
            className="min-h-11 content-center text-center font-semibold text-white underline"
          >
            Reschedule or cancel
          </Link>
        </div>
      </div>
    </section>
  );
}
