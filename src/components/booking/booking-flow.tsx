"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Stepper } from "@/components/ui/stepper";
import { getFamilyMembers, holdSlot } from "@/lib/data/booking";
import { holdAppointment, releaseAppointment } from "@/lib/data/booking-api";
import { formatSlotDay, formatSlotTime } from "@/lib/data/doctors";
import type { ConsultMode, DoctorProfile, PaymentResult } from "@/lib/types";
import { CheckoutDialog } from "./checkout-dialog";
import { DetailsStep, type PatientChoice } from "./details-step";
import { HoldTimer } from "./hold-timer";
import {
  FailedScreen,
  PaymentsSoonScreen,
  PendingScreen,
  SuccessScreen,
  UnavailableScreen,
} from "./outcome-screens";
import { SelfProfileForm } from "./self-profile-form";
import { ageFromDob } from "@/lib/age";
import { ReviewStep } from "./review-step";
import { SlotStep } from "./slot-step";
import { feeFor, SummaryCard } from "./summary-card";

/** A saved patient profile the signed-in account may book for (real bookings only). */
export type RealProfile = {
  id: string;
  name: string;
  relation: string;
  age: number;
  isMinor: boolean;
};

type Props = {
  doctor: DoctorProfile;
  initialSlotId: string | undefined;
  selfName: string;
  followUp?: boolean;
  /** Present for real bookings: the account's own profiles. Absent for the sample screens. */
  real?: { profiles: RealProfile[] };
};
type Outcome =
  | { kind: "none" }
  | { kind: "paid"; reference: string }
  | { kind: "failed"; reason: "declined" | "bank_down" }
  | { kind: "pending" }
  | { kind: "taken" }
  | { kind: "expired" }
  | { kind: "held"; appointmentId: string };

const STEPS = ["Time", "Details", "Pay"];
const stepTitles = ["Choose a time", "Who is it for?", "Review and pay"];

export function BookingFlow({ doctor, initialSlotId, selfName, followUp = false, real }: Props) {
  const [profiles, setProfiles] = useState<RealProfile[]>(real?.profiles ?? []);
  const selfProfile = profiles.find((p) => p.relation === "self");
  const family = real
    ? profiles
        .filter((p) => p.relation !== "self")
        .map((p) => ({ id: `fm-${p.id}`, name: p.name, relation: p.relation, age: p.age }))
    : getFamilyMembers();
  const shownSelfName = selfProfile?.name ?? selfName;
  const router = useRouter();
  const [holdId, setHoldId] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [holdError, setHoldError] = useState<string>();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [slotId, setSlotId] = useState(initialSlotId);
  const [mode, setMode] = useState<ConsultMode>(followUp ? "followup" : "video");
  const [holdUntil, setHoldUntil] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [slotError, setSlotError] = useState<string>();
  const [choice, setChoice] = useState<PatientChoice>({ kind: "self" });
  const [reason, setReason] = useState("");
  const [whoKey, setWhoKey] = useState("self");
  const [consent, setConsent] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "none" });
  const headingRef = useRef<HTMLHeadingElement>(null);

  const slot = doctor.slots.find((s) => s.id === slotId);
  const forWhom =
    choice.kind === "self"
      ? `Myself (${shownSelfName})`
      : choice.kind === "family"
        ? `${choice.member.name} (${choice.member.relation})`
        : `${choice.name} (${choice.relation})`;

  // Move focus to the new heading whenever the step or outcome changes, so keyboard and screen reader users land on it.
  useEffect(() => {
    if (outcome.kind === "none") headingRef.current?.focus();
    else document.getElementById("outcome-heading")?.focus();
  }, [step, outcome.kind]);

  const expire = useCallback(() => {
    setPayOpen(false);
    setOutcome((o) => (o.kind === "paid" || o.kind === "pending" ? o : { kind: "expired" }));
  }, []);

  async function continueFromSlot() {
    if (!slotId) return;
    // Real bookings hold the time when the details are sent, because the server needs to know who it is for.
    if (real) {
      setStep(1);
      return;
    }
    setBusy(true);
    setSlotError(undefined);
    const hold = await holdSlot(slotId);
    setBusy(false);
    setHoldUntil(hold.expiresAt);
    setStep(1);
  }

  /** Real bookings: hold the time for the chosen profile. The server decides if it is still free. */
  async function holdForReal(
    c: PatientChoice,
    r: string,
    adult?: { name: string; relation: string },
  ) {
    const patientId =
      c.kind === "self" ? selfProfile?.id : c.kind === "family" ? c.member.id.slice(3) : undefined;
    if (!patientId || !slotId) {
      setHoldError("Choose who the consultation is for.");
      return;
    }
    setBusy(true);
    setHoldError(undefined);
    const result = await holdAppointment({
      patientId,
      doctorId: doctor.id,
      startAt: slotId,
      reason: r,
      ...(adult ? { attendingAdult: adult } : {}),
    });
    setBusy(false);
    if (result.status === "ok") {
      setChoice(c);
      setReason(r);
      setConsent(true);
      setWhoKey(c.kind === "self" ? "self" : c.kind === "family" ? c.member.id : "other");
      setHoldId(result.appointmentId);
      setHoldUntil(result.expiresAt);
      setStep(2);
    } else if (result.status === "taken") setOutcome({ kind: "taken" });
    else if (result.status === "limit") setHoldError(result.message);
    else if (result.status === "fields") setHoldError(Object.values(result.errors)[0]);
    else if (result.status === "signin") setHoldError("Please sign in again to continue.");
    else setHoldError(result.message);
  }

  async function release() {
    if (!holdId) return;
    setReleasing(true);
    await releaseAppointment(holdId);
    setReleasing(false);
    router.push("/doctors");
  }

  function handlePayment(result: PaymentResult) {
    setPayOpen(false);
    if (result.status === "paid") setOutcome({ kind: "paid", reference: result.reference });
    else if (result.status === "failed") setOutcome({ kind: "failed", reason: result.reason });
    else if (result.status === "pending") setOutcome({ kind: "pending" });
    else setOutcome({ kind: "taken" });
  }

  function restartTime() {
    setOutcome({ kind: "none" });
    setHoldUntil(null);
    setSlotId(undefined);
    setStep(0);
  }

  if (outcome.kind === "paid" && slot) {
    return (
      <SuccessScreen
        doctor={doctor}
        slot={slot}
        mode={mode}
        forWhom={forWhom}
        feePaise={feeFor(doctor, mode)}
        reference={outcome.reference}
      />
    );
  }
  if (outcome.kind === "held" && slot) {
    return (
      <PaymentsSoonScreen
        doctorName={doctor.name}
        when={`${formatSlotDay(slot.date)}, ${formatSlotTime(slot.time)}`}
        releasing={releasing}
        onRelease={() => void release()}
      />
    );
  }
  if (outcome.kind === "pending") return <PendingScreen />;
  if (outcome.kind === "failed") {
    return (
      <div className="grid gap-6">
        {holdUntil ? <HoldTimer expiresAt={holdUntil} onExpire={expire} /> : null}
        <FailedScreen
          reason={outcome.reason}
          onRetry={() => {
            setOutcome({ kind: "none" });
            setPayOpen(true);
          }}
          onChangeTime={restartTime}
        />
      </div>
    );
  }
  if (outcome.kind === "taken" || outcome.kind === "expired") {
    return <UnavailableScreen kind={outcome.kind} doctorId={doctor.id} onRestart={restartTime} />;
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem] lg:gap-10">
      <div className="grid min-w-0 content-start gap-6">
        <Stepper steps={STEPS} current={step} />
        {holdUntil && step > 0 ? <HoldTimer expiresAt={holdUntil} onExpire={expire} /> : null}
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold outline-none">
          <span className="sr-only">Step {step + 1} of 3: </span>
          {stepTitles[step]}
        </h1>

        {step === 0 ? (
          <SlotStep
            doctor={doctor}
            slotId={slotId}
            mode={mode}
            followUpEligible={followUp}
            busy={busy}
            error={slotError}
            onSlot={setSlotId}
            onMode={setMode}
            onContinue={() => void continueFromSlot()}
          />
        ) : null}
        {step === 1 && real && !selfProfile ? (
          <SelfProfileForm
            defaultName={selfName}
            onCreated={(p) =>
              setProfiles([
                {
                  id: p.id,
                  name: p.name,
                  relation: "self",
                  age: ageFromDob(p.dob),
                  isMinor: p.isMinor,
                },
              ])
            }
          />
        ) : null}
        {step === 1 && (!real || selfProfile) ? (
          <DetailsStep
            selfName={shownSelfName}
            real={Boolean(real)}
            busy={busy}
            submitError={holdError}
            family={family}
            initial={{ who: whoKey, reason, consent }}
            onBack={() => setStep(0)}
            onNext={(c, r, adult) => {
              if (real) {
                void holdForReal(c, r, adult);
                return;
              }
              setChoice(c);
              setReason(r);
              setConsent(true);
              setWhoKey(c.kind === "self" ? "self" : c.kind === "family" ? c.member.id : "other");
              setStep(2);
            }}
          />
        ) : null}
        {step === 2 && slot ? (
          <ReviewStep
            doctor={doctor}
            slot={slot}
            mode={mode}
            forWhom={forWhom}
            reason={reason}
            onEdit={(s) => setStep(s)}
            onPay={() => {
              // Online payment is not open for real bookings yet: say so and keep the hold.
              if (real && holdId) setOutcome({ kind: "held", appointmentId: holdId });
              else setPayOpen(true);
            }}
          />
        ) : null}
      </div>

      <aside aria-label="Booking summary" className="lg:sticky lg:top-24 lg:self-start">
        <SummaryCard
          doctor={doctor}
          slot={slot}
          mode={mode}
          forWhom={step > 0 ? forWhom : undefined}
        />
      </aside>

      <CheckoutDialog
        open={payOpen}
        amountPaise={feeFor(doctor, mode)}
        onClose={() => setPayOpen(false)}
        onResult={handlePayment}
      />
    </div>
  );
}
