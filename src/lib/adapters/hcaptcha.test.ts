import { describe, expect, it, vi } from "vitest";
import { HCaptchaVerifier } from "./hcaptcha";
import { AdapterError } from "./types";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("HCaptchaVerifier", () => {
  it("posts the secret, token and address as a form and reads success", async () => {
    const fetchImpl = vi.fn(async () => json({ success: true }));
    const verifier = new HCaptchaVerifier({ secret: "s3cret", siteKey: "site", fetchImpl });
    expect(await verifier.verify({ token: "tok", ip: "203.0.113.9" })).toEqual({ success: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.hcaptcha.com/siteverify");
    const form = new URLSearchParams(String(init.body));
    expect(form.get("secret")).toBe("s3cret");
    expect(form.get("response")).toBe("tok");
    expect(form.get("remoteip")).toBe("203.0.113.9");
    expect(form.get("sitekey")).toBe("site");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("does not send an unknown address", async () => {
    const fetchImpl = vi.fn(async () => json({ success: true }));
    await new HCaptchaVerifier({ secret: "x", fetchImpl }).verify({ token: "t", ip: "unknown" });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(new URLSearchParams(String(init.body)).has("remoteip")).toBe(false);
  });

  it("returns success false when hCaptcha rejects the token", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ success: false, "error-codes": ["invalid-input-response"] }),
    );
    expect(await new HCaptchaVerifier({ secret: "x", fetchImpl }).verify({ token: "t" })).toEqual({
      success: false,
    });
  });

  it.each([
    ["a network error", () => Promise.reject(new TypeError("boom"))],
    ["a 500", async () => json({}, 500)],
    ["unreadable JSON", async () => new Response("<html>", { status: 200 })],
  ])("fails as unavailable on %s, without echoing the secret", async (_name, impl) => {
    const verifier = new HCaptchaVerifier({ secret: "s3cret", fetchImpl: impl as typeof fetch });
    const error = await verifier.verify({ token: "t" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).kind).toBe("unavailable");
    expect((error as AdapterError).message).not.toContain("s3cret");
  });

  it("rejects an empty or oversized token without calling out", async () => {
    const fetchImpl = vi.fn();
    const verifier = new HCaptchaVerifier({
      secret: "x",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(verifier.verify({ token: "" })).rejects.toMatchObject({ kind: "invalid_input" });
    await expect(verifier.verify({ token: "a".repeat(5000) })).rejects.toMatchObject({
      kind: "invalid_input",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
