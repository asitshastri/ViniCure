import { z } from "zod";

export const BREAK_GLASS_CATEGORIES = [
  { value: "ticket", label: "Fixing a support ticket" },
  { value: "record_error", label: "Checking a record error the patient reported" },
  { value: "safety", label: "Safety concern raised by the patient or doctor" },
  { value: "legal", label: "Legal or regulator request" },
] as const;

export const BREAK_GLASS_MINUTES = [15, 30] as const;

export const breakGlassForm = z.object({
  patientId: z.string().min(1, "Choose the patient."),
  category: z.enum(["ticket", "record_error", "safety", "legal"], {
    error: "Choose why you need access.",
  }),
  reason: z
    .string()
    .trim()
    .min(20, "Explain in at least 20 characters. An admin reads this.")
    .max(400, "Keep it under 400 characters."),
  ticket: z
    .string()
    .trim()
    .regex(/^(T-\d{3,6})?$/, "Use a ticket number like T-2039.")
    .optional(),
  minutes: z.union([z.literal(15), z.literal(30)], { error: "Choose how long you need." }),
  password: z.string().min(1, "Enter your password."),
  understood: z.literal(true, { error: "Confirm that you understand before continuing." }),
});
