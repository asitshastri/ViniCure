import Link from "next/link";
import {
  CheckCircle,
  Clock,
  HourglassMedium,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react/ssr";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatRupees } from "@/lib/format";
import { formatSlotDay, formatSlotTime } from "@/lib/data/doctors";
import type { ConsultMode, DoctorProfile, DoctorSlot } from "@/lib/types";
import { MODE_LABEL } from "./summary-card";

type ScreenProps = {
  title: string;
  icon: React.ReactNode;
  tone: "success" | "danger" | "warning";
  children: React.ReactNode;
};

const tones = {
  success: "text-success bg-success-soft",
  danger: "text-danger bg-danger-soft",
  warning: "text-warning bg-warning-soft",
};

function Screen({ title, icon, tone, children }: ScreenProps) {
  return (
    <div className="mx-auto grid max-w-2xl gap-6 text-center sm:text-left">
      <span
        aria-hidden
        className={`${tones[tone]} mx-auto flex size-16 items-center justify-center rounded-full sm:mx-0 [&>svg]:size-9`}
      >
        {icon}
      </span>
      <h1
        tabIndex={-1}
        id="outcome-heading"
        className="text-3xl font-semibold outline-none sm:text-4xl"
      >
        {title}
      </h1>
      {children}
    </div>
  );
}

type Booked = {
  doctor: DoctorProfile;
  slot: DoctorSlot;
  mode: ConsultMode;
  forWhom: string;
  feePaise: number;
  reference: string;
};

export function SuccessScreen({ doctor, slot, mode, forWhom, feePaise, reference }: Booked) {
  return (
    <Screen title="Your consultation is booked" icon={<CheckCircle weight="fill" />} tone="success">
      <Card className="grid gap-3 text-left">
        <p className="font-display text-xl font-semibold">{doctor.name}</p>
        <dl className="grid gap-2">
          <div>
            <dt className="text-ink-muted inline">When: </dt>
            <dd className="inline font-medium">
              {formatSlotDay(slot.date)}, {formatSlotTime(slot.time)} IST
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted inline">Type: </dt>
            <dd className="inline font-medium">{MODE_LABEL[mode]}</dd>
          </div>
          <div>
            <dt className="text-ink-muted inline">For: </dt>
            <dd className="inline font-medium">{forWhom}</dd>
          </div>
          <div>
            <dt className="text-ink-muted inline">Paid: </dt>
            <dd className="inline font-medium tabular-nums">{formatRupees(feePaise)}</dd>
          </div>
          <div>
            <dt className="text-ink-muted inline">Booking number: </dt>
            <dd className="inline font-medium tabular-nums">{reference}</dd>
          </div>
        </dl>
      </Card>
      <section aria-labelledby="next-heading" className="text-left">
        <h2 id="next-heading" className="text-xl font-semibold">
          What happens next
        </h2>
        <ul className="text-ink-muted mt-3 grid list-disc gap-2 pl-5">
          <li>We text you a reminder before the call.</li>
          <li>The join button opens 10 minutes before your time.</li>
          <li>Keep reports or photos ready. You can add them to your records now.</li>
          <li>
            The prescription appears in your records after the call, with the doctor’s registration
            number.
          </li>
        </ul>
      </section>
      <div className="flex flex-wrap justify-center gap-3 sm:justify-start">
        <ButtonLink href="/patient/dashboard" size="lg">
          Go to my appointments
        </ButtonLink>
        <ButtonLink href="/doctors" variant="secondary" size="lg">
          Find another doctor
        </ButtonLink>
      </div>
    </Screen>
  );
}

export function FailedScreen({
  reason,
  onRetry,
  onChangeTime,
}: {
  reason: "declined" | "bank_down";
  onRetry: () => void;
  onChangeTime: () => void;
}) {
  return (
    <Screen title="Payment did not go through" icon={<XCircle weight="fill" />} tone="danger">
      <p className="text-ink-muted text-lg">
        {reason === "declined"
          ? "Your bank declined the payment. No money was taken. Try another payment method or UPI ID."
          : "Your bank is not responding right now. No money was taken. Try again in a few minutes or use another method."}
      </p>
      <p className="text-ink-muted">Your time is still held while the timer runs.</p>
      <div className="flex flex-wrap justify-center gap-3 sm:justify-start">
        <Button size="lg" onClick={onRetry}>
          Try payment again
        </Button>
        <Button variant="secondary" size="lg" onClick={onChangeTime}>
          Choose a different time
        </Button>
      </div>
      <p className="text-ink-muted text-sm">
        Charged but not booked? It is refunded automatically.{" "}
        <Link href="/support" className="text-primary underline">
          Contact support
        </Link>
        .
      </p>
    </Screen>
  );
}

export function PendingScreen() {
  return (
    <Screen
      title="We are confirming your payment"
      icon={<HourglassMedium weight="fill" />}
      tone="warning"
    >
      <p className="text-ink-muted text-lg">
        Your bank has not confirmed yet. <strong className="text-ink">Do not pay again.</strong>{" "}
        This usually takes a few minutes. We will text you when your booking is confirmed.
      </p>
      <p className="text-ink-muted">
        If the payment fails, the money returns to your account in 5 to 7 working days and the time
        is released.
      </p>
      <div className="flex flex-wrap justify-center gap-3 sm:justify-start">
        <ButtonLink href="/patient/dashboard" size="lg">
          Check my appointments
        </ButtonLink>
        <ButtonLink href="/support" variant="secondary" size="lg">
          Contact support
        </ButtonLink>
      </div>
    </Screen>
  );
}

export function UnavailableScreen({
  kind,
  doctorId,
  onRestart,
}: {
  kind: "taken" | "expired";
  doctorId: string;
  onRestart: () => void;
}) {
  return (
    <Screen
      title={kind === "taken" ? "Someone booked that time first" : "Your held time ran out"}
      icon={kind === "taken" ? <WarningCircle weight="fill" /> : <Clock weight="fill" />}
      tone="warning"
    >
      <p className="text-ink-muted text-lg">
        {kind === "taken"
          ? "No money was taken. Pick another time with the same doctor, or look at other doctors."
          : "We hold a time for 10 minutes so no one else books it while you pay. Pick a time again to continue. Your details are kept."}
      </p>
      <div className="flex flex-wrap justify-center gap-3 sm:justify-start">
        <Button size="lg" onClick={onRestart}>
          Choose a time again
        </Button>
        <ButtonLink href={`/doctors/${doctorId}`} variant="secondary" size="lg">
          Back to the doctor’s profile
        </ButtonLink>
      </div>
    </Screen>
  );
}
