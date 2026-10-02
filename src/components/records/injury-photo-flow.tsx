"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowClockwise,
  ArrowsClockwise,
  Camera,
  CheckCircle,
  Crop,
  Images,
  LockKey,
  Sun,
  WarningCircle,
} from "@phosphor-icons/react/ssr";
import { Notice } from "@/components/auth/notice";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { uploadRecord } from "@/lib/data/records";
import { photoNote, validateFile } from "@/lib/schemas/records";
import type { ShareTarget } from "@/lib/types";

type Quality = { ok: boolean; text: string } | null;
type Stage = null | { name: "uploading" | "scanning"; percent: number };

/** Looks at size and average brightness in the browser. The hint is advice only; the doctor decides if the photo is clear enough. */
function checkQuality(img: HTMLImageElement): Quality {
  if (Math.min(img.naturalWidth, img.naturalHeight) < 600) {
    return {
      ok: false,
      text: "The photo is small. Move a little closer or use a higher quality setting.",
    };
  }
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d");
  if (!ctx) return { ok: true, text: "Clear image" };
  ctx.drawImage(img, 0, 0, 32, 32);
  const d = ctx.getImageData(0, 0, 32, 32).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4)
    sum += 0.2126 * (d[i] ?? 0) + 0.7152 * (d[i + 1] ?? 0) + 0.0722 * (d[i + 2] ?? 0);
  const mean = sum / (d.length / 4);
  if (mean < 55)
    return { ok: false, text: "The photo is dark. Turn on a light or move near a window." };
  if (mean > 215)
    return { ok: false, text: "The photo is very bright. Move away from direct light." };
  return { ok: true, text: "Clear image, good lighting" };
}

export function InjuryPhotoFlow({
  targets,
  initialDoctor,
}: {
  targets: ShareTarget[];
  initialDoctor: string;
}) {
  const uid = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [quality, setQuality] = useState<Quality>(null);
  const [rotation, setRotation] = useState(0);
  const [square, setSquare] = useState(false);
  const [doctorId, setDoctorId] = useState(initialDoctor);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string>();
  const [stage, setStage] = useState<Stage>(null);
  const [result, setResult] = useState<null | { ok: boolean; reason?: string }>(null);

  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  const doctor = targets.find((t) => t.doctorId === doctorId);

  function pick(f: File | undefined) {
    if (!f) return;
    const problem =
      validateFile(f) ??
      (f.type.startsWith("image/") ? undefined : "Choose a photo, not a document.");
    if (problem) {
      setFileError(problem);
      return;
    }
    setFileError(undefined);
    setFile(f);
    setQuality(null);
    setRotation(0);
    setSquare(false);
    setUrl(URL.createObjectURL(f));
  }

  function retake() {
    setFile(null);
    setUrl(null);
    setQuality(null);
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
  }

  async function upload() {
    if (!file) return;
    const parsedNote = photoNote.safeParse(note);
    if (!parsedNote.success) {
      setNoteError(parsedNote.error.issues[0]?.message);
      return;
    }
    setNoteError(undefined);
    const outcome = await uploadRecord(file, (name, percent) => setStage({ name, percent }));
    setStage(null);
    setResult({
      ok: outcome.status === "ready",
      ...(outcome.reason ? { reason: outcome.reason } : {}),
    });
  }

  if (result?.ok) {
    return (
      <div className="grid max-w-xl gap-5">
        <Notice tone="info" title="Photo sent">
          It is saved in your records and {doctor?.doctorName ?? "your doctor"} can open it before
          your consultation. You can stop sharing at any time.
        </Notice>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/patient/records?type=injury">See my photos</ButtonLink>
          <Button
            variant="secondary"
            onClick={() => {
              setResult(null);
              retake();
              setNote("");
            }}
          >
            Send another
          </Button>
        </div>
      </div>
    );
  }

  const busy = stage !== null;
  return (
    <div className="grid max-w-xl gap-6">
      <p className="text-ink-muted flex items-center gap-2 text-sm">
        <LockKey aria-hidden className="size-4" /> Private. Only you and the doctor you choose can
        see it.
      </p>

      <input
        ref={cameraRef}
        id={`${uid}-cam`}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-label="Take a photo"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <input
        ref={galleryRef}
        id={`${uid}-gal`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a photo from your gallery"
        onChange={(e) => pick(e.target.files?.[0])}
      />

      {!url ? (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Button size="lg" onClick={() => cameraRef.current?.click()}>
              <Camera aria-hidden className="size-5" />
              Take a photo
            </Button>
            <Button size="lg" variant="secondary" onClick={() => galleryRef.current?.click()}>
              <Images aria-hidden className="size-5" />
              Choose from gallery
            </Button>
          </div>
          {fileError ? (
            <p role="alert" className="text-danger flex items-center gap-2 text-sm font-medium">
              <WarningCircle aria-hidden weight="fill" className="size-4" />
              {fileError}
            </p>
          ) : null}
          <div className="bg-primary-tint text-ink-muted rounded-xl p-4 text-sm">
            <p className="text-ink font-semibold">For a useful photo</p>
            <ul className="mt-1 list-disc pl-5">
              <li>Use daylight or a bright lamp, not a flash.</li>
              <li>Hold steady and keep the area in the middle.</li>
              <li>Take one close photo and one from further away.</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <div
            className={cn(
              "bg-line flex items-center justify-center overflow-hidden rounded-2xl",
              square ? "aspect-square" : "aspect-[4/3]",
            )}
          >
            {/* A local preview of the person's own file. next/image does not apply to a blob address. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="Preview of the photo you chose"
              onLoad={(e) => setQuality(checkQuality(e.currentTarget))}
              style={{ transform: `rotate(${rotation}deg)` }}
              className={cn(
                "max-h-full max-w-full object-contain transition-transform duration-200",
                square && "size-full object-cover",
              )}
            />
          </div>
          {quality ? (
            <p
              role="status"
              className={cn(
                "flex items-center gap-2 text-sm font-medium",
                quality.ok ? "text-success" : "text-warning",
              )}
            >
              {quality.ok ? (
                <CheckCircle aria-hidden weight="fill" className="size-5" />
              ) : (
                <Sun aria-hidden weight="fill" className="size-5" />
              )}
              {quality.text}
            </p>
          ) : null}
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" onClick={retake} disabled={busy}>
              <ArrowsClockwise aria-hidden className="size-5" />
              Retake
            </Button>
            <Button
              variant="secondary"
              onClick={() => setSquare((s) => !s)}
              aria-pressed={square}
              disabled={busy}
            >
              <Crop aria-hidden className="size-5" />
              Crop
            </Button>
            <Button
              variant="secondary"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              disabled={busy}
            >
              <ArrowClockwise aria-hidden className="size-5" />
              Rotate
            </Button>
          </div>

          <Field inputId={`${uid}-doc`} label="Send to">
            {({ describedBy }) => (
              <Select
                id={`${uid}-doc`}
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                disabled={busy}
                aria-describedby={describedBy}
              >
                {targets.map((t) => (
                  <option key={t.doctorId} value={t.doctorId}>
                    {t.doctorName}, {t.reason}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            inputId={`${uid}-note`}
            label="Describe the problem (optional)"
            error={noteError}
            hint="For example: pain and swelling on my right ankle since yesterday."
          >
            {({ describedBy, invalid }) => (
              <Textarea
                id={`${uid}-note`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                disabled={busy}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              />
            )}
          </Field>
          <p className="bg-success-soft text-success flex gap-2 rounded-xl p-3 text-sm">
            <LockKey aria-hidden className="mt-0.5 size-4 shrink-0" />
            This photo is added to your medical records and shared only with{" "}
            {doctor?.doctorName ?? "your doctor"}.
          </p>

          {stage ? (
            <div className="grid gap-2">
              <p aria-live="polite" className="text-sm font-medium">
                {stage.name === "uploading" ? "Uploading…" : "Checking the photo for viruses…"}
              </p>
              <div
                role="progressbar"
                aria-label="Upload progress"
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
          {result && !result.ok ? (
            <Notice tone="danger" title="Photo not saved">
              {result.reason}{" "}
              <Link href="/support" className="underline">
                Contact support
              </Link>{" "}
              if this keeps happening.
            </Notice>
          ) : null}
          <Button size="lg" loading={busy} onClick={() => void upload()}>
            Upload to {doctor?.doctorName.replace("Dr. ", "Dr. ") ?? "doctor"}
          </Button>
          <p className="text-ink-muted text-sm">
            Prototype: rotate and crop change only the preview here. The real version edits the file
            before it is sent.
          </p>
        </div>
      )}
    </div>
  );
}
