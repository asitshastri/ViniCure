import { z } from "zod";

// Input and output shapes for the doctor application and KYC pipeline (P4-02). Inputs are
// strict, so a client cannot set status, kyc_status, platform fee or user_id. Outputs are
// allow-lists.

export const KYC_DOC_TYPES = [
  "registration_certificate",
  "degree_certificate",
  "photo_id",
  "photo",
] as const;
/** A doctor cannot be approved without an accepted document of each of these types. */
export const REQUIRED_KYC_DOC_TYPES = ["registration_certificate", "photo_id"] as const;
export const MAX_KYC_DOCUMENTS = 10;
export const MAX_PER_DOC_TYPE = 3;

/** Fee limits in paise. NOT VERIFIED: the limits are a proposal (TODO.md, Questions). */
export const FEE_MIN_PAISE = 10_000;
export const FEE_MAX_PAISE = 500_000;

const CONTROL = /\p{Cc}/u;
const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !CONTROL.test(v), "Remove special characters.");

/** One spelling per language ("hindi", "HINDI" and "Hindi" are the same), so filters match. */
export const normaliseLanguage = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

export const applicationBody = z
  .object({
    displayName: text(2, 100).regex(
      /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u,
      "Use letters, spaces, dots, apostrophes and hyphens only.",
    ),
    registrationNo: text(3, 40).regex(
      /^[A-Za-z0-9/\- ]+$/,
      "Use letters, numbers, slash and dash.",
    ),
    registrationCouncil: text(2, 120),
    qualifications: text(2, 300),
    languages: z
      .array(text(2, 30))
      .min(1)
      .max(12)
      .transform((list) => [...new Set(list.map(normaliseLanguage))]),
    specialtyId: z.number().int().min(1).max(32767),
    consultationFeePaise: z.number().int().min(FEE_MIN_PAISE).max(FEE_MAX_PAISE),
  })
  .strict();
export type ApplicationBody = z.infer<typeof applicationBody>;

export const uploadSlotBody = z
  .object({
    docType: z.enum(KYC_DOC_TYPES),
    contentType: z.string().min(3).max(100),
    sizeBytes: z
      .number()
      .int()
      .min(1)
      .max(100 * 1024 * 1024),
  })
  .strict();

export const idParams = z.object({ id: z.uuid() }).strict();

export const reviewDocumentBody = z
  .object({
    decision: z.enum(["approve", "reject"]),
    note: text(3, 300).optional(),
  })
  .strict()
  .refine((v) => v.decision === "approve" || v.note !== undefined, {
    message: "Say why the document is not accepted.",
    path: ["note"],
  });

export const DOCTOR_DECISIONS = ["approve", "reject", "suspend", "reinstate"] as const;
export const doctorDecisionBody = z
  .object({
    decision: z.enum(DOCTOR_DECISIONS),
    note: text(3, 300).optional(),
  })
  .strict()
  .refine((v) => v.decision === "approve" || v.decision === "reinstate" || v.note !== undefined, {
    message: "Say why.",
    path: ["note"],
  });

export const adminDoctorsQuery = z
  .object({
    status: z.enum(["pending", "active", "suspended"]).optional(),
    kycStatus: z.enum(["pending", "approved", "rejected"]).optional(),
    cursor: z.string().min(1).max(200).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export type DocumentView = {
  id: string;
  docType: (typeof KYC_DOC_TYPES)[number];
  /** Where the document is in the pipeline, in the doctor's words. */
  state:
    | "waiting_for_upload"
    | "checking"
    | "rejected_virus"
    | "check_failed"
    | "waiting_for_review"
    | "accepted"
    | "not_accepted";
  note: string | null;
  createdAt: string;
};

export type ApplicationView = {
  id: string;
  displayName: string;
  registrationNo: string;
  registrationCouncil: string;
  qualifications: string;
  languages: string[];
  specialtyId: number | null;
  consultationFeePaise: number;
  kycStatus: "pending" | "approved" | "rejected";
  status: "pending" | "active" | "suspended";
  note: string | null;
  documents: DocumentView[];
  createdAt: string;
};

// ---- public directory (P4-03) ----

/** Sort orders a visitor may ask for. Anything else is refused, never put into SQL. */
export const PUBLIC_SORTS = ["name", "fee_asc", "fee_desc"] as const;
export type PublicSort = (typeof PUBLIC_SORTS)[number];

const flag = z.enum(["true", "false"]).transform((v) => v === "true");

export const publicDoctorsQuery = z
  .object({
    q: text(2, 60).optional(),
    specialtyId: z.coerce.number().int().min(1).max(32767).optional(),
    language: text(2, 30).transform(normaliseLanguage).optional(),
    feeMin: z.coerce.number().int().min(0).max(FEE_MAX_PAISE).optional(),
    feeMax: z.coerce.number().int().min(0).max(FEE_MAX_PAISE).optional(),
    availableToday: flag.optional(),
    sort: z.enum(PUBLIC_SORTS).default("name"),
    cursor: z.string().min(1).max(300).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict()
  .refine((v) => v.feeMin === undefined || v.feeMax === undefined || v.feeMin <= v.feeMax, {
    message: "The lowest fee is above the highest.",
    path: ["feeMin"],
  });
export type PublicDoctorsQuery = z.infer<typeof publicDoctorsQuery>;

/** What a visitor sees. An allow-list: no contact details, no account, no review notes. */
export type PublicDoctorView = {
  id: string;
  displayName: string;
  registrationNo: string;
  registrationCouncil: string;
  qualifications: string;
  languages: string[];
  specialty: { id: number; name: string } | null;
  consultationFeePaise: number;
  /** Has working hours left today (India time) and is not on leave for the whole day. */
  availableToday: boolean;
};

export type SpecialtyView = { id: number; name: string; doctorCount: number };
