import { describe, expect, it } from "vitest";
import { UUID_PATTERN, uuidv7 } from "./ids";

describe("uuidv7", () => {
  it("is a valid version 7 UUID", () => {
    const id = uuidv7();
    expect(id).toMatch(UUID_PATTERN);
    expect(id[14]).toBe("7");
    expect("89ab").toContain(id[19]);
  });

  it("embeds the time and sorts by creation time", () => {
    const earlier = uuidv7(1_700_000_000_000);
    const later = uuidv7(1_700_000_000_001);
    expect(earlier < later).toBe(true);
    expect(parseInt(earlier.replace(/-/g, "").slice(0, 12), 16)).toBe(1_700_000_000_000);
  });

  it("does not repeat", () => {
    expect(new Set(Array.from({ length: 1000 }, () => uuidv7())).size).toBe(1000);
  });
});
