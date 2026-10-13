import { describe, expect, it } from "vitest";
import { epley1RM, E1RM_MAX_REPS } from "@/lib/calc/one-rm";

describe("epley1RM", () => {
  it("applies w × (1 + reps/30)", () => {
    expect(epley1RM(100, 5)).toBe(116.7); // 100 × 1.1667
    expect(epley1RM(60, 8)).toBe(76); // 60 × 1.2667
    expect(epley1RM(80, 10)).toBe(106.7);
    expect(epley1RM(100, 12)).toBe(140);
  });

  it("returns the weight itself for a single rep", () => {
    expect(epley1RM(140, 1)).toBe(140);
  });

  it("ignores sets above the rep cap", () => {
    expect(E1RM_MAX_REPS).toBe(12);
    expect(epley1RM(50, 13)).toBeNull();
    expect(epley1RM(50, 30)).toBeNull();
  });

  it("rejects missing or non-positive input", () => {
    expect(epley1RM(null, 5)).toBeNull();
    expect(epley1RM(100, null)).toBeNull();
    expect(epley1RM(0, 5)).toBeNull();
    expect(epley1RM(100, 0)).toBeNull();
    expect(epley1RM(-5, 5)).toBeNull();
    expect(epley1RM(Number.NaN, 5)).toBeNull();
  });
});
