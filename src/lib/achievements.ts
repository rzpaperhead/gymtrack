/**
 * Badges, calorie estimates and period summaries. Pure functions over local
 * training data so they work offline and are easy to test.
 */
import { detectNewPRs, type PRSet } from "@/lib/calc/prs";
import { setVolume, weeklyConsistency } from "@/lib/calc/stats";
import { EX } from "@/lib/exercises/seed-data";
import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from "@/lib/types";

export interface TrainingData {
  workouts: Workout[]; // completed only
  workoutExercises: WorkoutExercise[];
  sets: WorkoutSet[];
  exercise: (id: string) => Exercise | undefined;
}

// ---------------------------------------------------------------------------
// Calories (MET method): kcal = MET × body weight (kg) × hours
// ---------------------------------------------------------------------------
export const MET = { strength: 5, cardio: 8, warmup: 3.5 } as const;

export function estimateCalories(
  durationSec: number,
  bodyweightKg: number,
  parts: { cardioSec?: number; warmupSec?: number } = {},
): number {
  const total = Math.max(0, durationSec);
  const cardio = Math.min(total, Math.max(0, parts.cardioSec ?? 0));
  const warm = Math.min(total - cardio, Math.max(0, parts.warmupSec ?? 0));
  const strength = total - cardio - warm;
  const kcal = bodyweightKg * ((MET.strength * strength + MET.cardio * cardio + MET.warmup * warm) / 3600);
  return Math.round(kcal / 5) * 5;
}

/** Calories for one finished workout, splitting time-based cardio/warm-up sets out. */
export function workoutCalories(d: TrainingData, w: Workout, bodyweightKg: number): number {
  if (!w.ended_at) return 0;
  const dur = (Date.parse(w.ended_at) - Date.parse(w.started_at)) / 1000;
  const weIds = new Map(d.workoutExercises.filter((we) => we.workout_id === w.id).map((we) => [we.id, we.exercise_id]));
  let cardioSec = 0;
  let warmupSec = 0;
  for (const s of d.sets) {
    if (s.workout_id !== w.id || !s.completed_at) continue;
    const ex = d.exercise(weIds.get(s.workout_exercise_id) ?? "");
    const sec = s.duration_sec ?? (ex?.category === "warmup" || ex?.category === "cooldown" ? 45 : 0);
    if (ex?.primary_muscle === "cardio") cardioSec += sec;
    else if (ex?.category === "warmup" || ex?.category === "cooldown") warmupSec += sec;
  }
  return estimateCalories(dur, bodyweightKg, { cardioSec, warmupSec });
}

// ---------------------------------------------------------------------------
// Period summary (week / month)
// ---------------------------------------------------------------------------
export interface PeriodSummary {
  sessions: number;
  durationSec: number;
  volumeKg: number;
  sets: number;
  prs: number;
  calories: number;
  topExerciseId: string | null;
}

function joined(d: TrainingData): PRSet[] {
  const exOf = new Map(d.workoutExercises.map((we) => [we.id, we.exercise_id]));
  return d.sets
    .filter((s) => exOf.has(s.workout_exercise_id))
    .map((s) => ({ ...s, exercise_id: exOf.get(s.workout_exercise_id)! }));
}

export function summarizePeriod(d: TrainingData, from: Date, to: Date, bodyweightKg: number): PeriodSummary {
  const inRange = d.workouts.filter((w) => {
    const t = Date.parse(w.started_at);
    return t >= from.getTime() && t < to.getTime();
  });
  const ids = new Set(inRange.map((w) => w.id));
  const all = joined(d);
  const inSets = all.filter((s) => ids.has((s as PRSet & { workout_id: string }).workout_id));
  const typeOf = (id: string) => {
    const ex = d.exercise(id);
    return ex && (ex.category ?? "strength") === "strength" ? ex.type : undefined;
  };
  const done = inSets.filter((s) => s.completed_at);
  const counts = new Map<string, number>();
  for (const s of done) {
    if (s.set_type === "warmup" || typeOf(s.exercise_id) === undefined) continue;
    counts.set(s.exercise_id, (counts.get(s.exercise_id) ?? 0) + 1);
  }
  return {
    sessions: inRange.length,
    durationSec: inRange.reduce((a, w) => a + (w.ended_at ? (Date.parse(w.ended_at) - Date.parse(w.started_at)) / 1000 : 0), 0),
    volumeKg: Math.round(done.reduce((a, s) => a + setVolume(s), 0)),
    sets: done.filter((s) => s.set_type !== "warmup").length,
    // Each session is compared with everything logged before it (so two PRs in one week both count).
    prs: [...inRange]
      .sort((a, b) => a.started_at.localeCompare(b.started_at))
      .reduce((n, w) => {
        const t = Date.parse(w.started_at);
        const prev = all.filter((x) => x.completed_at && Date.parse(x.completed_at) < t);
        const mine = all.filter((x) => (x as PRSet & { workout_id: string }).workout_id === w.id && x.completed_at);
        return n + detectNewPRs(prev, mine, typeOf).length;
      }, 0),
    calories: inRange.reduce((a, w) => a + workoutCalories(d, w, bodyweightKg), 0),
    topExerciseId: [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------
export interface Badge {
  key: string;
  icon: string;
  earned: boolean;
  progress: number; // 0..1
  current: number;
  target: number;
}

const BENCH = EX(1);
const SQUAT = EX(53);
const DEADLIFT = EX(13);

export function computeBadges(d: TrainingData, weeklyTarget: number): Badge[] {
  const sessions = d.workouts.length;
  const sets = joined(d).filter((s) => s.completed_at);
  const totalVolume = sets.reduce((a, s) => a + setVolume(s), 0);
  const perWorkoutVolume = new Map<string, number>();
  for (const s of sets) {
    const wid = (s as PRSet & { workout_id: string }).workout_id;
    perWorkoutVolume.set(wid, (perWorkoutVolume.get(wid) ?? 0) + setVolume(s));
  }
  const bestSession = Math.max(0, ...perWorkoutVolume.values());
  const heaviest = (id: string) =>
    Math.max(0, ...sets.filter((s) => s.exercise_id === id && s.set_type !== "warmup" && (s.reps ?? 0) >= 1).map((s) => s.weight_kg ?? 0));
  const streak = weeklyConsistency(d.workouts.map((w) => w.started_at), weeklyTarget).bestStreak;
  const hour = (w: Workout) => new Date(w.started_at).getHours();
  const early = d.workouts.filter((w) => hour(w) < 7).length;
  const late = d.workouts.filter((w) => hour(w) >= 21).length;
  const warmupSessions = new Set(
    d.workoutExercises.filter((we) => d.exercise(we.exercise_id)?.category === "warmup").map((we) => we.workout_id),
  ).size;

  const b = (key: string, icon: string, current: number, target: number): Badge => ({
    key,
    icon,
    current: Math.min(current, target),
    target,
    progress: Math.min(1, current / target),
    earned: current >= target,
  });
  return [
    b("first_workout", "🎯", sessions, 1),
    b("sessions_10", "🔟", sessions, 10),
    b("sessions_50", "💯", sessions, 50),
    b("sessions_100", "🏛️", sessions, 100),
    b("streak_4", "🔥", streak, 4),
    b("streak_8", "⚡", streak, 8),
    b("streak_12", "👑", streak, 12),
    b("session_10t", "🏋️", Math.round(bestSession), 10000),
    b("volume_100t", "🚚", Math.round(totalVolume), 100000),
    b("bench_100", "🥇", heaviest(BENCH), 100),
    b("squat_140", "🦵", heaviest(SQUAT), 140),
    b("deadlift_180", "🐂", heaviest(DEADLIFT), 180),
    b("early_bird", "🌅", early, 5),
    b("night_owl", "🦉", late, 5),
    b("warmup_hero", "🤸", warmupSessions, 10),
  ];
}
