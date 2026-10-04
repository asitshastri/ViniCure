import { z } from "zod";
import { istDate, istMidnight, minutesOfDay } from "./slots";

// A doctor's weekly hours and time off (P4-08). Hours are India wall-clock times, weekday 0 is
// Sunday. Everything is checked here and again by the database (non-overlap, whole slots).

export const SLOT_LENGTHS = [10, 15, 20, 30, 45, 60] as const;
export const MAX_RULES = 28;
export const MAX_TIME_OFF_DAYS = 90;
export const MAX_FUTURE_TIME_OFF = 50;

const clock = z.string().regex(/^\d{2}:\d{2}$/, "Use the format HH:MM.");

export const hoursBody = z
  .object({
    rules: z
      .array(
        z
          .object({
            weekday: z.number().int().min(0).max(6),
            startTime: clock,
            endTime: clock,
            slotMinutes: z
              .number()
              .int()
              .refine(
                (n) => (SLOT_LENGTHS as readonly number[]).includes(n),
                "Choose a consultation length from the list.",
              ),
          })
          .strict(),
      )
      .max(MAX_RULES),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen: { weekday: number; from: number; to: number }[] = [];
    value.rules.forEach((rule, i) => {
      const from = minutesOfDay(rule.startTime);
      const to = minutesOfDay(rule.endTime);
      const path = ["rules", i, "endTime"];
      if (from === null || to === null || to <= from) {
        ctx.addIssue({ code: "custom", path, message: "The end must be after the start." });
        return;
      }
      if ((to - from) % rule.slotMinutes !== 0) {
        ctx.addIssue({
          code: "custom",
          path,
          message: "The hours must fit a whole number of consultations.",
        });
        return;
      }
      if (seen.some((s) => s.weekday === rule.weekday && from < s.to && to > s.from)) {
        ctx.addIssue({
          code: "custom",
          path,
          message: "Two time windows on one day cannot overlap.",
        });
      }
      seen.push({ weekday: rule.weekday, from, to });
    });
  });
export type HoursBody = z.infer<typeof hoursBody>;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.");

export const timeOffBody = z
  .object({
    from: day,
    to: day,
    reason: z.string().trim().max(200).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const a = istMidnight(v.from);
    const b = istMidnight(v.to);
    if (!a) ctx.addIssue({ code: "custom", path: ["from"], message: "Enter a real date." });
    if (!b) ctx.addIssue({ code: "custom", path: ["to"], message: "Enter a real date." });
    if (a && b) {
      if (b < a)
        ctx.addIssue({
          code: "custom",
          path: ["to"],
          message: "The last day is before the first day.",
        });
      else if ((b.getTime() - a.getTime()) / 86_400_000 + 1 > MAX_TIME_OFF_DAYS) {
        ctx.addIssue({
          code: "custom",
          path: ["to"],
          message: `Time off can be at most ${MAX_TIME_OFF_DAYS} days at once.`,
        });
      }
    }
  });
export type TimeOffBody = z.infer<typeof timeOffBody>;

export const idParams = z.object({ id: z.uuid() }).strict();

export type HoursView = {
  rules: { weekday: number; startTime: string; endTime: string; slotMinutes: number }[];
};
export type TimeOffView = { id: string; from: string; to: string; reason: string | null };

export const today = (now: Date = new Date()) => istDate(now);
