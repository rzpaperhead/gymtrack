/**
 * Structured, model-friendly summary of a user's training over a date range.
 * Not wired to any LLM yet (BRIEF §8) — this is the seam a future AI coach
 * will read from. Pure function over plain rows so it can run on the client
 * (from IndexedDB) or on the server (from Postgres) unchanged.
 */
import { computeRecords, detectNewPRs, type PRSet } from "@/lib/calc/prs";
import { epley1RM } from "@/lib/calc/one-rm";
import { setVolume, weeklyConsistency } from "@/lib/calc/stats";
import type { BodyMetric, Exercise, NutritionLog, Profile, Workout, WorkoutExercise, WorkoutSet } from "@/lib/types";

export interface TrainingData {
  profile: Pick<Profile, "goal" | "weekly_target" | "unit"> | null;
  exercises: Pick<Exercise, "id" | "name_en" | "primary_muscle" | "type">[];
  workouts: Workout[];
  workoutExercises: WorkoutExercise[];
  sets: WorkoutSet[];
  bodyMetrics: BodyMetric[];
  nutrition: NutritionLog[];
}

export interface TrainingSummary {
  range: { from: string; to: string };
  goal: string | null;
  sessions: { count: number; weeklyTarget: number | null; currentStreakWeeks: number; avgDurationMin: number | null };
  volume: { totalKg: number; byMuscle: Record<string, number> };
  exercises: {
    name: string;
    muscle: string;
    sessions: number;
    workingSets: number;
    bestE1rmKg: number | null;
    e1rmTrend: { date: string; e1rmKg: number }[];
    avgRpe: number | null;
  }[];
  newRecords: { exercise: string; type: string; value: number }[];
  bodyweight: { startKg: number | null; endKg: number | null };
  nutrition: { daysLogged: number; avgCalories: number | null; avgProteinG: number | null };
}

const inRange = (iso: string, from: Date, to: Date) => {
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t <= to.getTime();
};

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function getTrainingSummary(data: TrainingData, range: { from: Date; to: Date }): TrainingSummary {
  const { from, to } = range;
  const exById = new Map(data.exercises.map((e) => [e.id, e]));
  const completed = data.workouts.filter((w) => !w.deleted_at && w.status === "completed");
  const inWindow = completed.filter((w) => inRange(w.started_at, from, to));
  const windowIds = new Set(inWindow.map((w) => w.id));
  const weById = new Map(data.workoutExercises.filter((we) => !we.deleted_at).map((we) => [we.id, we]));
  const startedAt = new Map(completed.map((w) => [w.id, w.started_at]));

  type JoinedSet = PRSet & Pick<WorkoutSet, "workout_id" | "rpe">;
  const toPR = (s: WorkoutSet): JoinedSet | null => {
    const we = weById.get(s.workout_exercise_id);
    if (!we || s.deleted_at || !startedAt.has(s.workout_id)) return null;
    return { ...s, exercise_id: we.exercise_id };
  };
  const all = data.sets.map(toPR).filter((s): s is JoinedSet => !!s);
  const windowSets = all.filter((s) => windowIds.has(s.workout_id));
  const before = all.filter((s) => s.completed_at && new Date(s.completed_at) < from);
  const typeOf = (id: string) => exById.get(id)?.type;

  const byMuscle: Record<string, number> = {};
  let totalKg = 0;
  for (const s of windowSets) {
    const v = setVolume(s);
    totalKg += v;
    const m = exById.get(s.exercise_id)?.primary_muscle ?? "other";
    if (v) byMuscle[m] = Math.round((byMuscle[m] ?? 0) + v);
  }

  const perExercise = new Map<string, JoinedSet[]>();
  for (const s of windowSets) perExercise.set(s.exercise_id, [...(perExercise.get(s.exercise_id) ?? []), s]);

  const exercises = [...perExercise.entries()].map(([id, sets]) => {
    const ex = exById.get(id);
    const working = sets.filter((s) => s.completed_at && s.set_type !== "warmup");
    const byDay = new Map<string, number>();
    for (const s of working) {
      const e = epley1RM(s.weight_kg, s.reps);
      if (e == null) continue;
      const d = s.completed_at!.slice(0, 10);
      byDay.set(d, Math.max(byDay.get(d) ?? 0, e));
    }
    const rpes = working.map((x) => x.rpe).filter((r): r is number => r != null);
    const best = computeRecords(working, typeOf).find((r) => r.record_type === "max_e1rm");
    return {
      name: ex?.name_en ?? id,
      muscle: ex?.primary_muscle ?? "other",
      sessions: new Set(working.map((x) => x.workout_id)).size,
      workingSets: working.length,
      bestE1rmKg: best?.value ?? null,
      e1rmTrend: [...byDay.entries()].sort().map(([date, e1rmKg]) => ({ date, e1rmKg })),
      avgRpe: avg(rpes),
    };
  });

  const newRecords = detectNewPRs(before, windowSets, typeOf).map((r) => ({
    exercise: exById.get(r.exercise_id)?.name_en ?? r.exercise_id,
    type: r.record_type,
    value: r.value,
  }));

  const weights = data.bodyMetrics
    .filter((b) => !b.deleted_at && b.weight_kg != null && inRange(`${b.date}T12:00:00`, from, to))
    .sort((a, b) => a.date.localeCompare(b.date));
  const nutri = data.nutrition.filter((n) => !n.deleted_at && inRange(`${n.date}T12:00:00`, from, to));
  const durations = inWindow
    .filter((w) => w.ended_at)
    .map((w) => (new Date(w.ended_at!).getTime() - new Date(w.started_at).getTime()) / 60000);

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    goal: data.profile?.goal ?? null,
    sessions: {
      count: inWindow.length,
      weeklyTarget: data.profile?.weekly_target ?? null,
      currentStreakWeeks: weeklyConsistency(completed.map((w) => w.started_at), data.profile?.weekly_target ?? 3, to).currentStreak,
      avgDurationMin: avg(durations),
    },
    volume: { totalKg: Math.round(totalKg), byMuscle },
    exercises: exercises.sort((a, b) => b.workingSets - a.workingSets),
    newRecords,
    bodyweight: { startKg: weights[0]?.weight_kg ?? null, endKg: weights[weights.length - 1]?.weight_kg ?? null },
    nutrition: {
      daysLogged: nutri.length,
      avgCalories: avg(nutri.map((n) => n.calories).filter((x): x is number => x != null)),
      avgProteinG: avg(nutri.map((n) => n.protein_g).filter((x): x is number => x != null)),
    },
  };
}
