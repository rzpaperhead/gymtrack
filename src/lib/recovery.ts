// Muscle recovery estimate: how "fresh" each muscle is, from recent sets.
//
// Model (deliberately simple, explainable):
// - Every completed non-warm-up set counts 1 for the primary muscle and 0.5
//   for each secondary muscle; "full_body" spreads 0.5 over the big movers.
// - Stress of one session = min(1, effective sets / 6).
// - Bigger muscles need longer (72 h / 60 h / 48 h), scaled by stress.
// - Fatigue decays linearly to zero; several sessions add up (capped at 1).
import type { Exercise, Muscle, Workout, WorkoutExercise, WorkoutSet } from "@/lib/types";

/** Muscles drawn on the body map (cardio / full_body are not regions). */
export const MAP_MUSCLES = [
  "chest",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "abs",
  "obliques",
  "traps",
  "back",
  "lats",
  "lower_back",
  "glutes",
  "quads",
  "hamstrings",
  "adductors",
  "calves",
] as const satisfies readonly Muscle[];
export type MapMuscle = (typeof MAP_MUSCLES)[number];

const BASE_HOURS: Record<MapMuscle, number> = {
  chest: 72,
  back: 72,
  lats: 72,
  lower_back: 72,
  glutes: 72,
  quads: 72,
  hamstrings: 72,
  shoulders: 60,
  traps: 60,
  adductors: 60,
  biceps: 48,
  triceps: 48,
  forearms: 48,
  abs: 48,
  obliques: 48,
  calves: 48,
};

const FULL_BODY: MapMuscle[] = ["quads", "glutes", "chest", "shoulders", "back", "abs"];
const SETS_FOR_FULL_STRESS = 6;
/** Below this the muscle counts as ready to train again. */
export const READY_THRESHOLD = 0.15;
const LOOKBACK_H = 7 * 24;
const H = 3_600_000;

export type RecoveryLevel = "fresh" | "recovering" | "fatigued";

export interface MuscleRecovery {
  muscle: MapMuscle;
  /** 0 = fully recovered … 1 = just hammered. */
  fatigue: number;
  level: RecoveryLevel;
  /** When fatigue drops below READY_THRESHOLD (null = ready now). */
  readyAt: number | null;
  /** Last session that trained it (any time), null if never. */
  lastTrainedAt: number | null;
}

export function levelOf(fatigue: number): RecoveryLevel {
  if (fatigue >= 0.6) return "fatigued";
  if (fatigue >= READY_THRESHOLD) return "recovering";
  return "fresh";
}

const isMapMuscle = (m: Muscle): m is MapMuscle => (MAP_MUSCLES as readonly string[]).includes(m);

export function computeRecovery(
  input: { workouts: Workout[]; workoutExercises: WorkoutExercise[]; sets: WorkoutSet[] },
  exercisesById: Map<string, Pick<Exercise, "primary_muscle" | "secondary_muscles" | "category">>,
  now: number,
): Record<MapMuscle, MuscleRecovery> {
  const doneAt = new Map(
    input.workouts.filter((w) => w.status === "completed").map((w) => [w.id, Date.parse(w.ended_at ?? w.started_at)] as const),
  );
  const setsPerWe = new Map<string, number>();
  for (const s of input.sets) {
    if (!s.completed_at || s.set_type === "warmup" || !doneAt.has(s.workout_id)) continue;
    setsPerWe.set(s.workout_exercise_id, (setsPerWe.get(s.workout_exercise_id) ?? 0) + 1);
  }

  // effective sets per workout per muscle
  const perWorkout = new Map<string, Map<MapMuscle, number>>();
  const lastTrained = new Map<MapMuscle, number>();
  for (const we of input.workoutExercises) {
    const n = setsPerWe.get(we.id);
    const ex = exercisesById.get(we.exercise_id);
    const at = doneAt.get(we.workout_id);
    if (!n || !ex || at === undefined || (ex.category ?? "strength") !== "strength") continue;
    const add = (m: MapMuscle, w: number) => {
      const bucket = perWorkout.get(we.workout_id) ?? new Map<MapMuscle, number>();
      bucket.set(m, (bucket.get(m) ?? 0) + n * w);
      perWorkout.set(we.workout_id, bucket);
      lastTrained.set(m, Math.max(lastTrained.get(m) ?? 0, at));
    };
    const targets: [Muscle, number][] = [[ex.primary_muscle, 1], ...ex.secondary_muscles.map((m) => [m, 0.5] as [Muscle, number])];
    for (const [m, w] of targets) {
      if (m === "full_body") FULL_BODY.forEach((f) => add(f, 0.5 * w));
      else if (isMapMuscle(m)) add(m, w);
    }
  }

  const out = {} as Record<MapMuscle, MuscleRecovery>;
  for (const m of MAP_MUSCLES) out[m] = { muscle: m, fatigue: 0, level: "fresh", readyAt: null, lastTrainedAt: lastTrained.get(m) ?? null };

  for (const [workoutId, muscles] of perWorkout) {
    const at = doneAt.get(workoutId)!;
    const hoursAgo = (now - at) / H;
    if (hoursAgo < 0 || hoursAgo > LOOKBACK_H) continue;
    for (const [m, eff] of muscles) {
      const stress = Math.min(1, eff / SETS_FOR_FULL_STRESS);
      const duration = BASE_HOURS[m] * (0.6 + 0.4 * stress);
      const left = stress * Math.max(0, 1 - hoursAgo / duration);
      if (left <= 0) continue;
      const r = out[m];
      r.fatigue = Math.min(1, r.fatigue + left);
      if (stress > READY_THRESHOLD) {
        const readyAt = at + duration * (1 - READY_THRESHOLD / stress) * H;
        if (readyAt > now) r.readyAt = Math.max(r.readyAt ?? 0, readyAt);
      }
    }
  }
  for (const m of MAP_MUSCLES) {
    const r = out[m];
    r.level = levelOf(r.fatigue);
    if (r.level === "fresh") r.readyAt = null;
    else if (r.readyAt === null) r.readyAt = now + H; // stacked small sessions: give it an hour
  }
  return out;
}
