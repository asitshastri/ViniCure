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
    languages: z.array(text(2, 30)).min(1).max(12),
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
