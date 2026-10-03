import {
  Bone,
  Brain,
  FileText,
  Image as ImageIcon,
  Wind,
  Prescription,
  ShieldCheck,
  Heartbeat,
} from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatSize } from "@/lib/data/records";
import { formatSlotDay } from "@/lib/data/doctors";
import { typeLabel } from "@/lib/schemas/records";
import type { HealthRecord, RecordType } from "@/lib/types";
import { StatusChip } from "./status-chip";

const typeIcon: Record<RecordType, typeof FileText> = {
  injury: ImageIcon,
  prescriptions: Prescription,
  reports: Heartbeat,
  xray: Bone,
  mri: Brain,
  ct: Wind,
  other: FileText,
};

type Props = {
  record: HealthRecord;
  onView: (r: HealthRecord) => void;
  onDownload: (r: HealthRecord) => void;
  onShare: (r: HealthRecord) => void;
  onStopShare: (r: HealthRecord) => void;
  onDelete: (r: HealthRecord) => void;
};

export function RecordCard({
  record: r,
  onView,
  onDownload,
  onShare,
  onStopShare,
  onDelete,
}: Props) {
  const Icon = typeIcon[r.type];
  const busy = r.status === "uploading" || r.status === "scanning";
  const image = r.kind === "image";
  const name = `${r.title}, ${typeLabel(r.type)}`;
  return (
    <article
      aria-label={name}
      className={cn(
        "border-line bg-surface shadow-card overflow-hidden rounded-xl border",
        image ? "flex flex-col" : "flex flex-col gap-3 p-4 sm:flex-row sm:items-center",
      )}
    >
      {image ? (
        <div
          aria-hidden
          className="bg-primary-soft text-primary flex aspect-[4/3] items-center justify-center"
        >
          <Icon className="size-12" />
        </div>
      ) : (
        <span
          aria-hidden
          className="bg-danger-soft text-danger flex size-12 shrink-0 items-center justify-center rounded-lg"
        >
          <Icon className="size-6" />
        </span>
      )}

      <div className={cn("grid min-w-0 flex-1 gap-2", image && "p-4")}>
        <div className="min-w-0">
          <h3 className="font-semibold break-words">{r.title}</h3>
          <p className="text-ink-muted text-sm">
            {typeLabel(r.type)}. {formatSize(r.sizeBytes)}. {formatSlotDay(r.uploadedOn)}.
            {r.addedBy === "doctor" ? " Added by your doctor." : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={r.status} />
          {r.sharedWith ? (
            <span className="text-info flex items-center gap-1 text-sm font-medium">
              <ShieldCheck aria-hidden className="size-4" />
              Shared with {r.sharedWith.doctorName} until {formatSlotDay(r.sharedWith.until)}
            </span>
          ) : null}
        </div>
        {r.status === "rejected" ? <p className="text-danger text-sm">{r.rejectedReason}</p> : null}
        {busy ? (
          <p className="text-ink-muted text-sm">
            {r.status === "uploading"
              ? "Still sending. Keep this page open."
              : "We check every file before anyone can open it. This takes a moment."}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-x-1 gap-y-1">
          {r.status === "ready" ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onView(r)}
                aria-label={`View ${r.title}`}
              >
                View
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDownload(r)}
                aria-label={`Download ${r.title}`}
              >
                Download
              </Button>
              {r.sharedWith ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onStopShare(r)}
                  aria-label={`Stop sharing ${r.title}`}
                >
                  Stop sharing
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onShare(r)}
                  aria-label={`Share ${r.title} with a doctor`}
                >
                  Share with doctor
                </Button>
              )}
            </>
          ) : null}
          {r.status !== "uploading" && r.status !== "scanning" ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-danger hover:bg-danger-soft"
              onClick={() => onDelete(r)}
              aria-label={`${r.status === "rejected" ? "Remove" : "Delete"} ${r.title}`}
            >
              {r.status === "rejected" ? "Remove" : "Delete"}
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
