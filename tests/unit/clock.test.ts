import { describe, expect, it } from "vitest";

import { FixedClock, SystemClock } from "@/server/infra/clock";

describe("relógio injectável (RNF-16, G.10)", () => {
  it("SystemClock devolve o instante actual (UTC)", () => {
    const before = Date.now() - 5;
    const now = new SystemClock().now();
    const after = Date.now() + 5;
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
  });

  it("FixedClock devolve sempre o mesmo instante, sem partilhar a referência", () => {
    const clock = new FixedClock(new Date("2027-03-15T10:00:00Z"));
    const a = clock.now();
    const b = clock.now();
    expect(a.toISOString()).toBe("2027-03-15T10:00:00.000Z");
    expect(a).not.toBe(b);
  });
});