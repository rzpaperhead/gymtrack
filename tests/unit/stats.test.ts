import { describe, expect, it } from "vitest";
import { movingAverage, setVolume, totalVolume, volumeByMuscle, weeklyConsistency, weeklyVolume } from "@/lib/calc/stats";
import { displayWeight, parseWeightInput } from "@/lib/calc/units";

const done = "2026-10-12T10:00:00+07:00";

describe("volume", () => {
  it("counts completed non-warm-up sets only", () => {
    expect(setVolume({ set_type: "working", weight_kg: 100, reps: 5, completed_at: done })).toBe(500);
    expect(setVolume({ set_type: "warmup", weight_kg: 100, reps: 5, completed_at: done })).toBe(0);
    expect(setVolume({ set_type: "working", weight_kg: 100, reps: 5, completed_at: null })).toBe(0);
    expect(
      totalVolume([
        { set_type: "working", weight_kg: 100, reps: 5, completed_at: done },
        { set_type: "drop", weight_kg: 50, reps: 10, completed_at: done },
      ]),
    ).toBe(1000);
  });

  it("buckets weekly volume by Monday-start weeks, oldest first", () => {
    const today = new Date("2026-10-14T12:00:00+07:00"); // Wednesday
    const res = weeklyVolume(
      [
        { set_type: "working", weight_kg: 100, reps: 5, completed_at: "2026-10-12T08:00:00+07:00" }, // this week (Mon)
        { set_type: "working", weight_kg: 100, reps: 1, completed_at: "2026-10-11T20:00:00+07:00" }, // last week (Sun)
      ],
      3,
      today,
    );
    expect(res).toEqual([
      { week: "2026-09-28", volume: 0 },
      { week: "2026-10-05", volume: 100 },
      { week: "2026-10-12", volume: 500 },
    ]);
  });

  it("attributes volume to the primary muscle", () => {
    const res = volumeByMuscle(
      [
        { exercise_id: "a", set_type: "working", weight_kg: 10, reps: 10, completed_at: done },
        { exercise_id: "b", set_type: "working", weight_kg: 20, reps: 5, completed_at: done },
      ],
      (id) => (id === "a" ? "chest" : "triceps"),
    );
    expect(res).toEqual({ chest: 100, triceps: 100 });
  });
});

describe("weeklyConsistency", () => {
  const today = new Date("2026-10-14T12:00:00+07:00");

  it("counts consecutive weeks meeting the target", () => {
    const dates = [
      "2026-09-29T08:00:00+07:00",
      "2026-10-01T08:00:00+07:00",
      "2026-10-03T08:00:00+07:00",
      "2026-10-06T08:00:00+07:00",
      "2026-10-08T08:00:00+07:00",
      "2026-10-10T08:00:00+07:00",
      "2026-10-13T08:00:00+07:00",
    ];
    const c = weeklyConsistency(dates, 3, today);
    expect(c.thisWeekCount).toBe(1);
    expect(c.currentStreak).toBe(2); // current week not met yet, but doesn't break the streak
    expect(c.bestStreak).toBe(2);
  });

  it("breaks the streak on a missed week", () => {
    const c = weeklyConsistency(["2026-09-29T08:00:00+07:00", "2026-10-13T08:00:00+07:00"], 1, today);
    expect(c.currentStreak).toBe(1);
    expect(c.bestStreak).toBe(1);
  });
});

describe("movingAverage", () => {
  it("averages over a 7 calendar day window", () => {
    const res = movingAverage([
      { date: "2026-10-01", value: 80 },
      { date: "2026-10-03", value: 82 },
      { date: "2026-10-07", value: 81 },
      { date: "2026-10-08", value: 79 }, // window 10-02..10-08 → 82, 81, 79
    ]);
    expect(res.map((r) => r.avg)).toEqual([80, 81, 81, 80.67]);
  });
});

describe("units", () => {
  it("round-trips lb input through kg storage", () => {
    const kg = parseWeightInput("225", "lb")!;
    expect(kg).toBeCloseTo(102.0583, 3);
    expect(displayWeight(kg, "lb")).toBe("225");
    expect(parseWeightInput("62,5", "kg")).toBe(62.5);
    expect(parseWeightInput("abc", "kg")).toBeNull();
  });
});
