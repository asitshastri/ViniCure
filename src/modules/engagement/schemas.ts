import { z } from "zod";

// Reviews and favorites (P4-10). Inputs are strict; outputs are allow-lists. A review comment is
// public once published, so it is plain text only (no control characters) and is never rendered
// as HTML. Reviewers are never named in public.

const CONTROL = /[\p{Cc}]/u;
const comment = z
  .string()
  .trim()
  .min(3)
  .max(1000)
  .refine((v) => !CONTROL.test(v.replace(/[\n\r\t]/g, " ")), "Remove special characters.");

export const reviewBody = z
  .object({ rating: z.number().int().min(1).max(5), comment: comment.optional() })
  .strict();

export const idParams = z.object({ id: z.uuid() }).strict();

export const pageQuery = z
  .object({
    cursor: z.string().min(1).max(200).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const moderationQuery = pageQuery.extend({
  status: z.enum(["pending", "published", "hidden"]).default("pending"),
});

export const moderateBody = z.object({ decision: z.enum(["publish", "hide"]) }).strict();

export const favoriteBody = z.object({ patientId: z.uuid(), doctorId: z.uuid() }).strict();
export const favoriteQuery = z.object({ patientId: z.uuid() }).strict();

export const MAX_FAVORITES = 50;

export type PublicReviewView = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
};
export type OwnReviewView = PublicReviewView & { status: "pending" | "published" | "hidden" };
export type ModerationReviewView = OwnReviewView & { doctorId: string; appointmentId: string };
