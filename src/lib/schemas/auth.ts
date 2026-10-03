import { z } from "zod";

// Client-side checks for experience only. The server enforces the same rules later (P2).

export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, ""))
  .pipe(
    z
      .string()
      .regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number that starts with 6, 7, 8 or 9."),
  );

export const otpSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code.");

export const nameSchema = z
  .string()
  .trim()
  .min(2, "Enter your full name.")
  .max(80, "Name can be at most 80 characters.");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."));

export const backupCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]{4}-[a-z0-9]{4}$/, "Enter the backup code as 8 characters, like ab12-cd34.");

export const strongPasswordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128, "Use at most 128 characters.")
  .regex(/[a-z]/, "Add a lowercase letter.")
  .regex(/[A-Z]/, "Add an uppercase letter.")
  .regex(/\d/, "Add a number.")
  .regex(/[^A-Za-z0-9]/, "Add a symbol, like ! or #.");

export const patientPhoneForm = z.object({ phone: phoneSchema });

export const patientRegisterForm = z.object({
  name: nameSchema,
  phone: phoneSchema,
  consent: z.literal(true, "Agree to continue."),
});

export const staffSignInForm = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export const forgotPasswordForm = z.object({ email: emailSchema });

const passwordPair = z
  .object({ password: strongPasswordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    message: "The two passwords do not match.",
    path: ["confirm"],
  });

export const resetPasswordForm = passwordPair;

export const changePasswordForm = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    password: strongPasswordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "The two passwords do not match.",
    path: ["confirm"],
  })
  .refine((v) => v.password !== v.current, {
    message: "Choose a password you have not used here before.",
    path: ["password"],
  });

export const doctorApplyForm = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  registrationNumber: z
    .string()
    .trim()
    .min(4, "Enter your medical council registration number.")
    .max(30, "That number is too long."),
});

/** Flatten Zod issues to one message per field, first issue wins. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
