import { z } from "zod";

export const CANCEL_REASONS = [
  { id: "conflict", label: "I have a clash with another plan" },
  { id: "better", label: "I am feeling better" },
  { id: "doctor", label: "I want to see a different doctor" },
  { id: "other", label: "Another reason" },
] as const;

export const cancelForm = z
  .object({
    reason: z.enum(["conflict", "better", "doctor", "other"], { error: "Choose a reason." }),
    note: z.string().trim().max(300, "Keep it under 300 characters."),
  })
  .refine((v) => v.reason !== "other" || v.note.length >= 3, {
    message: "Tell us a little more.",
    path: ["note"],
  });

export const reviewForm = z.object({
  rating: z.number({ error: "Choose a star rating." }).int().min(1, "Choose a star rating.").max(5),
  comment: z.string().trim().max(500, "Keep it under 500 characters."),
});
