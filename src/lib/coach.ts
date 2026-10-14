/**
 * Rule-based "personal trainer" for Premium users. Pure functions so they're
 * easy to test and could later feed an LLM coach with the same inputs.
 */
import { differenceInCalendarDays, parseISO } from "date-fns";
import { epley1RM } from "@/lib/calc/one-rm";
import { dateKey, setVolume, weeklyConsistency } from "@/lib/calc/stats";
import type { Exercise, Goal, Muscle, Unit, Workout, WorkoutExercise, WorkoutSet } from "@/lib/types";

export const REP_RANGE: Record<Goal, [number, number]> = {
  strength: [3, 6],
  hypertrophy: [8, 12],
  general: [8, 12],
  // Fat loss: moderate loads, more reps & work per session.
  lose_weight: [10, 15],
  // Mass gain: classic hypertrophy range with progressive overload.
  gain_weight: [8, 12],
};

const LOWER: Muscle[] = ["quads", "hamstrings", "glutes", "calves", "adductors"];

/** Smallest sensible jump: bigger for lower body, and in the user's unit. */
export function weightIncrementKg(ex: Pick<Exercise, "primary_muscle" | "equipment">, unit: Unit): number {
  const lower = LOWER.includes(ex.primary_muscle);
  if (unit === "lb") return (lower ? 10 : 5) * 0.45359237;
  if (ex.equipment === "dumbbell" || ex.equipment === "cable" || ex.equipment === "machine") return lower ? 5 : 2;
  return lower ? 5 : 2.5;
}

export type Suggestion =
  | { kind: "increase"; weight_kg: number; reps: number }
  | { kind: "more_reps"; weight_kg: number; reps: number }
  | { kind: "repeat"; weight_kg: number; reps: number }
  | { kind: "deload"; weight_kg: number; reps: number };

const working = (sets: WorkoutSet[]) =>
  sets.filter((s) => s.completed_at && s.set_type !== "warmup" && s.weight_kg && s.reps).sort((a, b) => a.position - b.position);

const round = (kg: number, step: number) => Math.round(kg / step) * step;

/**
 * Double progression: hit the top of the rep range on every working set →
 * add weight; inside the range → add a rep; below the range twice in a row →
 * drop ~10% and rebuild.
 * `history` is newest-first, one array of sets per previous session.
 */
export function suggestNext(
  ex: Pick<Exercise, "type" | "primary_muscle" | "equipment">,
  history: WorkoutSet[][],
  range: [number, number],
  unit: Unit,
): Suggestion | null {
  if (ex.type !== "weight_reps") return null;
  const last = working(history[0] ?? []);
  if (!last.length) return null;
  const [min, max] = range;
  const top = Math.max(...last.map((s) => s.weight_kg!));
  const atTop = last.filter((s) => s.weight_kg === top);
  const step = weightIncrementKg(ex, unit);

  if (last.every((s) => s.reps! >= max)) {
    return { kind: "increase", weight_kg: round(top + step, unit === "kg" ? 0.5 : step), reps: min };
  }
  const below = (sets: WorkoutSet[]) => {
    const w = working(sets);
    return w.length > 0 && w.some((s) => s.reps! < min);
  };
  if (below(history[0] ?? []) && below(history[1] ?? [])) {
    return { kind: "deload", weight_kg: round(top * 0.9, unit === "kg" ? 2.5 : step), reps: min };
  }
  if (atTop.some((s) => s.reps! < min)) return { kind: "repeat", weight_kg: top, reps: min };
  const bestReps = Math.max(...atTop.map((s) => s.reps!));
  return { kind: "more_reps", weight_kg: top, reps: Math.min(max, bestReps + 1) };
}

export type Insight =
  | { key: "weekOnTrack"; count: number; target: number }
  | { key: "weekBehind"; left: number; daysLeft: number }
  | { key: "restDay"; streakDays: number }
  | { key: "neglected"; group: "legs" | "back" | "chest" | "shoulders" | "arms"; days: number | null }
  | { key: "pushPullImbalance"; ratio: number }
  | { key: "stalled"; exerciseId: string; sessions: number }
  | { key: "progressing"; exerciseId: string; gainKg: number };

const GROUP_MUSCLES: Record<"legs" | "back" | "chest" | "shoulders" | "arms", Muscle[]> = {
  legs: ["quads", "hamstrings", "glutes", "calves"],
  back: ["back", "lats"],
  chest: ["chest"],
  shoulders: ["shoulders"],
  arms: ["biceps", "triceps"],
};
const PUSH: Muscle[] = ["chest", "shoulders", "triceps"];
const PULL: Muscle[] = ["back", "lats", "biceps", "traps"];

export interface CoachData {
  workouts: Workout[]; // completed
  workoutExercises: WorkoutExercise[];
  sets: WorkoutSet[];
  exercise: (id: string) => Exercise | undefined;
  weeklyTarget: number;
}

/** A handful of prioritised, actionable notes about the last few weeks. */
export function weeklyInsights(d: CoachData, today = new Date()): Insight[] {
  const out: Insight[] = [];
  const dates = d.workouts.map((w) => w.started_at);
  const c = weeklyConsistency(dates, d.weeklyTarget, today);
  const dow = (today.getDay() + 6) % 7; // 0 = Monday
  const daysLeft = 6 - dow;
  if (c.thisWeekCount >= c.target) out.push({ key: "weekOnTrack", count: c.thisWeekCount, target: c.target });
  else if (dates.length) out.push({ key: "weekBehind", left: c.target - c.thisWeekCount, daysLeft });

  // Consecutive training days ending today/yesterday.
  const days = new Set(dates.map((x) => dateKey(x)));
  let run = 0;
  for (let i = 0; i < 14; i++) {
    const k = dateKey(new Date(today.getTime() - i * 86400000));
    if (days.has(k)) run++;
    else if (i > 0) break;
  }
  if (run >= 6) out.push({ key: "restDay", streakDays: run });

  const exOf = new Map(d.workoutExercises.map((we) => [we.id, we.exercise_id]));
  const recent = d.sets.filter((s) => s.completed_at && differenceInCalendarDays(today, parseISO(s.completed_at)) <= 14);
  if (d.workouts.length >= 3) {
    // Muscle groups not trained in 10+ days.
    for (const [g, ms] of Object.entries(GROUP_MUSCLES) as [keyof typeof GROUP_MUSCLES, Muscle[]][]) {
      let lastDays: number | null = null;
      for (const s of d.sets) {
        if (!s.completed_at) continue;
        const ex = d.exercise(exOf.get(s.workout_exercise_id) ?? "");
        if (!ex || (ex.category ?? "strength") !== "strength" || !ms.includes(ex.primary_muscle)) continue;
        const ago = differenceInCalendarDays(today, parseISO(s.completed_at));
        lastDays = lastDays == null ? ago : Math.min(lastDays, ago);
      }
      if (lastDays == null || lastDays >= 10) out.push({ key: "neglected", group: g, days: lastDays });
    }
    // Push vs pull balance (shoulder health).
    let push = 0;
    let pull = 0;
    for (const s of recent) {
      const ex = d.exercise(exOf.get(s.workout_exercise_id) ?? "");
      if (!ex) continue;
      const v = setVolume(s) || (s.reps ?? 0) * 20; // bodyweight work still counts a little
      if (PUSH.includes(ex.primary_muscle)) push += v;
      if (PULL.includes(ex.primary_muscle)) pull += v;
    }
    if (pull > 0 && push / pull >= 1.5) out.push({ key: "pushPullImbalance", ratio: Math.round((push / pull) * 10) / 10 });
  }

  // Stalled vs progressing lifts: best e1RM per session for the last 4 sessions.
  const perEx = new Map<string, { date: string; e1rm: number }[]>();
  const sessionOf = new Map(d.workouts.map((w) => [w.id, w.started_at]));
  for (const s of d.sets) {
    if (!s.completed_at || s.set_type === "warmup") continue;
    const id = exOf.get(s.workout_exercise_id);
    const e = epley1RM(s.weight_kg, s.reps);
    if (!id || e == null || !sessionOf.has(s.workout_id)) continue;
    const list = perEx.get(id) ?? [];
    const date = sessionOf.get(s.workout_id)!;
    const cur = list.find((x) => x.date === date);
    if (cur) cur.e1rm = Math.max(cur.e1rm, e);
    else list.push({ date, e1rm: e });
    perEx.set(id, list);
  }
  for (const [id, list] of perEx) {
    const sorted = list.sort((a, b) => b.date.localeCompare(a.date));
    if (sorted.length < 4) continue;
    const [a, b, c2, prev] = sorted;
    const recentBest = Math.max(a.e1rm, b.e1rm, c2.e1rm);
    if (recentBest <= prev.e1rm) out.push({ key: "stalled", exerciseId: id, sessions: 3 });
    else if (a.e1rm - sorted[sorted.length - 1].e1rm >= 2.5)
      out.push({ key: "progressing", exerciseId: id, gainKg: Math.round((a.e1rm - sorted[sorted.length - 1].e1rm) * 10) / 10 });
  }

  const order: Insight["key"][] = ["restDay", "weekBehind", "stalled", "pushPullImbalance", "neglected", "progressing", "weekOnTrack"];
  return out.sort((x, y) => order.indexOf(x.key) - order.indexOf(y.key)).slice(0, 5);
}
