import { z } from "zod";
import type { RecordType } from "@/lib/types";

export const RECORD_TYPES: Array<{ id: RecordType; label: string; image: boolean }> = [
  { id: "injury", label: "Injury photos", image: true },
  { id: "prescriptions", label: "Prescriptions", image: false },
  { id: "reports", label: "Reports", image: false },
  { id: "xray", label: "X-rays", image: true },
  { id: "mri", label: "MRI", image: true },
  { id: "ct", label: "CT scans", image: true },
  { id: "other", label: "Other documents", image: false },
];

export const typeLabel = (t: RecordType) =>
  RECORD_TYPES.find((r) => r.id === t)?.label ?? "Other documents";

export const MAX_MB = 10;
export const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,.webp";

/** Quick checks in the browser, for a faster answer. The server checks type, size and content again and scans for viruses. */
export function validateFile(file: {
  name: string;
  size: number;
  type: string;
}): string | undefined {
  if (!ACCEPTED.includes(file.type)) return "Use a PDF, JPG, PNG or WebP file.";
  if (file.size > MAX_MB * 1024 * 1024)
    return `This file is over ${MAX_MB} MB. Choose a smaller one or reduce its size.`;
  if (file.size === 0) return "This file is empty.";
  return undefined;
}

export const uploadForm = z.object({
  type: z.enum(["injury", "prescriptions", "reports", "xray", "mri", "ct", "other"], {
    error: "Choose what this file is.",
  }),
  title: z
    .string()
    .trim()
    .min(2, "Give it a short name.")
    .max(80, "Keep the name under 80 characters."),
});

export const photoNote = z.string().trim().max(300, "Keep the note under 300 characters.");

export const shareForm = z.object({
  doctorId: z.string().min(1, "Choose a doctor."),
  duration: z.enum(["consult", "7d", "30d"], { error: "Choose how long." }),
});

const FILTER_IDS = ["all", ...RECORD_TYPES.map((r) => r.id)] as const;
export type RecordFilter = (typeof FILTER_IDS)[number];

/** Reads the URL. Unknown values are dropped. */
export function parseRecordQuery(raw: Record<string, string | string[] | undefined>): {
  type: RecordFilter;
  q: string;
} {
  const first = (k: string) => (Array.isArray(raw[k]) ? raw[k]?.[0] : raw[k]);
  const t = first("type");
  const type = (FILTER_IDS as readonly string[]).includes(t ?? "") ? (t as RecordFilter) : "all";
  const q = (first("q") ?? "").slice(0, 80).trim();
  return { type, q };
}
