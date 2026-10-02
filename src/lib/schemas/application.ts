import { z } from "zod";
import { nameSchema } from "./auth";

const thisYear = 2026;

export const qualificationSchema = z.object({
  degree: z
    .string()
    .trim()
    .min(2, "Enter the degree, for example MBBS.")
    .max(60, "Keep it under 60 characters."),
  college: z
    .string()
    .trim()
    .min(2, "Enter the college or university.")
    .max(80, "Keep it under 80 characters."),
  year: z
    .string()
    .regex(/^(19[5-9]\d|20[0-2]\d)$/, "Enter the year you finished, like 2009.")
    .refine((y) => Number(y) <= thisYear, "That year is in the future."),
});

export const detailsSchema = z.object({
  name: nameSchema,
  registrationNumber: z
    .string()
    .trim()
    .min(4, "Enter your medical council registration number.")
    .max(30, "That number is too long.")
    .regex(/^[A-Za-z0-9/\- ]+$/, "Use letters, numbers, slash and dash only."),
  council: z.string().min(1, "Choose your medical council."),
  registrationYear: z
    .string()
    .regex(/^(19[5-9]\d|20[0-2]\d)$/, "Enter the year you were registered, like 2011.")
    .refine((y) => Number(y) <= thisYear, "That year is in the future."),
  specialty: z.string().min(1, "Choose your specialty."),
  experienceYears: z
    .string()
    .regex(/^\d{1,2}$/, "Enter whole years, for example 8.")
    .refine((y) => Number(y) <= 60, "Enter a number up to 60."),
  languages: z.array(z.string()).min(1, "Choose at least one language."),
  feeRupees: z
    .string()
    .regex(/^\d{2,5}$/, "Enter the fee in rupees, for example 499.")
    .refine(
      (v) => Number(v) >= 100 && Number(v) <= 5000,
      "Choose a fee between ₹100 and ₹5,000. [Limits to be confirmed.]",
    ),
  bio: z.string().trim().max(500, "Keep it under 500 characters."),
  qualifications: z.array(z.unknown()).min(1, "Add at least one qualification."),
});

export const declarationSchema = z.object({
  truthful: z.literal(true, "Confirm that your information is true."),
  verify: z.literal(true, "Agree to the registration check."),
});
