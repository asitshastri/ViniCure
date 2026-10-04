import { describe, expect, it } from "vitest";
import { assessRisk, type RiskInput } from "./risk";

const now = new Date("2026-10-04T10:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

const calm: RiskInput = {
  now,
  knownDevice: true,
  brandNewAccount: false,
  lastActiveAt: daysAgo(2),
  phoneVerifiedAt: daysAgo(2),
  phoneChangedAt: null,
  forceStepUpAt: null,
};

describe("risk-based step-up", () => {
  it("a known device, recent use and a settled number is low risk", () => {
    expect(assessRisk(calm)).toEqual({ high: false, reasons: [] });
  });

  it("a new device is high risk", () => {
    expect(assessRisk({ ...calm, knownDevice: false })).toEqual({
      high: true,
      reasons: ["new_device"],
    });
  });

  it("90 days of silence is high risk; 89 days is not", () => {
    expect(assessRisk({ ...calm, lastActiveAt: daysAgo(90) }).reasons).toContain("long_idle");
    expect(assessRisk({ ...calm, lastActiveAt: daysAgo(89) }).high).toBe(false);
  });

  it("a phone last proven 180 days ago is high risk; 179 days is not", () => {
    expect(assessRisk({ ...calm, phoneVerifiedAt: daysAgo(180) }).reasons).toContain("stale_phone");
    expect(assessRisk({ ...calm, phoneVerifiedAt: daysAgo(179) }).high).toBe(false);
  });

  it("a number changed in the last 30 days is high risk; 30 days ago is not", () => {
    expect(assessRisk({ ...calm, phoneChangedAt: daysAgo(29) }).reasons).toContain(
      "number_changed",
    );
    expect(assessRisk({ ...calm, phoneChangedAt: daysAgo(30) }).high).toBe(false);
  });

  it("a 'not me' flag is high risk until cleared", () => {
    expect(assessRisk({ ...calm, forceStepUpAt: daysAgo(1) }).reasons).toEqual(["flagged"]);
  });

  it("reports every reason at once", () => {
    const risky = assessRisk({
      ...calm,
      knownDevice: false,
      lastActiveAt: daysAgo(200),
      phoneVerifiedAt: daysAgo(200),
      phoneChangedAt: daysAgo(1),
      forceStepUpAt: daysAgo(1),
    });
    expect(risky.reasons).toEqual([
      "new_device",
      "long_idle",
      "stale_phone",
      "number_changed",
      "flagged",
    ]);
  });

  it("a brand-new account is never high risk, whatever else is true", () => {
    expect(
      assessRisk({
        ...calm,
        brandNewAccount: true,
        knownDevice: false,
        lastActiveAt: null,
        phoneVerifiedAt: null,
      }),
    ).toEqual({ high: false, reasons: [] });
  });

  it("an account with no recorded activity yet is not treated as idle", () => {
    expect(assessRisk({ ...calm, lastActiveAt: null, phoneVerifiedAt: null }).high).toBe(false);
  });
});
