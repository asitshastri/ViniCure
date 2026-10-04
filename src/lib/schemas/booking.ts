import { z } from "zod";

export const RELATIONS = ["Spouse", "Parent", "Child", "Sibling", "Other"] as const;

export const reasonSchema = z
  .string()
  .trim()
  .min(5, "Tell the doctor briefly what you need help with, at least a few words.")
  .max(500, "Keep it under 500 characters. You can share more during the call.");

export const newPersonSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter their full name.")
    .max(80, "Name can be at most 80 characters."),
  age: z.coerce
    .number({ error: "Enter their age in years." })
    .int("Enter a whole number.")
    .min(0, "Enter their age in years.")
    .max(120, "Enter a valid age."),
  relation: z.enum(RELATIONS, { error: "Choose how they are related to you." }),
});

export const bookingDetailsSchema = z.object({
  reason: reasonSchema,
  consent: z.literal(true, "Agree to continue."),
});

export const upiSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/, "Enter a UPI ID like name@bank.");

/** Your own details, asked once before the first booking. Same limits as the profile API. */
export const selfProfileForm = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter your full name.")
    .max(100, "Name can be at most 100 characters.")
    .regex(
      /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u,
      "Use letters, spaces, dots, apostrophes and hyphens only.",
    ),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.")
    .refine((v) => {
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, "Enter a real date.")
    .refine((v) => v >= "1900-01-01", "Enter a real date.")
    .refine((v) => v <= new Date().toISOString().slice(0, 10), "The date cannot be in the future."),
  gender: z.enum(["female", "male", "other", "undisclosed"], { error: "Choose an option." }),
});
