import { CalendarBlank, SealCheck, VideoCamera } from "@phosphor-icons/react/ssr";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { formatRupees } from "@/lib/format";
import { formatSlotDay, formatSlotTime } from "@/lib/data/doctors";
import type { ConsultMode, DoctorProfile, DoctorSlot } from "@/lib/types";

export const MODE_LABEL: Record<ConsultMode, string> = {
  video: "Video consultation",
  audio: "Audio consultation",
  followup: "Follow-up",
};

export function feeFor(doctor: DoctorProfile, mode: ConsultMode): number {
  if (mode === "audio") return doctor.audioFeePaise;
  if (mode === "followup") return doctor.followUpFeePaise;
  return doctor.feePaise;
}

type Props = {
  doctor: DoctorProfile;
  slot?: DoctorSlot | undefined;
  mode: ConsultMode;
  forWhom?: string | undefined;
};

/** Side summary that follows the person through the steps. */
export function SummaryCard({ doctor, slot, mode, forWhom }: Props) {
  return (
    <Card className="grid gap-4">
      <div className="flex items-center gap-3">
        <Avatar name={doctor.name} size="lg" />
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold">{doctor.name}</p>
          <p className="text-ink-muted text-sm">{doctor.specialty}</p>
        </div>
      </div>
      <p className="text-success flex items-center gap-1.5 text-sm font-medium">
        <SealCheck aria-hidden weight="fill" className="size-4 shrink-0" />
        Reg. {doctor.registrationNumber}
      </p>
      <dl className="border-line grid gap-3 border-t pt-4 text-base">
        <div className="flex items-start gap-3">
          <CalendarBlank aria-hidden className="text-primary mt-0.5 size-5 shrink-0" />
          <dt className="sr-only">Time</dt>
          <dd>
            {slot
              ? `${formatSlotDay(slot.date)}, ${formatSlotTime(slot.time)} IST`
              : "Choose a time"}
          </dd>
        </div>
        <div className="flex items-start gap-3">
          <VideoCamera aria-hidden className="text-primary mt-0.5 size-5 shrink-0" />
          <dt className="sr-only">Type</dt>
          <dd>{MODE_LABEL[mode]}</dd>
        </div>
        {forWhom ? (
          <div className="text-ink-muted text-sm">
            <dt className="inline">For: </dt>
            <dd className="inline">{forWhom}</dd>
          </div>
        ) : null}
      </dl>
      <p className="border-line flex items-baseline justify-between border-t pt-4">
        <span className="text-ink-muted">Fee</span>
        <span className="font-display text-2xl font-semibold tabular-nums">
          {formatRupees(feeFor(doctor, mode))}
        </span>
      </p>
    </Card>
  );
}
