import { z } from "zod";
import type { AvailabilityDay } from "@/lib/types";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time.");

export const SLOT_LENGTHS = [15, 20, 30, 45] as const;

export const availabilityDaySchema = z
  .object({ enabled: z.boolean(), start: time, end: time })
  .refine((d) => !d.enabled || d.end > d.start, {
    message: "The end time must be after the start time.",
    path: ["end"],
  })
  .refine(
    (d) =>
      !d.enabled ||
      Number(d.end.slice(0, 2)) * 60 +
        Number(d.end.slice(3)) -
        Number(d.start.slice(0, 2)) * 60 -
        Number(d.start.slice(3)) >=
        30,
    {
      message: "Open for at least 30 minutes.",
      path: ["end"],
    },
  );

/** Errors per day id, or an empty object when every day is fine. */
export function checkAvailability(days: AvailabilityDay[]): Record<number, string> {
  const out: Record<number, string> = {};
  for (const d of days) {
    const r = availabilityDaySchema.safeParse(d);
    if (!r.success) out[d.day] = r.error.issues[0]?.message ?? "Check the times.";
  }
  return out;
}

export const timeOffForm = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the first day."),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the last day."),
    reason: z.string().trim().max(80, "Keep it under 80 characters."),
  })
  .refine((v) => v.to >= v.from, {
    message: "The last day cannot be before the first day.",
    path: ["to"],
  });

export function parseDoctorState(
  raw: string | undefined,
): "default" | "away" | "joinable" | "empty" {
  return raw === "away" || raw === "joinable" || raw === "empty" ? raw : "default";
}
