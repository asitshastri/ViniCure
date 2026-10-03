import { describe, expect, it } from "vitest";
import { REDACTED } from "../logging/redact";
import { scrubBreadcrumb, scrubEvent, scrubText, scrubUrl, sentryBaseOptions } from "./scrub";

const event = {
  message: "Login failed for asha@example.com from +91 98123 45678 with Bearer abcdef123456",
  server_name: "ip-10-0-0-12",
  request: {
    method: "POST",
    url: "https://vinicure.example/api/v1/otp?phone=%2B919812345678&token=abc#frag",
    headers: {
      Cookie: "session=abc",
      Authorization: "Bearer xyz123456789",
      "User-Agent": "Mozilla/5.0",
      "X-Forwarded-For": "203.0.113.9",
      "Content-Type": "application/json",
    },
    cookies: { session: "abc" },
    data: { phone: "+919812345678", otp: "123456" },
    query_string: "phone=%2B919812345678",
  },
  user: { id: "u-1", email: "asha@example.com", username: "asha", ip_address: "203.0.113.9" },
  extra: { phone: "+919812345678", note_enc: "v1:x", detail: "call 9812345678 now", count: 3 },
  contexts: { patient: { name: "Asha", id: "p-1" } },
  tags: { email: "asha@example.com", route: "/api/v1/otp" },
  exception: { values: [{ type: "Error", value: "Cannot send to asha@example.com" }] },
  breadcrumbs: [
    {
      message: "fetch +919812345678",
      data: { url: "https://vinicure.example/x?token=abc", otp: "1" },
    },
  ],
};

describe("scrubEvent", () => {
  const out = scrubEvent(event) as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- test inspects arbitrary shape
  const text = JSON.stringify(out);

  it("removes phone numbers, emails, tokens and cookies from the whole event", () => {
    for (const secret of [
      "asha@example.com",
      "9812345678",
      "98123 45678",
      "abcdef123456",
      "xyz123456789",
      "session=abc",
      "123456",
      "203.0.113.9",
      "token=abc",
      "ip-10-0-0-12",
      "v1:x",
      "Asha",
    ]) {
      expect(text, secret).not.toContain(secret);
    }
  });

  it("keeps what helps debugging: method, path, safe headers, internal ids, counts", () => {
    expect(out.request.method).toBe("POST");
    expect(out.request.url).toBe("https://vinicure.example/api/v1/otp");
    expect(out.request.headers).toEqual({
      "User-Agent": "Mozilla/5.0",
      "Content-Type": "application/json",
    });
    expect(out.user).toEqual({ id: "u-1" });
    expect(out.extra.count).toBe(3);
    expect(out.contexts.patient.id).toBe("p-1");
    expect(out.tags.route).toBe("/api/v1/otp");
    expect(out.exception.values[0].type).toBe("Error");
  });

  it("drops the request body, cookies and query string", () => {
    expect(out.request.data).toBeUndefined();
    expect(out.request.cookies).toBeUndefined();
    expect(out.request.query_string).toBeUndefined();
  });

  it("removes the user entirely when there is no internal id", () => {
    const anonymous = scrubEvent({ user: { email: "a@b.in" } }) as { user?: unknown };
    expect(anonymous.user).toBeUndefined();
  });

  it("does not change the original event", () => {
    expect(event.request.headers.Cookie).toBe("session=abc");
  });
});

describe("helpers", () => {
  it("scrubText masks phone, email and bearer tokens but not ordinary text or UUIDs", () => {
    expect(scrubText("mail a@b.in or call 09812345678")).toBe(
      `mail ${REDACTED} or call ${REDACTED}`,
    );
    expect(scrubText("Bearer abcdefghij")).toBe(REDACTED);
    expect(scrubText("request 6a0cd667-6579-4724-a5af-1234 failed")).toContain("request");
  });

  it("scrubUrl removes query and fragment", () => {
    expect(scrubUrl("/a/b?x=1#y")).toBe("/a/b");
    expect(scrubUrl("/a/b")).toBe("/a/b");
  });

  it("scrubBreadcrumb cleans message, data and urls", () => {
    const crumb = scrubBreadcrumb({
      message: "to +919812345678",
      data: { to: "/p?token=1", otp: "9" },
    }) as {
      message: string;
      data: Record<string, string>;
    };
    expect(crumb.message).not.toContain("9812345678");
    expect(crumb.data.to).toBe("/p");
    expect(crumb.data.otp).toBe(REDACTED);
  });

  it("base options never send default PII and always scrub", () => {
    const options = sentryBaseOptions("https://k@o0.ingest.sentry.io/1", "staging");
    expect(options.sendDefaultPii).toBe(false);
    expect(options.beforeSend).toBe(scrubEvent);
    expect(options.environment).toBe("staging");
  });
});
