import { exerciseName, getExercise } from "@/lib/catalog";
import { displayWeight } from "@/lib/calc/units";
import { alive, db } from "@/lib/db/local";
import type { Unit } from "@/lib/types";

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Builds the CSV text for every completed set. Weights in the user's unit. */
export async function buildWorkoutsCsv(unit: Unit, locale: string): Promise<string> {
  const workouts = (await db.workouts.toArray()).filter((w) => alive(w) && w.status === "completed");
  const byId = new Map(workouts.map((w) => [w.id, w]));
  const wes = (await db.workout_exercises.toArray()).filter((we) => alive(we) && byId.has(we.workout_id));
  const weById = new Map(wes.map((we) => [we.id, we]));
  const sets = (await db.sets.toArray()).filter((s) => alive(s) && s.completed_at && weById.has(s.workout_exercise_id));

  const header = ["date", "workout", "exercise", "set", "set_type", `weight_${unit}`, "reps", "rpe", "duration_sec", "distance_m", "notes"];
  const lines = [header.join(",")];
  const names = new Map<string, string>();
  const sorted = sets.sort((a, b) => {
    const wa = byId.get(a.workout_id)!.started_at;
    const wb = byId.get(b.workout_id)!.started_at;
    if (wa !== wb) return wa.localeCompare(wb);
    const pa = weById.get(a.workout_exercise_id)!.position;
    const pb = weById.get(b.workout_exercise_id)!.position;
    return pa !== pb ? pa - pb : a.position - b.position;
  });
  for (const s of sorted) {
    const w = byId.get(s.workout_id)!;
    const we = weById.get(s.workout_exercise_id)!;
    if (!names.has(we.exercise_id)) names.set(we.exercise_id, exerciseName(await getExercise(we.exercise_id), locale));
    lines.push(
      [
        w.started_at,
        w.name ?? "",
        names.get(we.exercise_id),
        s.position + 1,
        s.set_type,
        s.weight_kg != null ? displayWeight(s.weight_kg, unit) : "",
        s.reps,
        s.rpe,
        s.duration_sec,
        s.distance_m,
        we.notes,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}

export async function exportWorkoutsCsv(unit: Unit, locale: string) {
  const csv = await buildWorkoutsCsv(unit, locale);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gymtrack-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
