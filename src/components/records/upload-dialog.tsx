"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/auth/notice";
import { uploadRecord } from "@/lib/data/records";
import { ACCEPT_ATTR, MAX_MB, RECORD_TYPES, uploadForm, validateFile } from "@/lib/schemas/records";
import type { RecordType } from "@/lib/types";

export type NewRecord = {
  title: string;
  type: RecordType;
  sizeBytes: number;
  status: "ready" | "rejected";
  reason?: string;
};

type Props = { open: boolean; onClose: () => void; onDone: (r: NewRecord) => void };

export function UploadDialog({ open, onClose, onDone }: Props) {
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState("");
  const [title, setTitle] = useState("");
  const [errors, setErrors] = useState<{ file?: string; type?: string; title?: string }>({});
  const [stage, setStage] = useState<null | { name: "uploading" | "scanning"; percent: number }>(
    null,
  );

  const busy = stage !== null;

  function reset() {
    setFile(null);
    setType("");
    setTitle("");
    setErrors({});
    setStage(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  function pick(f: File | undefined) {
    if (!f) return;
    const problem = validateFile(f);
    if (problem) {
      setFile(null);
      setErrors((e) => ({ ...e, file: problem }));
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(f);
    setErrors((e) => ({ ...e, file: undefined }));
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").slice(0, 80));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found: typeof errors = {};
    if (!file) found.file = "Choose a file to upload.";
    const parsed = uploadForm.safeParse({ type, title });
    if (!parsed.success)
      for (const i of parsed.error.issues) found[i.path[0] as "type" | "title"] ??= i.message;
    if (Object.keys(found).length || !file || !parsed.success) {
      setErrors(found);
      return;
    }
    setErrors({});
    const outcome = await uploadRecord(file, (name, percent) => setStage({ name, percent }));
    setStage(null);
    onDone({
      title: parsed.data.title,
      type: parsed.data.type,
      sizeBytes: file.size,
      status: outcome.status,
      reason: outcome.reason,
    });
    reset();
  }

  const formId = `${uid}-upload`;
  return (
    <Dialog
      open={open}
      onClose={close}
      dismissible={!busy}
      variant="sheet"
      title="Add a record"
      description={`PDF, JPG, PNG or WebP, up to ${MAX_MB} MB. Files are encrypted and checked before anyone can open them.`}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            {busy ? (stage?.name === "scanning" ? "Checking file" : "Uploading") : "Upload"}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={(e) => void submit(e)} className="grid gap-4">
        <Field inputId={`${uid}-file`} label="File" error={errors.file} required>
          {({ describedBy, invalid }) => (
            <input
              ref={fileRef}
              id={`${uid}-file`}
              type="file"
              accept={ACCEPT_ATTR}
              disabled={busy}
              onChange={(e) => pick(e.target.files?.[0])}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className="border-line-strong file:bg-primary-soft file:text-primary w-full rounded-lg border p-2 text-base file:mr-3 file:min-h-9 file:rounded-md file:border-0 file:px-3 file:font-semibold"
            />
          )}
        </Field>
        <Field inputId={`${uid}-type`} label="What is it?" error={errors.type} required>
          {({ describedBy, invalid }) => (
            <Select
              id={`${uid}-type`}
              value={type}
              onChange={(e) => setType(e.target.value)}
              disabled={busy}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            >
              <option value="">Choose</option>
              {RECORD_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          inputId={`${uid}-title`}
          label="Name"
          hint="For example “Blood report, September”. Do not put your ID numbers in the name."
          error={errors.title}
          required
        >
          {({ describedBy, invalid }) => (
            <Input
              id={`${uid}-title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              maxLength={80}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>

        {stage ? (
          <div className="grid gap-2">
            <p className="text-sm font-medium" aria-live="polite">
              {stage.name === "uploading" ? "Uploading…" : "Checking the file for viruses…"}
            </p>
            <div
              role="progressbar"
              aria-label={stage.name === "uploading" ? "Upload progress" : "Safety check progress"}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={stage.name === "scanning" ? undefined : stage.percent}
              className="bg-line h-2 overflow-hidden rounded-full"
            >
              <div
                className={
                  stage.name === "scanning"
                    ? "bg-warning animate-shimmer h-full w-full"
                    : "bg-primary h-full"
                }
                style={stage.name === "uploading" ? { width: `${stage.percent}%` } : undefined}
              />
            </div>
          </div>
        ) : null}
        <Notice tone="info" title="Prototype">
          A file name containing “virus” is rejected by the safety check, so you can see that state.
        </Notice>
      </form>
    </Dialog>
  );
}
