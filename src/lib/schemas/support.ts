import { z } from "zod";
import { emailSchema, nameSchema, phoneSchema } from "./auth";

const contact = z
  .string()
  .trim()
  .min(1, "Tell us how to reach you.")
  .refine((v) => emailSchema.safeParse(v).success || phoneSchema.safeParse(v).success, {
    message: "Enter a valid email address or a 10-digit mobile number.",
  });

export const supportForm = z.object({
  name: nameSchema,
  contact,
  topic: z.enum(["booking", "payment", "technical", "records", "doctor", "other"], {
    error: "Choose what this is about.",
  }),
  booking: z
    .string()
    .trim()
    .max(20, "That booking number is too long.")
    .regex(/^[A-Za-z0-9-]*$/, "Use letters, numbers and dashes only.")
    .optional(),
  message: z
    .string()
    .trim()
    .min(10, "Write at least a sentence so we can help.")
    .max(1000, "Keep it under 1000 characters."),
});
