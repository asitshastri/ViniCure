import { z } from "zod";

// Input and output shapes for patient profiles (P2-09). Inputs are strict (unknown fields are
// refused, so a client cannot set is_minor or account_user_id). Outputs are allow-lists.

export const RELATIONS = ["self", "spouse", "child", "parent", "sibling", "other"] as const;
export const GENDERS = ["female", "male", "other", "undisclosed"] as const;
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export const MAX_PROFILES_PER_ACCOUNT = 10;

const CONTROL = /\p{Cc}/u;

const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !CONTROL.test(v), "Remove special characters.");

export const fullNameSchema = text(2, 100).regex(
  /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u,
  "Use letters, spaces, dots, apostrophes and hyphens only.",
);

/** A real calendar date, not in the future, after 1900. */
export const dobSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Enter a real date.")
  .refine((value) => value >= "1900-01-01", "Enter a real date.")
  .refine(
    (value) => value <= new Date().toISOString().slice(0, 10),
    "The date cannot be in the future.",
  );

const fields = {
  relation: z.enum(RELATIONS),
  fullName: fullNameSchema,
  dob: dobSchema,
  gender: z.enum(GENDERS),
  addressLine: text(2, 200).nullable(),
  city: text(2, 80).nullable(),
  state: text(2, 80).nullable(),
  pincode: z
    .string()
    .regex(/^[1-9]\d{5}$/, "Enter a 6 digit PIN code.")
    .nullable(),
  bloodGroup: z.enum(BLOOD_GROUPS).nullable(),
};

export const createPatientBody = z
  .object({
    relation: fields.relation,
    fullName: fields.fullName,
    dob: fields.dob,
    gender: fields.gender,
    addressLine: fields.addressLine.optional(),
    city: fields.city.optional(),
    state: fields.state.optional(),
    pincode: fields.pincode.optional(),
    bloodGroup: fields.bloodGroup.optional(),
  })
  .strict();

export const updatePatientBody = z
  .object({
    relation: fields.relation.optional(),
    fullName: fields.fullName.optional(),
    dob: fields.dob.optional(),
    gender: fields.gender.optional(),
    addressLine: fields.addressLine.optional(),
    city: fields.city.optional(),
    state: fields.state.optional(),
    pincode: fields.pincode.optional(),
    bloodGroup: fields.bloodGroup.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Send at least one field to change.");

export const patientIdParams = z.object({ id: z.uuid() }).strict();

export type CreatePatient = z.output<typeof createPatientBody>;
export type UpdatePatient = z.output<typeof updatePatientBody>;

/** What the API returns. Never the account id or deletion time. */
export type PatientView = {
  id: string;
  relation: (typeof RELATIONS)[number];
  fullName: string;
  dob: string;
  gender: (typeof GENDERS)[number];
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  bloodGroup: (typeof BLOOD_GROUPS)[number] | null;
  /** Worked out from the date of birth at the time of the request. */
  isMinor: boolean;
  createdAt: string;
};
