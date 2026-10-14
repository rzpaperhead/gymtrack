import { describe, expect, it } from "vitest";
import { suggestNext } from "@/lib/coach";
import type { WorkoutSet } from "@/lib/types";

const bench = { type: "weight_reps" as const, primary_muscle: "chest" as const, equipment: "barbell" as const };
const squat = { type: "weight_reps" as const, primary_muscle: "quads" as const, equipment: "barbell" as const };

const sets = (weight: number, reps: number[]): WorkoutSet[] =>
  reps.map((r, i) => ({
    id: `s${i}`,
    user_id: "u",
    workout_id: "w",
    workout_exercise_id: "we",
    position: i,
    set_type: "working",
    weight_kg: weight,
    reps: r,
    rpe: null,
    duration_sec: null,
    distance_m: null,
    completed_at: "2026-10-10T10:00:00Z",
    updated_at: "",
    deleted_at: null,
  }));

describe("suggestNext (double progression)", () => {
  it("adds weight when every set reached the top of the range", () => {
    expect(suggestNext(bench, [sets(60, [12, 12, 12])], [8, 12], "kg")).toEqual({ kind: "increase", weight_kg: 62.5, reps: 8 });
    expect(suggestNext(squat, [sets(100, [12, 12, 12])], [8, 12], "kg")).toMatchObject({ kind: "increase", weight_kg: 105 });
  });

  it("asks for one more rep inside the range", () => {
    expect(suggestNext(bench, [sets(60, [10, 9, 9])], [8, 12], "kg")).toEqual({ kind: "more_reps", weight_kg: 60, reps: 11 });
  });

  it("repeats the weight when a set fell short once", () => {
    expect(suggestNext(bench, [sets(60, [8, 7, 6])], [8, 12], "kg")).toEqual({ kind: "repeat", weight_kg: 60, reps: 8 });
  });

  it("deloads ~10% after two short sessions in a row", () => {
    expect(suggestNext(bench, [sets(60, [7, 6, 6]), sets(60, [7, 7, 6])], [8, 12], "kg")).toEqual({ kind: "deload", weight_kg: 55, reps: 8 });
  });

  it("has nothing to say without history or for non-weighted moves", () => {
    expect(suggestNext(bench, [], [8, 12], "kg")).toBeNull();
    expect(suggestNext({ ...bench, type: "time" }, [sets(60, [12])], [8, 12], "kg")).toBeNull();
  });
});
