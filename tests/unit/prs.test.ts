import { describe, expect, it } from "vitest";
import { computeRecords, detectNewPRs, type PRSet } from "@/lib/calc/prs";
import type { ExerciseType } from "@/lib/types";

const BENCH = "bench";
const PULLUP = "pullup";
const PLANK = "plank";
const types: Record<string, ExerciseType> = { [BENCH]: "weight_reps", [PULLUP]: "bodyweight_reps", [PLANK]: "time" };
const typeOf = (id: string) => types[id];

let seq = 0;
function set(p: Partial<PRSet> & { exercise_id: string; day: number }): PRSet {
  seq++;
  const { day, ...rest } = p;
  return {
    id: `s${seq}`,
    set_type: "working",
    weight_kg: null,
    reps: null,
    duration_sec: null,
    distance_m: null,
    completed_at: new Date(Date.UTC(2026, 0, day, 10, 0, seq % 60)).toISOString(),
    ...rest,
  };
}

describe("computeRecords", () => {
  it("finds heaviest weight, best e1RM, best set volume and reps per weight", () => {
    const sets = [
      set({ exercise_id: BENCH, day: 1, weight_kg: 100, reps: 5 }), // e1RM 116.7, vol 500
      set({ exercise_id: BENCH, day: 1, weight_kg: 60, reps: 15 }), // vol 900, no e1RM (>12)
      set({ exercise_id: BENCH, day: 2, weight_kg: 110, reps: 1 }), // heaviest, e1RM 110
    ];
    const recs = computeRecords(sets, typeOf);
    const get = (t: string, w?: number) => recs.find((r) => r.record_type === t && (w == null || r.weight_kg === w));
    expect(get("max_weight")?.value).toBe(110);
    expect(get("max_e1rm")?.value).toBe(116.7);
    expect(get("max_e1rm")?.set_id).toBe(sets[0].id);
    expect(get("max_set_volume")?.value).toBe(900);
    expect(get("max_reps_at_weight", 60)?.value).toBe(15);
    expect(get("max_reps_at_weight", 100)?.value).toBe(5);
  });

  it("ignores warm-ups and unfinished sets", () => {
    const recs = computeRecords(
      [
        set({ exercise_id: BENCH, day: 1, weight_kg: 200, reps: 3, set_type: "warmup" }),
        set({ exercise_id: BENCH, day: 1, weight_kg: 300, reps: 3, completed_at: null }),
        set({ exercise_id: BENCH, day: 1, weight_kg: 80, reps: 5 }),
      ],
      typeOf,
    );
    expect(recs.find((r) => r.record_type === "max_weight")?.value).toBe(80);
  });

  it("keeps the earliest set on a tie", () => {
    const a = set({ exercise_id: BENCH, day: 1, weight_kg: 100, reps: 5 });
    const b = set({ exercise_id: BENCH, day: 2, weight_kg: 100, reps: 5 });
    const recs = computeRecords([b, a], typeOf);
    expect(recs.find((r) => r.record_type === "max_weight")?.set_id).toBe(a.id);
  });

  it("uses reps / duration for non-weighted exercise types", () => {
    const recs = computeRecords(
      [
        set({ exercise_id: PULLUP, day: 1, reps: 8 }),
        set({ exercise_id: PULLUP, day: 2, reps: 11 }),
        set({ exercise_id: PLANK, day: 1, duration_sec: 75 }),
      ],
      typeOf,
    );
    expect(recs.find((r) => r.exercise_id === PULLUP)).toMatchObject({ record_type: "max_reps", value: 11 });
    expect(recs.find((r) => r.exercise_id === PLANK)).toMatchObject({ record_type: "max_duration", value: 75 });
    expect(recs.some((r) => r.exercise_id === PULLUP && r.record_type === "max_e1rm")).toBe(false);
  });
});

describe("detectNewPRs", () => {
  const history = [
    set({ exercise_id: BENCH, day: 1, weight_kg: 100, reps: 5 }),
    set({ exercise_id: BENCH, day: 1, weight_kg: 90, reps: 8 }),
  ];

  it("reports a heavier weight and better e1RM, once per record type", () => {
    const session = [
      set({ exercise_id: BENCH, day: 8, weight_kg: 102.5, reps: 5 }),
      set({ exercise_id: BENCH, day: 8, weight_kg: 105, reps: 3 }),
    ];
    const prs = detectNewPRs(history, session, typeOf);
    const kinds = prs.map((p) => p.record_type).sort();
    expect(kinds).toEqual(["max_e1rm", "max_weight"]);
    expect(prs.find((p) => p.record_type === "max_weight")?.value).toBe(105);
    expect(prs.find((p) => p.record_type === "max_e1rm")?.value).toBe(119.6); // 102.5 × 7/6
  });

  it("reports more reps at a previously used weight", () => {
    const prs = detectNewPRs(history, [set({ exercise_id: BENCH, day: 8, weight_kg: 90, reps: 9 })], typeOf);
    expect(prs.find((p) => p.record_type === "max_reps_at_weight")).toMatchObject({ value: 9, weight_kg: 90 });
  });

  it("does not report anything when only matching the previous best", () => {
    const prs = detectNewPRs(history, [set({ exercise_id: BENCH, day: 8, weight_kg: 100, reps: 5 })], typeOf);
    expect(prs).toEqual([]);
  });

  it("does not report reps-at-weight for a weight never lifted before", () => {
    const prs = detectNewPRs(history, [set({ exercise_id: BENCH, day: 8, weight_kg: 95, reps: 6 })], typeOf);
    expect(prs.map((p) => p.record_type)).not.toContain("max_reps_at_weight");
  });

  it("treats a first-ever session as a baseline, not a PR", () => {
    const prs = detectNewPRs(history, [set({ exercise_id: PULLUP, day: 8, reps: 10 })], typeOf);
    expect(prs).toEqual([]);
  });

  it("ignores warm-up sets in the session", () => {
    const prs = detectNewPRs(
      history,
      [set({ exercise_id: BENCH, day: 8, weight_kg: 150, reps: 1, set_type: "warmup" })],
      typeOf,
    );
    expect(prs).toEqual([]);
  });
});
