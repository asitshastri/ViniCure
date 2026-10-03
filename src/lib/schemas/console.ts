import { z } from "zod";

export const notesSchema = z.string().max(4000, "Notes can be up to 4000 characters.");

export const rxLineSchema = z.object({
  strength: z.string().min(1, "Choose a strength."),
  days: z
    .number({ error: "Enter the number of days." })
    .int()
    .min(1, "At least 1 day.")
    .max(90, "At most 90 days."),
  note: z.string().max(120, "Keep the instruction under 120 characters."),
  freq: z
    .object({ morning: z.boolean(), afternoon: z.boolean(), night: z.boolean(), sos: z.boolean() })
    .refine((f) => f.morning || f.afternoon || f.night || f.sos, {
      message: "Choose when to take it.",
    }),
});

export const rxForm = z.object({
  diagnosis: z
    .string()
    .trim()
    .min(3, "Write the diagnosis or main problem.")
    .max(160, "Keep the diagnosis under 160 characters."),
  advice: z.string().max(500, "Keep the advice under 500 characters."),
  followUpDays: z.number().int().min(0).max(60),
  lines: z.array(z.unknown()).min(1, "Add at least one medicine."),
});
