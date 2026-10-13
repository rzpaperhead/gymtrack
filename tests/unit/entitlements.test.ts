import { describe, expect, it } from "vitest";
import { canCreate, entitlementsFor, tierOf } from "@/lib/entitlements";

describe("entitlements", () => {
  const now = new Date("2026-10-13T00:00:00Z");

  it("derives tier from subscription state", () => {
    expect(tierOf(null, now)).toBe("free");
    expect(tierOf({ tier: "premium", status: "active", current_period_end: "2026-11-13T00:00:00Z" }, now)).toBe("premium");
    expect(tierOf({ tier: "premium", status: "canceled", current_period_end: "2026-11-13T00:00:00Z" }, now)).toBe("premium");
    expect(tierOf({ tier: "premium", status: "active", current_period_end: "2026-10-01T00:00:00Z" }, now)).toBe("free");
    expect(tierOf({ tier: "premium", status: "expired", current_period_end: null }, now)).toBe("free");
  });

  it("applies the free limits from the brief", () => {
    const free = entitlementsFor("free");
    expect(canCreate(free, "templates", 2)).toBe(true);
    expect(canCreate(free, "templates", 3)).toBe(false);
    expect(canCreate(free, "exercises", 5)).toBe(false);
    expect(canCreate(free, "photos", 5)).toBe(true);
    expect(canCreate(free, "photos", 6)).toBe(false);
    expect(free.csvExport).toBe(false);
    expect(free.customPrograms).toBe(false);
    expect(free.chartHistoryDays).toBe(90);
    expect(free.charts.has("volume_muscle")).toBe(false);
  });

  it("premium is unlimited", () => {
    const p = entitlementsFor("premium");
    expect(canCreate(p, "templates", 1000)).toBe(true);
    expect(p.csvExport).toBe(true);
    expect(p.charts.has("volume_muscle")).toBe(true);
  });
});
