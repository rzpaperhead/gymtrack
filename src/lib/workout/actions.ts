import { getExercise, getTemplate } from "@/lib/catalog";
import { detectNewPRs, type PersonalRecord, type PRSet } from "@/lib/calc/prs";
import { durationSec, totalVolume } from "@/lib/calc/stats";
import { alive, db } from "@/lib/db/local";
import { newId, nowIso, requireUserId } from "@/lib/db/session";
import { patchRow, saveRow, saveRows, softDelete } from "@/lib/db/write";
import { ROUTINE_DEFAULTS } from "@/lib/exercises/routines";
import type { ExerciseType, Muscle, SetType, Workout, WorkoutExercise, WorkoutSet } from "@/lib/types";

export class WorkoutInProgressError extends Error {
  constructor(public workoutId: string) {
    super("A workout is already in progress");
  }
}

export async function getActiveWorkout(): Promise<Workout | undefined> {
  const list = await db.workouts.where("status").equals("in_progress").toArray();
  return list.filter(alive).sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
}

/** Sets of the `n` most recent *completed* sessions with this exercise, newest first. */
export async function lastPerformances(exerciseId: string, excludeWorkoutId?: string, n = 2): Promise<WorkoutSet[][]> {
  const wes = (await db.workout_exercises.where("exercise_id").equals(exerciseId).toArray()).filter(
    (we) => alive(we) && we.workout_id !== excludeWorkoutId,
  );
  if (!wes.length) return [];
  const workouts = (await db.workouts.bulkGet([...new Set(wes.map((we) => we.workout_id))]))
    .filter((w): w is Workout => alive(w) && w.status === "completed")
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, n);
  const out: WorkoutSet[][] = [];
  for (const w of workouts) {
    const we = wes.filter((x) => x.workout_id === w.id).sort((a, b) => a.position - b.position)[0];
    out.push(
      (await db.sets.where("workout_exercise_id").equals(we.id).toArray()).filter(alive).sort((a, b) => a.position - b.position),
    );
  }
  return out;
}

/** Sets of the most recent *completed* session that included this exercise. */
export async function lastPerformance(exerciseId: string, excludeWorkoutId?: string): Promise<WorkoutSet[]> {
  return (await lastPerformances(exerciseId, excludeWorkoutId, 1))[0] ?? [];
}

function blankSet(userId: string, workoutId: string, weId: string, position: number, p: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id: newId(),
    user_id: userId,
    workout_id: workoutId,
    workout_exercise_id: weId,
    position,
    set_type: "working",
    weight_kg: null,
    reps: null,
    rpe: null,
    duration_sec: null,
    distance_m: null,
    completed_at: null,
    updated_at: nowIso(),
    deleted_at: null,
    ...p,
  };
}

/** Copy the values of a previous set into a fresh, unfinished one. */
function fromPrevious(prev: WorkoutSet): Partial<WorkoutSet> {
  return {
    set_type: prev.set_type,
    weight_kg: prev.weight_kg,
    reps: prev.reps,
    duration_sec: prev.duration_sec,
    distance_m: prev.distance_m,
  };
}

async function buildExercise(
  userId: string,
  workoutId: string,
  exerciseId: string,
  position: number,
  opts: { targetSets?: number; restSec?: number | null; superset?: string | null; defaults?: Partial<WorkoutSet> } = {},
): Promise<{ we: WorkoutExercise; sets: WorkoutSet[] }> {
  const we: WorkoutExercise = {
    id: newId(),
    user_id: userId,
    workout_id: workoutId,
    exercise_id: exerciseId,
    position,
    notes: null,
    superset_group: opts.superset ?? null,
    rest_sec: opts.restSec ?? null,
    updated_at: nowIso(),
    deleted_at: null,
  };
  const prev = await lastPerformance(exerciseId, workoutId);
  let sets: WorkoutSet[];
  if (prev.length) {
    // Repeat last session's structure: this is what makes "same as last time" a single tap per set.
    sets = prev.map((p, i) => blankSet(userId, workoutId, we.id, i, fromPrevious(p)));
    const working = sets.filter((s) => s.set_type !== "warmup").length;
    const target = opts.targetSets ?? 0;
    const last = prev[prev.length - 1];
    for (let i = working; i < target; i++) {
      sets.push(blankSet(userId, workoutId, we.id, sets.length, { ...fromPrevious(last), set_type: "working" }));
    }
  } else {
    const n = Math.max(1, opts.targetSets ?? 1);
    sets = Array.from({ length: n }, (_, i) => blankSet(userId, workoutId, we.id, i, opts.defaults));
  }
  return { we, sets };
}

export async function startWorkout(opts: { templateId?: string | null; name?: string | null } = {}): Promise<string> {
  const active = await getActiveWorkout();
  if (active) throw new WorkoutInProgressError(active.id);
  const userId = requireUserId();
  const workout: Workout = {
    id: newId(),
    user_id: userId,
    template_id: opts.templateId ?? null,
    name: opts.name ?? null,
    started_at: nowIso(),
    ended_at: null,
    notes: null,
    status: "in_progress",
    updated_at: nowIso(),
    deleted_at: null,
  };
  const wes: WorkoutExercise[] = [];
  const sets: WorkoutSet[] = [];
  if (opts.templateId) {
    const tpl = await getTemplate(opts.templateId);
    if (tpl) {
      workout.name = opts.name ?? tpl.template.name;
      for (const [i, item] of tpl.items.entries()) {
        const built = await buildExercise(userId, workout.id, item.exercise_id, i, {
          targetSets: item.target_sets,
          restSec: item.rest_sec,
          superset: item.superset_group,
        });
        wes.push(built.we);
        sets.push(...built.sets);
      }
    }
  }
  await saveRow("workouts", workout);
  await saveRows("workout_exercises", wes);
  await saveRows("sets", sets);
  return workout.id;
}

export async function addExercises(workoutId: string, exerciseIds: string[], opts: { atStart?: boolean } = {}) {
  const userId = requireUserId();
  const existing = (await db.workout_exercises.where("workout_id").equals(workoutId).toArray())
    .filter(alive)
    .sort((a, b) => a.position - b.position);
  let pos = opts.atStart ? 0 : existing.reduce((m, we) => Math.max(m, we.position), -1) + 1;
  const wes: WorkoutExercise[] = [];
  const sets: WorkoutSet[] = [];
  for (const exId of exerciseIds) {
    const ex = await getExercise(exId);
    const routine = ex?.category === "warmup" || ex?.category === "cooldown";
    const built = await buildExercise(userId, workoutId, exId, pos++, {
      // Warm-up / stretch items: one set, pre-filled, no rest timer.
      ...(routine
        ? {
            restSec: 0,
            defaults: ex.type === "time" ? { duration_sec: ROUTINE_DEFAULTS.duration_sec } : { reps: ROUTINE_DEFAULTS.reps },
          }
        : {}),
    });
    wes.push(built.we);
    sets.push(...built.sets);
  }
  if (opts.atStart) {
    await saveRows(
      "workout_exercises",
      existing.map((we, i) => ({ ...we, position: exerciseIds.length + i })),
    );
  }
  await saveRows("workout_exercises", wes);
  await saveRows("sets", sets);
}

/** Muscles (primary + secondary) of the strength exercises in a session. */
export async function sessionMuscles(workoutId: string): Promise<Muscle[]> {
  const wes = (await db.workout_exercises.where("workout_id").equals(workoutId).toArray()).filter(alive);
  const out = new Set<Muscle>();
  for (const we of wes) {
    const ex = await getExercise(we.exercise_id);
    if (!ex || (ex.category ?? "strength") !== "strength") continue;
    out.add(ex.primary_muscle);
    ex.secondary_muscles.forEach((m) => out.add(m));
  }
  return [...out];
}

export async function addSet(weId: string) {
  const we = await db.workout_exercises.get(weId);
  if (!we) return;
  const sets = (await db.sets.where("workout_exercise_id").equals(weId).toArray()).filter(alive);
  const last = sets.sort((a, b) => a.position - b.position)[sets.length - 1];
  const copy = last ? { ...fromPrevious(last), set_type: (last.set_type === "warmup" ? "working" : last.set_type) as SetType } : {};
  await saveRow("sets", blankSet(we.user_id, we.workout_id, weId, (last?.position ?? -1) + 1, copy));
}

export async function updateSet(id: string, patch: Partial<WorkoutSet>) {
  await patchRow("sets", id, patch);
}

export async function removeSet(id: string) {
  await softDelete("sets", [id]);
}

/**
 * Toggle a set done. Empty fields are filled from `fallback` (last session's
 * values or the template target) so ticking a pre-filled row is the whole job.
 */
export async function toggleSetDone(id: string, fallback?: Partial<WorkoutSet>): Promise<boolean> {
  const s = await db.sets.get(id);
  if (!s) return false;
  if (s.completed_at) {
    await patchRow("sets", id, { completed_at: null });
    return false;
  }
  const patch: Partial<WorkoutSet> = { completed_at: nowIso() };
  for (const k of ["weight_kg", "reps", "duration_sec", "distance_m"] as const) {
    if (s[k] == null && fallback?.[k] != null) patch[k] = fallback[k];
  }
  await patchRow("sets", id, patch);
  return true;
}

export async function removeExercise(weId: string) {
  const sets = await db.sets.where("workout_exercise_id").equals(weId).toArray();
  await softDelete("sets", sets.map((s) => s.id));
  await softDelete("workout_exercises", [weId]);
}

export async function reorderExercises(orderedIds: string[]) {
  const rows = (await db.workout_exercises.bulkGet(orderedIds)).filter(alive);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const changed = orderedIds
    .map((id, position) => ({ row: byId.get(id), position }))
    .filter((x): x is { row: WorkoutExercise; position: number } => !!x.row && x.row.position !== x.position)
    .map(({ row, position }) => ({ ...row, position }));
  await saveRows("workout_exercises", changed);
}

/** Link an exercise with the next one into a superset, or unlink it. */
export async function toggleSupersetWithNext(workoutId: string, weId: string) {
  const wes = (await db.workout_exercises.where("workout_id").equals(workoutId).toArray())
    .filter(alive)
    .sort((a, b) => a.position - b.position);
  const i = wes.findIndex((w) => w.id === weId);
  const cur = wes[i];
  const next = wes[i + 1];
  if (!cur) return;
  if (cur.superset_group && next?.superset_group === cur.superset_group) {
    // Unlink: everything from `next` onward in the group gets a fresh group (or none).
    const group = cur.superset_group;
    const tail = wes.slice(i + 1).filter((w) => w.superset_group === group);
    const head = wes.slice(0, i + 1).filter((w) => w.superset_group === group);
    const newTail = tail.length > 1 ? nextGroup(wes) : null;
    const updates = [
      ...tail.map((w) => ({ ...w, superset_group: newTail })),
      ...(head.length === 1 ? head.map((w) => ({ ...w, superset_group: null })) : []),
    ];
    await saveRows("workout_exercises", updates);
    return;
  }
  if (!next) return;
  const group = cur.superset_group ?? next.superset_group ?? nextGroup(wes);
  const merge = new Set([cur.superset_group, next.superset_group].filter(Boolean));
  const updates = wes
    .filter((w) => w.id === cur.id || w.id === next.id || (w.superset_group && merge.has(w.superset_group)))
    .map((w) => ({ ...w, superset_group: group }));
  await saveRows("workout_exercises", updates);
}

function nextGroup(wes: Pick<WorkoutExercise, "superset_group">[]): string {
  const used = new Set(wes.map((w) => w.superset_group).filter(Boolean));
  for (const c of "abcdefghijklmnopqrstuvwxyz") if (!used.has(c)) return c;
  return newId().slice(0, 4);
}

export async function setExerciseNotes(weId: string, notes: string) {
  await patchRow("workout_exercises", weId, { notes: notes || null });
}

export async function setExerciseRest(weId: string, restSec: number | null) {
  await patchRow("workout_exercises", weId, { rest_sec: restSec });
}

export async function updateWorkout(id: string, patch: Partial<Workout>) {
  await patchRow("workouts", id, patch);
}

async function workoutChildren(workoutId: string) {
  const [wes, sets] = await Promise.all([
    db.workout_exercises.where("workout_id").equals(workoutId).toArray(),
    db.sets.where("workout_id").equals(workoutId).toArray(),
  ]);
  return { wes: wes.filter(alive), sets: sets.filter(alive) };
}

export function hasValues(s: WorkoutSet) {
  return s.weight_kg != null || s.reps != null || s.duration_sec != null || s.distance_m != null;
}

/**
 * Finish a session. Unticked sets are either ticked (if they hold values) or
 * dropped; exercises left without sets are removed.
 */
export async function finishWorkout(id: string, incomplete: "complete" | "discard") {
  const { wes, sets } = await workoutChildren(id);
  const now = nowIso();
  const open = sets.filter((s) => !s.completed_at);
  const toComplete = incomplete === "complete" ? open.filter(hasValues) : [];
  const toDrop = open.filter((s) => !toComplete.includes(s));
  await saveRows(
    "sets",
    toComplete.map((s) => ({ ...s, completed_at: now })),
  );
  await softDelete("sets", toDrop.map((s) => s.id));
  const remaining = new Set(sets.filter((s) => !toDrop.includes(s)).map((s) => s.workout_exercise_id));
  await softDelete("workout_exercises", wes.filter((we) => !remaining.has(we.id)).map((we) => we.id));
  await patchRow("workouts", id, { status: "completed", ended_at: now });
}

export async function deleteWorkout(id: string) {
  const { wes, sets } = await workoutChildren(id);
  await softDelete("sets", sets.map((s) => s.id));
  await softDelete("workout_exercises", wes.map((w) => w.id));
  await softDelete("workouts", [id]);
}

/** Every eligible set joined with its exercise, optionally limited to some workouts. */
export async function loadPRSets(filter: (w: Workout) => boolean): Promise<PRSet[]> {
  const workouts = (await db.workouts.toArray()).filter((w) => alive(w) && filter(w));
  if (!workouts.length) return [];
  const ids = new Set(workouts.map((w) => w.id));
  const wes = (await db.workout_exercises.toArray()).filter((we) => alive(we) && ids.has(we.workout_id));
  const exOf = new Map(wes.map((we) => [we.id, we.exercise_id]));
  const sets = (await db.sets.toArray()).filter((s) => alive(s) && exOf.has(s.workout_exercise_id));
  return sets.map((s) => ({
    id: s.id,
    exercise_id: exOf.get(s.workout_exercise_id)!,
    set_type: s.set_type,
    weight_kg: s.weight_kg,
    reps: s.reps,
    duration_sec: s.duration_sec,
    distance_m: s.distance_m,
    completed_at: s.completed_at,
  }));
}

export interface SessionSummary {
  durationSec: number;
  volumeKg: number;
  setCount: number;
  exerciseCount: number;
  prs: PersonalRecord[];
}

export async function sessionSummary(workoutId: string): Promise<SessionSummary | undefined> {
  const w = await db.workouts.get(workoutId);
  if (!w) return undefined;
  const { wes, sets } = await workoutChildren(workoutId);
  const done = sets.filter((s) => s.completed_at);
  const [previous, session] = await Promise.all([
    loadPRSets((x) => x.status === "completed" && x.id !== w.id && x.started_at < w.started_at),
    loadPRSets((x) => x.id === w.id),
  ]);
  const types = new Map<string, ExerciseType>();
  for (const we of wes) {
    const ex = await getExercise(we.exercise_id);
    if (ex && (ex.category ?? "strength") === "strength") types.set(ex.id, ex.type);
  }
  return {
    durationSec: durationSec(w),
    volumeKg: totalVolume(done),
    setCount: done.filter((s) => s.set_type !== "warmup").length,
    exerciseCount: new Set(wes.filter((we) => done.some((s) => s.workout_exercise_id === we.id)).map((we) => we.exercise_id)).size,
    prs: detectNewPRs(previous, session, (id) => types.get(id)),
  };
}
