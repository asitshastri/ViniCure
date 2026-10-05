import { describe, expect, it } from "vitest";
import { emailContract } from "./contract";
import { EMAIL_TEMPLATE_KEYS, renderEmail } from "./email-templates";
import { SmtpEmailProvider } from "./smtp-email";
import { AdapterError } from "./types";

// SMTP email against a stand-in for the connection: the shared EmailProvider contract, what is
// sent, how failures are reported, and the templates. A real Mailpit round trip runs when
// SMTP_TEST_HOST is set (see the last block).
type Sent = { from: string; to: string; subject: string; text: string; html: string };

function standIn(fail?: unknown) {
  const sent: Sent[] = [];
  const transport = {
    sendMail: async (message: Sent) => {
      if (fail) throw fail;
      sent.push(message);
      return { messageId: `<msg-${sent.length}@test>` };
    },
  } as unknown as NonNullable<ConstructorParameters<typeof SmtpEmailProvider>[0]["transport"]>;
  return { sent, transport };
}
const make = (fail?: unknown) => {
  const s = standIn(fail);
  return {
    ...s,
    mail: new SmtpEmailProvider({
      host: "smtp.test",
      port: 1025,
      from: "ViniCure <no-reply@vinicure.example>",
      transport: s.transport,
    }),
  };
};
const invite = {
  to: "doc@example.com",
  templateKey: "staff_invitation",
  variables: { link: "https://vinicure.example/invite/abc123", role: "doctor", hours: "72" },
};

emailContract(() => make().mail);

describe("SmtpEmailProvider", () => {
  it("sends one message from the configured address with a subject, a text part and an HTML part", async () => {
    const { mail, sent } = make();
    const out = await mail.send(invite);
    expect(out.providerId).toBe("<msg-1@test>");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      from: "ViniCure <no-reply@vinicure.example>",
      to: "doc@example.com",
    });
    expect(sent[0]?.subject).toMatch(/invited/i);
    expect(sent[0]?.text).toContain("https://vinicure.example/invite/abc123");
    expect(sent[0]?.html).toContain('href="https://vinicure.example/invite/abc123"');
  });

  it("refuses a bad address, a blank or unknown template, a missing variable and an unsafe link, sending nothing", async () => {
    const { mail, sent } = make();
    for (const to of [
      "not-an-email",
      "a b@c.de",
      "x@y",
      "<a@b.cd>",
      "a@b.cd\r\nBcc: x@y.zz",
      `${"a".repeat(250)}@b.cd`,
    ]) {
      await expect(mail.send({ ...invite, to })).rejects.toMatchObject({ kind: "invalid_input" });
    }
    for (const templateKey of ["", " ", "unknown_template"]) {
      await expect(mail.send({ ...invite, templateKey })).rejects.toMatchObject({
        kind: "invalid_input",
      });
    }
    await expect(
      mail.send({ ...invite, variables: { link: invite.variables.link } }),
    ).rejects.toMatchObject({ kind: "invalid_input" });
    for (const link of [
      "javascript:alert(1)",
      "https://x.test/a b",
      'https://x.test/"><script>',
      "ftp://x.test/a",
    ]) {
      await expect(
        mail.send({ ...invite, variables: { ...invite.variables, link } }),
      ).rejects.toMatchObject({ kind: "invalid_input" });
    }
    expect(sent).toHaveLength(0);
  });

  it("reports an unreachable server as 'unavailable' and a refusal as 'rejected', without the address in the message", async () => {
    for (const [fail, kind] of [
      [
        Object.assign(new Error("connect ECONNREFUSED doc@example.com"), { code: "ECONNECTION" }),
        "unavailable",
      ],
      [Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }), "unavailable"],
      [Object.assign(new Error("535 bad login"), { code: "EAUTH", responseCode: 535 }), "rejected"],
      [
        Object.assign(new Error("550 no such user doc@example.com"), {
          code: "EENVELOPE",
          responseCode: 550,
        }),
        "rejected",
      ],
    ] as const) {
      const { mail } = make(fail);
      const e = (await mail.send(invite).catch((x: unknown) => x)) as AdapterError;
      expect(e).toBeInstanceOf(AdapterError);
      expect(e.kind).toBe(kind);
      expect(e.message).not.toContain("doc@example.com");
    }
  });

  it("needs a host and a from address, and a user only together with a password", () => {
    expect(() => new SmtpEmailProvider({ host: "", port: 25, from: "a@b.cd" })).toThrow(/host/);
    expect(() => new SmtpEmailProvider({ host: "h", port: 25, from: "" })).toThrow(/from/);
    expect(() => new SmtpEmailProvider({ host: "h", port: 25, from: "a@b.cd", user: "u" })).toThrow(
      /together/,
    );
  });
});

describe("email templates", () => {
  it("every template renders with its variables and escapes them in the HTML", () => {
    expect(EMAIL_TEMPLATE_KEYS.sort()).toEqual(["staff_invitation", "staff_password_reset"]);
    const email = renderEmail("staff_invitation", {
      link: "https://x.test/invite/a&b=1",
      role: "<script>alert(1)</script>",
      hours: "72",
    });
    expect(email).not.toBeNull();
    expect(email?.html).not.toContain("<script>");
    expect(email?.html).toContain("a&amp;b=1");
    const reset = renderEmail("staff_password_reset", {
      link: "https://x.test/reset?token=t",
      minutes: "30",
    });
    expect(reset?.subject).toMatch(/password/i);
    expect(reset?.text).toContain("30 minutes");
  });

  it("carries no patient or clinical words", () => {
    for (const key of EMAIL_TEMPLATE_KEYS) {
      const email = renderEmail(key, {
        link: "https://x.test/l",
        role: "doctor",
        hours: "72",
        minutes: "30",
      });
      expect(email?.text).not.toMatch(/prescription|diagnos|appointment|patient|medicine|symptom/i);
    }
  });
});

// A real round trip through Mailpit (the catch-all inbox started by docker compose).
describe.skipIf(!process.env.SMTP_TEST_HOST)("through Mailpit", () => {
  it("delivers the message and Mailpit shows it", async () => {
    const mail = new SmtpEmailProvider({
      host: process.env.SMTP_TEST_HOST as string,
      port: Number(process.env.SMTP_TEST_PORT ?? 1025),
      from: "ViniCure <no-reply@vinicure.example>",
    });
    const to = `smtp-test-${Date.now()}@example.com`;
    await mail.send({ ...invite, to });
    const base = process.env.MAILPIT_URL ?? "http://localhost:8025";
    const list = (await (
      await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)
    ).json()) as {
      messages: { Subject: string }[];
    };
    expect(list.messages).toHaveLength(1);
    expect(list.messages[0]?.Subject).toMatch(/invited/i);
  });
});
