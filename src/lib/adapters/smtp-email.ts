import nodemailer from "nodemailer";
import { renderEmail } from "./email-templates";
import { AdapterError, type EmailProvider } from "./types";

// Email over SMTP (ported from ViniCare's `email.js`, which used Gmail), behind EmailProvider.
// One adapter covers every SMTP server: Mailpit on this computer (a catch-all inbox at
// http://localhost:8025), Gmail with an app password for testing, and the SES SMTP endpoint or any
// other service later.
//
// Failure behaviour:
//   - a bad address, an unknown template or a bad link -> invalid_input, nothing is sent;
//   - the server cannot be reached, is slow, or drops the connection -> unavailable;
//   - the server refuses the login or the recipient or the message -> rejected.
// The recipient, the link and the password are never logged and never put in an error message.

const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
const MAX_ADDRESS = 254;

export type SmtpConfig = {
  host: string;
  port: number;
  /** TLS from the first byte (port 465). Otherwise STARTTLS is used when the server offers it. */
  secure?: boolean;
  user?: string;
  password?: string;
  /** "ViniCure <no-reply@example.com>" */
  from: string;
  /** For tests: a stand-in for the SMTP connection. */
  transport?: Pick<ReturnType<typeof nodemailer.createTransport>, "sendMail">;
};

export class SmtpEmailProvider implements EmailProvider {
  private readonly transport: NonNullable<SmtpConfig["transport"]>;

  constructor(private readonly config: SmtpConfig) {
    if (!config.host || !config.from) throw new Error("SMTP needs a host and a from address");
    if ((config.user && !config.password) || (!config.user && config.password)) {
      throw new Error("SMTP_USER and SMTP_PASSWORD must be set together");
    }
    this.transport =
      config.transport ??
      nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure ?? config.port === 465,
        ...(config.user ? { auth: { user: config.user, pass: config.password } } : {}),
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 15_000,
        // Credentials only over TLS, except to a server on this computer (Mailpit has none).
        requireTLS: Boolean(config.user) && !(config.secure ?? config.port === 465),
      });
  }

  async send(input: {
    to: string;
    templateKey: string;
    variables: Record<string, string>;
  }): Promise<{ providerId: string }> {
    if (typeof input.to !== "string" || input.to.length > MAX_ADDRESS || !EMAIL.test(input.to)) {
      throw new AdapterError("invalid_input", "to must be an email address");
    }
    if (typeof input.templateKey !== "string" || input.templateKey.trim() === "") {
      throw new AdapterError("invalid_input", "templateKey is required");
    }
    const email = renderEmail(input.templateKey, input.variables);
    if (!email) throw new AdapterError("invalid_input", "unknown template or bad variables");

    try {
      const info = await this.transport.sendMail({
        from: this.config.from,
        to: input.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      return { providerId: String(info.messageId || "smtp") };
    } catch (cause) {
      const code = (cause as { code?: string }).code ?? "";
      const status = (cause as { responseCode?: number }).responseCode ?? 0;
      // Login or recipient refused, or a permanent 5xx answer: retrying cannot help.
      if (code === "EAUTH" || code === "EENVELOPE" || (status >= 500 && status < 600)) {
        throw new AdapterError("rejected", "the mail server refused the message", { cause });
      }
      throw new AdapterError("unavailable", "the mail server could not be reached", { cause });
    }
  }
}
