import { epley1RM } from "@/lib/calc/one-rm";
import type { ExerciseType, SetType } from "@/lib/types";

export type RecordType =
  | "max_weight"
  | "max_e1rm"
  | "max_set_volume"
  | "max_reps_at_weight"
  | "max_reps"
  | "max_duration"
  | "max_distance";

/** The minimal shape PR logic needs; a WorkoutSet joined with its exercise id. */
export interface PRSet {
  id: string;
  exercise_id: string;
  set_type: SetType;
  weight_kg: number | null;
  reps: number | null;
  duration_sec: number | null;
  distance_m: number | null;
  completed_at: string | null;
}

export interface PersonalRecord {
  exercise_id: string;
  record_type: RecordType;
  value: number;
  /** For max_reps_at_weight: the weight the reps were done at. */
  weight_kg?: number;
  set_id: string;
  achieved_at: string;
}

/** Warm-ups and unfinished sets never count towards records. */
export function isRecordEligible(s: PRSet): boolean {
  return s.completed_at != null && s.set_type !== "warmup";
}

function pos(n: number | null): n is number {
  return n != null && Number.isFinite(n) && n > 0;
}

/** Weight key for "reps at a given weight", tolerant of float noise from lb conversion. */
function weightKey(kg: number): number {
  return Math.round(kg * 100) / 100;
}

/** Every candidate record a single set produces, given its exercise type. */
function candidates(s: PRSet, type: ExerciseType): PersonalRecord[] {
  const base = { exercise_id: s.exercise_id, set_id: s.id, achieved_at: s.completed_at! };
  const out: PersonalRecord[] = [];
  switch (type) {
    case "weight_reps": {
      if (!pos(s.weight_kg) || !pos(s.reps)) break;
      out.push({ ...base, record_type: "max_weight", value: s.weight_kg });
      const e1 = epley1RM(s.weight_kg, s.reps);
      if (e1 != null) out.push({ ...base, record_type: "max_e1rm", value: e1 });
      out.push({ ...base, record_type: "max_set_volume", value: Math.round(s.weight_kg * s.reps * 100) / 100 });
      out.push({ ...base, record_type: "max_reps_at_weight", value: s.reps, weight_kg: weightKey(s.weight_kg) });
      break;
    }
    case "bodyweight_reps":
    case "assisted": {
      if (pos(s.reps)) out.push({ ...base, record_type: "max_reps", value: s.reps });
      break;
    }
    case "time": {
      if (pos(s.duration_sec)) out.push({ ...base, record_type: "max_duration", value: s.duration_sec });
      break;
    }
    case "distance_time": {
      if (pos(s.distance_m)) out.push({ ...base, record_type: "max_distance", value: s.distance_m });
      break;
    }
  }
  return out;
}

function recordKey(r: PersonalRecord): string {
  return r.record_type === "max_reps_at_weight"
    ? `${r.exercise_id}|${r.record_type}|${r.weight_kg}`
    : `${r.exercise_id}|${r.record_type}`;
}

/**
 * Best value per (exercise, record type) — and per weight for reps-at-weight.
 * Ties keep the earliest set, so a record belongs to whoever hit it first.
 */
export function computeRecords(sets: PRSet[], typeOf: (exerciseId: string) => ExerciseType | undefined): PersonalRecord[] {
  const best = new Map<string, PersonalRecord>();
  const ordered = sets
    .filter(isRecordEligible)
    .sort((a, b) => a.completed_at!.localeCompare(b.completed_at!));
  for (const s of ordered) {
    const type = typeOf(s.exercise_id);
    if (!type) continue;
    for (const c of candidates(s, type)) {
      const k = recordKey(c);
      const cur = best.get(k);
      if (!cur || c.value > cur.value) best.set(k, c);
    }
  }
  return [...best.values()];
}

/**
 * Records set in `sessionSets` that beat everything in `previousSets`.
 *
 * - Only exercises with earlier history can produce a PR; a first-ever session
 *   sets the baseline instead of flooding the summary with "PRs".
 * - Reps-at-weight only counts at a weight that has been lifted before (new
 *   heavier weights are already covered by max_weight).
 * - One entry per record key: the best set in the session.
 */
export function detectNewPRs(
  previousSets: PRSet[],
  sessionSets: PRSet[],
  typeOf: (exerciseId: string) => ExerciseType | undefined,
): PersonalRecord[] {
  const prev = new Map(computeRecords(previousSets, typeOf).map((r) => [recordKey(r), r]));
  const exercisesWithHistory = new Set(previousSets.filter(isRecordEligible).map((s) => s.exercise_id));
  const result: PersonalRecord[] = [];
  for (const r of computeRecords(sessionSets, typeOf)) {
    if (!exercisesWithHistory.has(r.exercise_id)) continue;
    const before = prev.get(recordKey(r));
    if (r.record_type === "max_reps_at_weight" && !before) continue;
    if (!before || r.value > before.value) result.push(r);
  }
  return result;
}

/** Display priority so the summary leads with the most meaningful record. */
export const RECORD_PRIORITY: RecordType[] = [
  "max_e1rm",
  "max_weight",
  "max_reps",
  "max_duration",
  "max_distance",
  "max_set_volume",
  "max_reps_at_weight",
];
