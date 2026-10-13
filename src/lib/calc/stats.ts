import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from "date-fns";
import type { Muscle, SetType } from "@/lib/types";

/** Weeks start on Monday (common in Indonesia and ISO-8601). */
export const WEEK_OPTS = { weekStartsOn: 1 as const };

export function dateKey(d: Date | string): string {
  return format(typeof d === "string" ? parseISO(d) : d, "yyyy-MM-dd");
}

export function weekKey(d: Date | string): string {
  return dateKey(startOfWeek(typeof d === "string" ? parseISO(d) : d, WEEK_OPTS));
}

export interface VolumeSet {
  set_type: SetType;
  weight_kg: number | null;
  reps: number | null;
  completed_at: string | null;
}

/** Volume (kg × reps) of a completed, non-warm-up set. */
export function setVolume(s: VolumeSet): number {
  if (!s.completed_at || s.set_type === "warmup") return 0;
  if (!s.weight_kg || !s.reps || s.weight_kg <= 0 || s.reps <= 0) return 0;
  return s.weight_kg * s.reps;
}

export function totalVolume(sets: VolumeSet[]): number {
  return Math.round(sets.reduce((acc, s) => acc + setVolume(s), 0));
}

export interface WorkoutLike {
  started_at: string;
  ended_at: string | null;
}

export function durationSec(w: WorkoutLike, now = new Date()): number {
  const end = w.ended_at ? parseISO(w.ended_at) : now;
  return Math.max(0, Math.round((end.getTime() - parseISO(w.started_at).getTime()) / 1000));
}

/** Total volume per week for the `weeks` most recent weeks (oldest first, empty weeks = 0). */
export function weeklyVolume(sets: VolumeSet[], weeks: number, today = new Date()): { week: string; volume: number }[] {
  const buckets = new Map<string, number>();
  for (const s of sets) {
    const v = setVolume(s);
    if (!v) continue;
    const k = weekKey(s.completed_at!);
    buckets.set(k, (buckets.get(k) ?? 0) + v);
  }
  const start = startOfWeek(today, WEEK_OPTS);
  const out: { week: string; volume: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const k = dateKey(addDays(start, -7 * i));
    out.push({ week: k, volume: Math.round(buckets.get(k) ?? 0) });
  }
  return out;
}

/** Volume attributed to each exercise's primary muscle. */
export function volumeByMuscle(
  sets: (VolumeSet & { exercise_id: string })[],
  muscleOf: (exerciseId: string) => Muscle | undefined,
): Partial<Record<Muscle, number>> {
  const out: Partial<Record<Muscle, number>> = {};
  for (const s of sets) {
    const v = setVolume(s);
    const m = muscleOf(s.exercise_id);
    if (!v || !m) continue;
    out[m] = Math.round((out[m] ?? 0) + v);
  }
  return out;
}

/** Number of completed workouts per local date. */
export function workoutsPerDay(dates: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of dates) {
    const k = dateKey(d);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export interface Consistency {
  /** Consecutive weeks (ending with the current or last week) that met the target. */
  currentStreak: number;
  bestStreak: number;
  thisWeekCount: number;
  target: number;
}

/**
 * Weekly consistency. The current week only extends the streak once the
 * target is met; until then it doesn't break a streak either.
 */
export function weeklyConsistency(workoutDates: string[], target: number, today = new Date()): Consistency {
  const t = Math.max(1, target);
  const perWeek = new Map<string, number>();
  for (const d of workoutDates) {
    const k = weekKey(d);
    perWeek.set(k, (perWeek.get(k) ?? 0) + 1);
  }
  const thisWeek = startOfWeek(today, WEEK_OPTS);
  const thisWeekCount = perWeek.get(dateKey(thisWeek)) ?? 0;

  let current = thisWeekCount >= t ? 1 : 0;
  for (let i = 1; ; i++) {
    const k = dateKey(addDays(thisWeek, -7 * i));
    if ((perWeek.get(k) ?? 0) >= t) current++;
    else break;
  }

  let best = 0;
  if (perWeek.size) {
    const earliest = [...perWeek.keys()].sort()[0];
    let run = 0;
    for (let d = parseISO(earliest); d <= thisWeek; d = addDays(d, 7)) {
      if ((perWeek.get(dateKey(d)) ?? 0) >= t) {
        run++;
        best = Math.max(best, run);
      } else if (dateKey(d) !== dateKey(thisWeek)) {
        run = 0;
      }
    }
  }
  return { currentStreak: current, bestStreak: Math.max(best, current), thisWeekCount, target: t };
}

/**
 * Trailing moving average over a calendar window (default 7 days), so gaps in
 * logging don't stretch the window. Input need not be sorted.
 */
export function movingAverage(
  points: { date: string; value: number }[],
  windowDays = 7,
): { date: string; value: number; avg: number }[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((p, i) => {
    const end = parseISO(p.date);
    let sum = 0;
    let n = 0;
    for (let j = i; j >= 0; j--) {
      if (differenceInCalendarDays(end, parseISO(sorted[j].date)) >= windowDays) break;
      sum += sorted[j].value;
      n++;
    }
    return { ...p, avg: Math.round((sum / n) * 100) / 100 };
  });
}
