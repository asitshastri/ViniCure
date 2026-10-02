import { z } from "zod";

// Client-side validation is for experience only. The server enforces the same schemas (P2).

/** Indian mobile number, 10 digits starting 6 to 9. The +91 prefix is shown, not typed. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number.");

export const otpSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code.");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."));

/** Staff password policy: 12+ characters, mixed, not trivially weak. Final rules confirmed in P2. */
export const staffPasswordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128, "Use at most 128 characters.")
  .regex(/[a-z]/, "Add a lowercase letter.")
  .regex(/[A-Z]/, "Add an uppercase letter.")
  .regex(/\d/, "Add a number.")
  .regex(/[^A-Za-z0-9]/, "Add a symbol.");

export const totpSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your app.");

export const backupCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/, "Backup codes look like ABCD-1234.");

export const patientSignUpSchema = z.object({
  phone: phoneSchema,
  fullName: z.string().trim().min(2, "Enter your name.").max(100),
  consent: z.literal(true, { error: "You need to agree to continue." }),
});

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    next: staffPasswordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { path: ["confirm"], message: "Passwords do not match." })
  .refine((v) => v.next !== v.current, {
    path: ["next"],
    message: "Choose a password you have not used here before.",
  });

/** Returns the first error message per field, for display next to each input. */
export function fieldErrors(result: {
  success: boolean;
  error?: z.ZodError;
}): Record<string, string> {
  if (result.success || !result.error) return {};
  const out: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
