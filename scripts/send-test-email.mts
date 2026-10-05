import { loadConfig } from "../src/lib/config/config";
import { SmtpEmailProvider } from "../src/lib/adapters/smtp-email";

// Local check of the email settings: sends ONE test message (the staff invitation template, with a
// link that goes nowhere) to the address you give, using SMTP_* and EMAIL_FROM from .env.local.
//   pnpm mail:test you@gmail.com
// Prints whether it worked, never the password.
const to = process.argv[2];
if (!to) {
  console.error("Usage: pnpm mail:test you@gmail.com");
  process.exit(1);
}
const config = loadConfig(process.env);
if (!config.SMTP_HOST || !config.EMAIL_FROM) {
  console.error("SMTP_HOST and EMAIL_FROM are not set in .env.local");
  process.exit(1);
}
const mail = new SmtpEmailProvider({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT ?? 587,
  ...(config.SMTP_SECURE !== undefined ? { secure: config.SMTP_SECURE } : {}),
  ...(config.SMTP_USER ? { user: config.SMTP_USER, password: config.SMTP_PASSWORD } : {}),
  from: config.EMAIL_FROM,
});
console.log(
  `Sending through ${config.SMTP_HOST}:${config.SMTP_PORT ?? 587} as ${config.SMTP_USER ?? "(no login)"} ...`,
);
try {
  const { providerId } = await mail.send({
    to,
    templateKey: "staff_invitation",
    variables: { link: "https://example.com/this-is-only-a-test", role: "doctor", hours: "72" },
  });
  console.log(`Sent. Check the inbox (and the spam folder) of ${to}. Message id: ${providerId}`);
} catch (error) {
  const kind = (error as { kind?: string }).kind ?? "error";
  const cause = (error as { cause?: { code?: string; response?: string } }).cause;
  console.error(`Failed (${kind}${cause?.code ? `, ${cause.code}` : ""}).`);
  if (cause?.code === "EAUTH") {
    console.error(
      "The login was refused: check SMTP_USER and that SMTP_PASSWORD is a Gmail APP password, not your normal one.",
    );
  }
  process.exitCode = 1;
}
