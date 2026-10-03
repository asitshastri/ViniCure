"use client";

import { useRef, type Dispatch, type SetStateAction } from "react";
import {
  CheckCircle,
  CircleNotch,
  Clock,
  FileArrowUp,
  ShieldCheck,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react/ssr";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { uploadDocument } from "@/lib/data/application";
import { ACCEPT_ATTR, validateFile } from "@/lib/schemas/records";
import type { ApplicationDoc, DocState } from "@/lib/types";
import { useState } from "react";

const chip: Record<DocState, { label: string; tone: BadgeTone; Icon: typeof CheckCircle }> = {
  missing: { label: "Not uploaded", tone: "neutral", Icon: FileArrowUp },
  uploading: { label: "Uploading", tone: "info", Icon: CircleNotch },
  scanning: { label: "Checking for viruses", tone: "warning", Icon: ShieldCheck },
  uploaded: { label: "Uploaded, waiting for review", tone: "info", Icon: Clock },
  accepted: { label: "Accepted", tone: "success", Icon: CheckCircle },
  replace: { label: "Please replace", tone: "warning", Icon: WarningCircle },
  rejected: { label: "Not saved", tone: "danger", Icon: XCircle },
};

type Props = {
  docs: ApplicationDoc[];
  onChange: Dispatch<SetStateAction<ApplicationDoc[]>>;
  editable: boolean;
};

export function DocumentsPanel({ docs, onChange, editable }: Props) {
  const refs = useRef<Record<string, HTMLInputElement | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Functional update, so several uploads running at the same time never overwrite each other.
  const patch = (id: string, p: Partial<ApplicationDoc>) =>
    onChange((list) => list.map((d) => (d.id === id ? { ...d, ...p } : d)));

  async function pick(doc: ApplicationDoc, f: File | undefined) {
    if (!f) return;
    const problem = validateFile(f);
    if (problem) return setErrors((e) => ({ ...e, [doc.id]: problem }));
    setErrors((e) => ({ ...e, [doc.id]: "" }));
    patch(doc.id, { state: "uploading", fileName: f.name, reason: "" });
    const r = await uploadDocument(f, (s) => patch(doc.id, { state: s }));
    patch(
      doc.id,
      r.status === "uploaded" ? { state: "uploaded" } : { state: "rejected", reason: r.reason },
    );
  }

  return (
    <ul className="divide-line border-line divide-y rounded-xl border">
      {docs.map((d) => {
        const { label, tone, Icon } = chip[d.state];
        const busy = d.state === "uploading" || d.state === "scanning";
        const canUpload = editable && d.state !== "accepted" && !busy;
        return (
          <li key={d.id} className="grid gap-2 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 basis-64">
                <p className="font-semibold">
                  {d.label}
                  {d.required ? (
                    <span className="text-ink-muted text-sm font-normal"> (required)</span>
                  ) : (
                    <span className="text-ink-muted text-sm font-normal"> (optional)</span>
                  )}
                </p>
                <p className="text-ink-muted text-sm">{d.hint}</p>
                {d.fileName ? <p className="mt-1 text-sm break-all">File: {d.fileName}</p> : null}
              </div>
              <Badge
                tone={tone}
                icon={<Icon weight="fill" className={`size-3.5 ${busy ? "animate-spin" : ""}`} />}
              >
                {label}
              </Badge>
            </div>
            {d.reason ? (
              <p
                role="note"
                className={`text-sm font-medium ${d.state === "rejected" ? "text-danger" : "text-warning"}`}
              >
                {d.reason}
              </p>
            ) : null}
            {errors[d.id] ? (
              <p role="alert" className="text-danger text-sm font-medium">
                {errors[d.id]}
              </p>
            ) : null}
            {busy ? (
              <div
                role="progressbar"
                aria-label={`${d.label} ${d.state === "uploading" ? "upload" : "safety check"}`}
                className="bg-line h-2 overflow-hidden rounded-full"
              >
                <div className="bg-primary animate-shimmer h-full w-2/3" />
              </div>
            ) : null}
            {canUpload ? (
              <div>
                <input
                  ref={(el) => {
                    refs.current[d.id] = el;
                  }}
                  type="file"
                  accept={ACCEPT_ATTR}
                  className="sr-only"
                  tabIndex={-1}
                  aria-label={`Choose a file for ${d.label}`}
                  onChange={(e) => {
                    void pick(d, e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant={d.state === "missing" ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => refs.current[d.id]?.click()}
                  aria-label={`${d.state === "missing" ? "Upload" : "Replace"} ${d.label}`}
                >
                  <FileArrowUp aria-hidden className="size-4" />{" "}
                  {d.state === "missing" ? "Upload" : "Replace file"}
                </Button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
