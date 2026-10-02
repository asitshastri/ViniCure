"use client";

import { useState } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { updateRequest } from "@/lib/data/admin";
import type { DataRequest } from "@/lib/types";

const tone: Record<DataRequest["status"], BadgeTone> = {
  new: "warning",
  in_progress: "info",
  done: "success",
};
const label: Record<DataRequest["status"], string> = {
  new: "New",
  in_progress: "In progress",
  done: "Done",
};

/** Status and the next step for one request. Deletion requests with a legal hold cannot be completed. */
export function RequestActions({ item }: { item: DataRequest }) {
  const [status, setStatus] = useState(item.status);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const blocked = item.type === "deletion" && item.legalHold && status === "in_progress";

  async function advance() {
    setBusy(true);
    await updateRequest();
    const next = status === "new" ? "in_progress" : "done";
    setStatus(next);
    setBusy(false);
    toast({
      title: next === "done" ? "Request closed" : "Request started",
      description: `${item.patient}. Recorded in the audit log.`,
      tone: "success",
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone={tone[status]}>{label[status]}</Badge>
      {status !== "done" ? (
        blocked ? (
          <span className="text-warning text-sm font-medium">Legal hold: records must be kept</span>
        ) : (
          <Button size="sm" variant="secondary" loading={busy} onClick={() => void advance()}>
            {status === "new" ? "Start" : "Mark done"}
            <span className="sr-only"> request from {item.patient}</span>
          </Button>
        )
      ) : null}
    </div>
  );
}
