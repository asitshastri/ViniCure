import { describe, expect, it } from "vitest";
import { smsContract } from "./contract";
import { Msg91SmsProvider } from "./msg91";
import { AdapterError } from "./types";

// MSG91 against a stand-in for its HTTP API: the shared SmsProvider contract, then what goes over
// the wire and how each failure is reported.
const KEY = "test-auth-key-not-real"; // secret-scan:allow
type Call = { url: string; init: RequestInit; body: Record<string, unknown> };

function standIn(reply: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const call = { url, init, body: JSON.parse(String(init.body)) as Record<string, unknown> };
    calls.push(call);
    // A real fetch stops when its signal aborts; so does this one.
    return await new Promise<Response>((resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      Promise.resolve(reply(call)).then(resolve, reject);
    });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}
const ok = () =>
  new Response(JSON.stringify({ type: "success", message: "req_123" }), { status: 200 });
const make = (
  reply: (call: Call) => Response | Promise<Response> = ok,
  extra: Partial<ConstructorParameters<typeof Msg91SmsProvider>[0]> = {},
) => {
  const s = standIn(reply);
  return {
    ...s,
    sms: new Msg91SmsProvider({
      authKey: KEY,
      templates: { otp: "tpl_otp_1", booking: "tpl_book_1" },
      fetchImpl: s.fetchImpl,
      ...extra,
    }),
  };
};

smsContract(() => make().sms);

describe("Msg91SmsProvider", () => {
  it("posts the template id and the recipient to the Flow API with the auth key in a header", async () => {
    const { sms, calls } = make();
    const out = await sms.sendTemplate({
      to: "+919812345678",
      templateKey: "otp",
      variables: { code: "482913" },
    });
    expect(out.providerId).toBe("req_123");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://control.msg91.com/api/v5/flow");
    expect((calls[0]?.init.headers as Record<string, string>).authkey).toBe(KEY);
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.body).toEqual({
      template_id: "tpl_otp_1",
      short_url: "0",
      // Country code, no plus sign; our `code` is the template's `otp`.
      recipients: [{ mobiles: "919812345678", otp: "482913" }],
    });
    // The auth key is in a header only, never in the body or the address.
    expect(JSON.stringify(calls[0]?.body)).not.toContain(KEY);
    expect(calls[0]?.url).not.toContain(KEY);
  });

  it("passes other variables through under their own names, and a sender id only when one is set", async () => {
    const plain = make();
    await plain.sms.sendTemplate({
      to: "+919812345678",
      templateKey: "booking",
      variables: { name: "Asha", doctor: "Dr Rao" },
    });
    expect(plain.calls[0]?.body.recipients).toEqual([
      { mobiles: "919812345678", name: "Asha", doctor: "Dr Rao" },
    ]);
    expect(plain.calls[0]?.body).not.toHaveProperty("sender");
    const withSender = make(ok, { senderId: "VINICR" });
    await withSender.sms.sendTemplate({
      to: "+919812345678",
      templateKey: "otp",
      variables: { code: "1" },
    });
    expect(withSender.calls[0]?.body.sender).toBe("VINICR");
  });

  it("sends nothing for a bad number, a blank key or a key with no template", async () => {
    const { sms, calls } = make();
    for (const input of [
      { to: "9812345678", templateKey: "otp", variables: {} },
      { to: "+919812345678", templateKey: " ", variables: {} },
      { to: "+919812345678", templateKey: "unknown", variables: {} },
    ]) {
      await expect(sms.sendTemplate(input)).rejects.toMatchObject({ kind: "invalid_input" });
    }
    expect(calls).toHaveLength(0);
  });

  it("an unreachable or slow MSG91, and any 5xx, are 'unavailable'", async () => {
    const down = make(() => {
      throw new Error("ECONNRESET to 919812345678");
    });
    const e = (await down.sms
      .sendTemplate({ to: "+919812345678", templateKey: "otp", variables: { code: "1" } })
      .catch((x: unknown) => x)) as AdapterError;
    expect(e).toBeInstanceOf(AdapterError);
    expect(e.kind).toBe("unavailable");
    // The message never repeats the number.
    expect(e.message).not.toContain("9812345678");

    const busy = make(() => new Response("oops", { status: 503 }));
    await expect(
      busy.sms.sendTemplate({ to: "+919812345678", templateKey: "otp", variables: { code: "1" } }),
    ).rejects.toMatchObject({ kind: "unavailable" });

    const slow = make(() => new Promise<Response>(() => undefined), { timeoutMs: 30 });
    await expect(
      slow.sms.sendTemplate({ to: "+919812345678", templateKey: "otp", variables: { code: "1" } }),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("a refusal (bad key, template or balance) is 'rejected' and its words never reach the caller", async () => {
    for (const reply of [
      () =>
        new Response(JSON.stringify({ type: "error", message: "Invalid mobile 919812345678" }), {
          status: 200,
        }),
      () => new Response(JSON.stringify({ message: "Authentication failure" }), { status: 401 }),
      () => new Response("not json", { status: 400 }),
    ]) {
      const { sms } = make(reply);
      const e = (await sms
        .sendTemplate({ to: "+919812345678", templateKey: "otp", variables: { code: "1" } })
        .catch((x: unknown) => x)) as AdapterError;
      expect(e.kind).toBe("rejected");
      expect(e.message).not.toMatch(/9812345678|Invalid mobile|Authentication/);
    }
  });

  it("needs an auth key to start", () => {
    expect(() => new Msg91SmsProvider({ authKey: "", templates: {} })).toThrow(/auth key/);
  });
});
