import { describe, expect, it } from "vitest";
import { computeRecovery } from "@/lib/recovery";
import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from "@/lib/types";

const H = 3_600_000;
const NOW = Date.parse("2026-10-14T12:00:00Z");
const ex = new Map<string, Pick<Exercise, "primary_muscle" | "secondary_muscles" | "category">>([
  ["bench", { primary_muscle: "chest", secondary_muscles: ["triceps", "shoulders"], category: "strength" }],
  ["curl", { primary_muscle: "biceps", secondary_muscles: [], category: "strength" }],
  ["stretch", { primary_muscle: "quads", secondary_muscles: [], category: "cooldown" }],
]);

function session(id: string, hoursAgo: number, items: [string, number][]) {
  const end = new Date(NOW - hoursAgo * H).toISOString();
  const workouts: Workout[] = [
    { id, user_id: "u", template_id: null, name: null, started_at: end, ended_at: end, notes: null, status: "completed", updated_at: "", deleted_at: null },
  ];
  const workoutExercises: WorkoutExercise[] = [];
  const sets: WorkoutSet[] = [];
  items.forEach(([exId, n], i) => {
    const weId = `${id}-we${i}`;
    workoutExercises.push({ id: weId, user_id: "u", workout_id: id, exercise_id: exId, position: i, notes: null, superset_group: null, rest_sec: null, updated_at: "", deleted_at: null });
    for (let k = 0; k < n; k++)
      sets.push({
        id: `${weId}-s${k}`,
        user_id: "u",
        workout_id: id,
        workout_exercise_id: weId,
        position: k,
        set_type: "working",
        weight_kg: 60,
        reps: 10,
        rpe: null,
        duration_sec: null,
        distance_m: null,
        completed_at: end,
        updated_at: "",
        deleted_at: null,
      });
  });
  return { workouts, workoutExercises, sets };
}

describe("computeRecovery", () => {
  it("marks a just-trained muscle fatigued and secondaries less so", () => {
    const r = computeRecovery(session("w1", 2, [["bench", 6]]), ex, NOW);
    expect(r.chest.level).toBe("fatigued");
    expect(r.triceps.fatigue).toBeLessThan(r.chest.fatigue);
    expect(r.quads.level).toBe("fresh");
    expect(r.chest.readyAt).toBeGreaterThan(NOW);
  });

  it("recovers over time (big muscles slower than small)", () => {
    const r = computeRecovery(session("w1", 50, [["bench", 6], ["curl", 6]]), ex, NOW);
    expect(r.biceps.level).toBe("fresh");
    expect(r.chest.level).not.toBe("fresh");
    expect(computeRecovery(session("w1", 80, [["bench", 6]]), ex, NOW).chest.level).toBe("fresh");
  });

  it("ignores warm-up / cool-down movements but remembers last trained", () => {
    const r = computeRecovery(session("w1", 1, [["stretch", 3]]), ex, NOW);
    expect(r.quads.fatigue).toBe(0);
    expect(r.quads.lastTrainedAt).toBeNull();
    expect(computeRecovery(session("w1", 300, [["curl", 3]]), ex, NOW).biceps.lastTrainedAt).toBe(NOW - 300 * H);
  });
});
