import { z } from "zod";
import { emailSchema, nameSchema, phoneSchema } from "./auth";

export const LANGUAGES = [
  "English",
  "Hindi",
  "Marathi",
  "Gujarati",
  "Tamil",
  "Telugu",
  "Kannada",
  "Malayalam",
  "Bengali",
  "Punjabi",
  "Urdu",
] as const;
export const EMERGENCY_RELATIONS = [
  "Spouse",
  "Parent",
  "Child",
  "Sibling",
  "Friend",
  "Other",
] as const;

const today = () => new Date().toISOString().slice(0, 10);

export const personalForm = z.object({
  name: nameSchema,
  email: z.union([z.literal(""), emailSchema]),
  dob: z
    .string()
    .refine(
      (v) => v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && v <= today() && v >= "1900-01-01"),
      "Enter a valid date of birth that is not in the future.",
    ),
  sex: z.enum(["", "female", "male", "other"]),
  language: z.enum(LANGUAGES, { error: "Choose a language." }),
});

export const emergencyForm = z.object({
  name: nameSchema,
  relation: z.enum(EMERGENCY_RELATIONS, { error: "Choose how they are related to you." }),
  phone: phoneSchema,
});

export const tagSchema = z
  .string()
  .trim()
  .min(2, "Write at least 2 letters.")
  .max(60, "Keep it under 60 characters.")
  .regex(/^[\p{L}\p{N} .,'()/+-]+$/u, "Use letters, numbers and simple punctuation only.");

export const medicineForm = z.object({
  name: tagSchema,
  dose: z.string().trim().max(60, "Keep it under 60 characters."),
});

const num = (min: number, max: number, label: string) =>
  z
    .union([
      z.literal(""),
      z.coerce
        .number()
        .min(min, `${label} looks too low. Check the number.`)
        .max(max, `${label} looks too high. Check the number.`),
    ])
    .transform((v) => (v === "" ? undefined : v));

export const vitalsForm = z
  .object({
    sys: num(70, 250, "Upper pressure"),
    dia: num(40, 150, "Lower pressure"),
    pulse: num(30, 220, "Pulse"),
    spo2: num(70, 100, "Oxygen level"),
    temp: num(34, 42, "Temperature"),
    weight: num(2, 300, "Weight"),
    sugar: num(20, 600, "Blood sugar"),
    note: z.string().trim().max(200, "Keep the note under 200 characters."),
  })
  .refine(
    (v) => [v.sys, v.dia, v.pulse, v.spo2, v.temp, v.weight, v.sugar].some((x) => x !== undefined),
    {
      message: "Enter at least one reading.",
      path: ["form"],
    },
  )
  .refine((v) => (v.sys === undefined) === (v.dia === undefined), {
    message: "Enter both pressure numbers, or neither.",
    path: ["dia"],
  });

export const deleteConfirm = z.object({
  phrase: z.literal("DELETE", { error: "Type DELETE in capital letters to confirm." }),
});
