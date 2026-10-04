import Link from "next/link";
import {
  ArrowsClockwise,
  CalendarX,
  Clock,
  FileText,
  PhoneCall,
  SealCheck,
  Star,
  VideoCamera,
} from "@phosphor-icons/react/ssr";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCountdown } from "@/lib/data/appointments";
import { formatSlotDay, formatSlotTime } from "@/lib/data/doctors";
import { formatRupees } from "@/lib/format";
import type { AppointmentView } from "@/lib/types";
import { StatusBadge } from "./status-badge";

type Props = {
  appt: AppointmentView;
  onReschedule: (a: AppointmentView) => void;
  onCancel: (a: AppointmentView) => void;
  onReview: (a: AppointmentView) => void;
};

export function AppointmentCard({ appt: a, onReschedule, onCancel, onReview }: Props) {
  const ModeIcon = a.mode === "audio" ? PhoneCall : VideoCamera;
  const upcoming = a.status === "upcoming";
  const noteId = `${a.id}-note`;
  return (
    <Card className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">{a.doctorName}</h3>
          <p className="text-ink-muted text-sm">{a.specialty}</p>
          <p className="text-success mt-1 flex items-center gap-1.5 text-sm font-medium">
            <SealCheck aria-hidden weight="fill" className="size-4 shrink-0" />
            Reg. {a.registrationNumber}
          </p>
        </div>
        <StatusBadge status={a.status} />
      </div>

      <dl className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <Clock aria-hidden className="text-primary size-5 shrink-0" />
          <dt className="sr-only">When</dt>
          <dd className="font-medium">
            {formatSlotDay(a.date)}, {formatSlotTime(a.time)} IST
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <ModeIcon aria-hidden className="text-primary size-5 shrink-0" />
          <dt className="sr-only">Type</dt>
          <dd>
            {a.mode === "audio"
              ? "Audio consultation"
              : a.mode === "followup"
                ? "Follow-up"
                : "Video consultation"}
          </dd>
        </div>
        <div className="text-ink-muted text-sm sm:col-span-2">
          <dt className="inline">For: </dt>
          <dd className="inline">{a.forWhom}. </dd>
          <dt className="inline">Booking number: </dt>
          <dd className="inline tabular-nums">{a.reference}.</dd>
        </div>
      </dl>

      {upcoming ? (
        <p className="text-ink-muted text-sm">
          {a.canJoin ? "Starting now." : `Starts in ${formatCountdown(a.minutesUntil)}.`}
        </p>
      ) : null}
      {a.status === "held" ? (
        <p className="text-ink-muted text-sm">
          This time is kept for you
          {a.holdUntil
            ? ` until ${new Date(a.holdUntil).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })} IST`
            : ""}
          . Online payment is not open yet, so nothing has been charged and the booking is not
          confirmed.
        </p>
      ) : null}
      {a.status === "cancelled" ? (
        <p className="text-ink-muted text-sm">
          Cancelled by{" "}
          {a.cancelledBy === "doctor"
            ? "the doctor"
            : a.cancelledBy === "admin"
              ? "ViniCure"
              : "you"}
          .{" "}
          {a.refund
            ? a.refund.status === "processed"
              ? `Refund of ${formatRupees(a.refund.amountPaise)} sent to your account.`
              : a.refund.status === "pending"
                ? `Refund of ${formatRupees(a.refund.amountPaise)} is on its way, usually 5 to 7 working days.`
                : "No refund, as it was a late cancellation."
            : null}
        </p>
      ) : null}
      {a.status === "no_show" ? (
        <p className="text-ink-muted text-sm">
          You did not join this consultation. Book again whenever you are ready.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {upcoming ? (
          <>
            {a.canJoin ? (
              <ButtonLink href={`/consultation/${a.id}/lobby`}>Join now</ButtonLink>
            ) : null}
            <Button
              variant="secondary"
              disabled={!a.freeChange}
              aria-describedby={!a.freeChange ? noteId : undefined}
              onClick={() => onReschedule(a)}
            >
              Reschedule
            </Button>
            <Button
              variant="ghost"
              className="text-danger hover:bg-danger-soft"
              onClick={() => onCancel(a)}
            >
              <CalendarX aria-hidden className="size-5" />
              Cancel
            </Button>
          </>
        ) : null}
        {a.status === "completed" ? (
          <>
            {a.hasPrescription ? (
              <ButtonLink href="/patient/records?type=prescriptions" variant="secondary">
                <FileText aria-hidden className="size-5" />
                View prescription
              </ButtonLink>
            ) : null}
            {a.reviewed ? (
              <span className="text-ink-muted flex items-center gap-1.5 text-sm font-medium">
                <Star aria-hidden weight="fill" className="text-warning size-4" />
                You reviewed this visit
              </span>
            ) : (
              <Button variant="ghost" onClick={() => onReview(a)}>
                <Star aria-hidden className="size-5" />
                Rate this visit
              </Button>
            )}
            {a.followUpUntil ? (
              <ButtonLink href={`/book/${a.doctorId}?type=followup`}>
                <ArrowsClockwise aria-hidden className="size-5" />
                Book follow-up, {formatRupees(a.followUpFeePaise ?? 0)}
              </ButtonLink>
            ) : null}
          </>
        ) : null}
        {a.status === "held" ? (
          <Button
            variant="ghost"
            className="text-danger hover:bg-danger-soft"
            onClick={() => onCancel(a)}
          >
            <CalendarX aria-hidden className="size-5" />
            Let this time go
          </Button>
        ) : null}
        {a.status === "cancelled" || a.status === "no_show" ? (
          <ButtonLink href={`/doctors/${a.doctorId}`} variant="secondary">
            Book again
          </ButtonLink>
        ) : null}
        <Link
          href="/support"
          className="text-primary ml-auto min-h-11 content-center text-sm font-semibold underline"
        >
          Get help
        </Link>
      </div>
      {upcoming && !a.freeChange ? (
        <p id={noteId} className="text-ink-muted text-sm">
          Moving is free until 2 hours before. To move this one, contact support. Cancelling now
          means no refund.
        </p>
      ) : null}
    </Card>
  );
}
