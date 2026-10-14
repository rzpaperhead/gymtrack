import { describe, expect, it } from "vitest";
import { computeBadges, estimateCalories, summarizePeriod, type TrainingData } from "@/lib/achievements";
import { BUILTIN_EXERCISES, EX } from "@/lib/exercises/seed-data";
import type { Workout, WorkoutExercise, WorkoutSet } from "@/lib/types";

const byId = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]));

function session(id: string, start: string, minutes: number, exId: string, lifts: [number, number][]): {
  w: Workout;
  we: WorkoutExercise;
  sets: WorkoutSet[];
} {
  const end = new Date(Date.parse(start) + minutes * 60000).toISOString();
  const base = { user_id: "u", updated_at: start, deleted_at: null };
  return {
    w: { ...base, id, template_id: null, name: null, started_at: start, ended_at: end, notes: null, status: "completed" },
    we: { ...base, id: `${id}-we`, workout_id: id, exercise_id: exId, position: 0, notes: null, superset_group: null, rest_sec: null },
    sets: lifts.map(([kg, reps], i) => ({
      ...base,
      id: `${id}-s${i}`,
      workout_id: id,
      workout_exercise_id: `${id}-we`,
      position: i,
      set_type: "working",
      weight_kg: kg,
      reps,
      rpe: null,
      duration_sec: null,
      distance_m: null,
      completed_at: end,
    })),
  };
}

function data(...ss: ReturnType<typeof session>[]): TrainingData {
  return {
    workouts: ss.map((s) => s.w),
    workoutExercises: ss.map((s) => s.we),
    sets: ss.flatMap((s) => s.sets),
    exercise: (id) => byId.get(id),
  };
}

describe("calories (MET)", () => {
  it("uses MET 5 for strength: 60 min at 80 kg ≈ 400 kcal", () => {
    expect(estimateCalories(3600, 80)).toBe(400);
  });
  it("counts cardio time at MET 8", () => {
    expect(estimateCalories(3600, 80, { cardioSec: 1800 })).toBe(520); // 80×(5×0.5 + 8×0.5)
  });
});

describe("summarizePeriod", () => {
  it("totals a week and counts PRs against earlier history", () => {
    const d = data(
      session("w1", "2026-10-01T08:00:00+07:00", 60, EX(1), [[100, 5]]),
      session("w2", "2026-10-06T08:00:00+07:00", 50, EX(1), [[105, 5], [100, 5]]),
    );
    const s = summarizePeriod(d, new Date("2026-10-05T00:00:00+07:00"), new Date("2026-10-12T00:00:00+07:00"), 80);
    expect(s.sessions).toBe(1);
    expect(s.volumeKg).toBe(1025);
    expect(s.sets).toBe(2);
    expect(s.prs).toBeGreaterThanOrEqual(1);
    expect(s.topExerciseId).toBe(EX(1));
    expect(s.calories).toBeGreaterThan(0);
  });
});

describe("badges", () => {
  it("awards first workout and big-lift badges with progress", () => {
    const d = data(session("w1", "2026-10-01T06:00:00+07:00", 60, EX(1), [[100, 1]]));
    const badges = Object.fromEntries(computeBadges(d, 3).map((b) => [b.key, b]));
    expect(badges.first_workout.earned).toBe(true);
    expect(badges.bench_100.earned).toBe(true);
    expect(badges.sessions_10).toMatchObject({ earned: false, current: 1, target: 10 });
    expect(badges.early_bird.current).toBe(1);
  });
});

describe("summarizePeriod PRs within the same week", () => {
  it("counts a PR even when the baseline session is in the same week", () => {
    const d = data(
      session("a", "2026-10-06T08:00:00+07:00", 60, EX(1), [[100, 5]]),
      session("b", "2026-10-08T08:00:00+07:00", 60, EX(1), [[105, 5]]),
    );
    const s = summarizePeriod(d, new Date("2026-10-05T00:00:00+07:00"), new Date("2026-10-12T00:00:00+07:00"), 80);
    expect(s.prs).toBeGreaterThanOrEqual(2); // e1RM + heaviest weight (+ set volume)
  });
});
