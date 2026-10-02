"use client";

import { LockKey } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { formatSize } from "@/lib/data/records";
import { formatSlotDay } from "@/lib/data/doctors";
import { typeLabel } from "@/lib/schemas/records";
import type { HealthRecord } from "@/lib/types";

export function ViewDialog({
  record,
  onClose,
  onDownload,
}: {
  record: HealthRecord | null;
  onClose: () => void;
  onDownload: (r: HealthRecord) => void;
}) {
  return (
    <Dialog
      open={Boolean(record)}
      onClose={onClose}
      variant="sheet"
      title={record?.title ?? "Record"}
      description={
        record
          ? `${typeLabel(record.type)}. ${formatSize(record.sizeBytes)}. Added ${formatSlotDay(record.uploadedOn)}.`
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {record ? <Button onClick={() => onDownload(record)}>Download</Button> : null}
        </>
      }
    >
      {record ? (
        <div className="grid gap-3">
          <div
            role="img"
            aria-label="Preview placeholder. A real file preview appears here."
            className="bg-primary-soft text-primary flex aspect-[4/3] items-center justify-center rounded-xl text-center"
          >
            <span className="px-6 text-sm font-medium">
              Preview placeholder. Sample data, no real file.
            </span>
          </div>
          {record.note ? (
            <p>
              <span className="text-ink-muted">Your note: </span>
              {record.note}
            </p>
          ) : null}
          <p className="text-ink-muted flex gap-2 text-sm">
            <LockKey aria-hidden className="mt-0.5 size-4 shrink-0" />
            Files open through a private link that stops working after a few minutes.
          </p>
        </div>
      ) : null}
    </Dialog>
  );
}
