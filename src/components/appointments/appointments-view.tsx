"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CalendarBlank } from "@phosphor-icons/react/ssr";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatSlotDay, formatSlotTime } from "@/lib/data/doctors";
import { formatRupees } from "@/lib/format";
import type { AppointmentView, DoctorSlot } from "@/lib/types";
import { AppointmentCard } from "./appointment-card";
import { CancelDialog } from "./cancel-dialog";
import { RescheduleDialog } from "./reschedule-dialog";
import { ReviewDialog } from "./review-dialog";

export type TabId = "upcoming" | "past" | "cancelled";
const TABS: Array<{ id: TabId; label: string }> = [
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past" },
  { id: "cancelled", label: "Cancelled" },
];

function tabOf(a: AppointmentView): TabId {
  if (a.status === "upcoming") return "upcoming";
  if (a.status === "cancelled") return "cancelled";
  return "past";
}

const EMPTY: Record<TabId, { title: string; text: string }> = {
  upcoming: {
    title: "Nothing coming up",
    text: "Book a doctor and your appointment will show here with a join button.",
  },
  past: {
    title: "No past visits yet",
    text: "After a consultation, your visit, prescription and follow-up options appear here.",
  },
  cancelled: {
    title: "No cancelled appointments",
    text: "If you cancel or a doctor cancels, you can see the refund status here.",
  },
};

type Props = {
  initial: AppointmentView[];
  tab: TabId;
  slotsByDoctor: Record<string, DoctorSlot[]>;
};

export function AppointmentsView({ initial, tab, slotsByDoctor }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState(initial);
  const [cancelling, setCancelling] = useState<AppointmentView | null>(null);
  const [moving, setMoving] = useState<AppointmentView | null>(null);
  const [rating, setRating] = useState<AppointmentView | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const counts = Object.fromEntries(
    TABS.map((t) => [t.id, items.filter((a) => tabOf(a) === t.id).length]),
  ) as Record<TabId, number>;
  const shown = items.filter((a) => tabOf(a) === tab);
  const ordered =
    tab === "upcoming"
      ? [...shown].sort((a, b) => a.minutesUntil - b.minutesUntil)
      : [...shown].sort((a, b) => b.date.localeCompare(a.date));

  // The row that held focus may leave this tab, so move focus to the list heading after a change.
  const settle = () => setTimeout(() => headingRef.current?.focus(), 150);

  return (
    <div className="grid min-w-0 gap-6">
      <nav aria-label="Appointment lists" className="min-w-0">
        <ul className="border-line flex gap-1 overflow-x-auto border-b">
          {TABS.map((t) => (
            <li key={t.id}>
              <Link
                href={`/patient/appointments?tab=${t.id}`}
                aria-current={tab === t.id ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-4 font-semibold whitespace-nowrap",
                  tab === t.id
                    ? "border-primary text-primary"
                    : "text-ink-muted hover:text-ink border-transparent",
                )}
              >
                {t.label}
                <span className="bg-primary-soft text-primary rounded-full px-2 text-sm tabular-nums">
                  {counts[t.id]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-xl font-semibold outline-none"
        aria-live="polite"
      >
        {TABS.find((t) => t.id === tab)?.label} appointments ({shown.length})
      </h2>

      {ordered.length ? (
        <ul className="grid min-w-0 gap-4">
          {ordered.map((a) => (
            <li key={a.id}>
              <AppointmentCard
                appt={a}
                onReschedule={setMoving}
                onCancel={setCancelling}
                onReview={setRating}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          as="h3"
          icon={<CalendarBlank />}
          title={EMPTY[tab].title}
          description={EMPTY[tab].text}
          action={
            tab === "upcoming" ? <ButtonLink href="/doctors">Find a doctor</ButtonLink> : undefined
          }
        />
      )}

      <CancelDialog
        appt={cancelling}
        onClose={() => setCancelling(null)}
        onDone={(id, refundPaise) => {
          setItems((list) =>
            list.map((a) =>
              a.id === id
                ? {
                    ...a,
                    status: "cancelled",
                    cancelledBy: "patient",
                    canJoin: false,
                    refund: { status: refundPaise ? "pending" : "none", amountPaise: refundPaise },
                  }
                : a,
            ),
          );
          setCancelling(null);
          toast({
            tone: "success",
            title: "Appointment cancelled",
            description: refundPaise
              ? `${formatRupees(refundPaise)} will be refunded in 5 to 7 working days.`
              : "No refund applies to a late cancellation.",
          });
          settle();
        }}
      />
      <RescheduleDialog
        appt={moving}
        slots={moving ? (slotsByDoctor[moving.doctorId] ?? []) : []}
        onClose={() => setMoving(null)}
        onDone={(id, slot) => {
          setItems((list) =>
            list.map((a) => (a.id === id ? { ...a, date: slot.date, time: slot.time } : a)),
          );
          setMoving(null);
          toast({
            tone: "success",
            title: "Appointment moved",
            description: `Now ${formatSlotDay(slot.date)} at ${formatSlotTime(slot.time)} IST.`,
          });
          settle();
        }}
      />
      <ReviewDialog
        appt={rating}
        onClose={() => setRating(null)}
        onDone={(id) => {
          setItems((list) => list.map((a) => (a.id === id ? { ...a, reviewed: true } : a)));
          setRating(null);
          toast({ tone: "success", title: "Thank you", description: "Your review was saved." });
        }}
      />
    </div>
  );
}
