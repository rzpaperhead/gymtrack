"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useAuth } from "@/components/providers/auth-provider";
import { durationSec, setVolume } from "@/lib/calc/stats";
import { alive, db } from "@/lib/db/local";
import type { Workout, WorkoutExercise, WorkoutSet } from "@/lib/types";

export interface WorkoutRow {
  workout: Workout;
  durationSec: number;
  volumeKg: number;
  setCount: number;
  exerciseIds: string[];
}

export interface TrainingHistory {
  rows: WorkoutRow[]; // completed, newest first
  workouts: Workout[];
  workoutExercises: WorkoutExercise[];
  sets: WorkoutSet[];
}

/** All completed training data, live. Fine for years of logs on-device. */
export function useTrainingHistory(): TrainingHistory | undefined {
  const { ready } = useAuth();
  return useLiveQuery(async () => {
    if (!ready) return undefined;
    const [ws, wes, sets] = await Promise.all([db.workouts.toArray(), db.workout_exercises.toArray(), db.sets.toArray()]);
    const workouts = ws.filter((w) => alive(w) && w.status === "completed").sort((a, b) => b.started_at.localeCompare(a.started_at));
    const ids = new Set(workouts.map((w) => w.id));
    const liveWes = wes.filter((we) => alive(we) && ids.has(we.workout_id));
    const liveSets = sets.filter((s) => alive(s) && ids.has(s.workout_id));
    const setsBy = new Map<string, WorkoutSet[]>();
    for (const s of liveSets) setsBy.set(s.workout_id, [...(setsBy.get(s.workout_id) ?? []), s]);
    const exBy = new Map<string, string[]>();
    for (const we of [...liveWes].sort((a, b) => a.position - b.position)) {
      exBy.set(we.workout_id, [...(exBy.get(we.workout_id) ?? []), we.exercise_id]);
    }
    const rows = workouts.map((w) => {
      const s = (setsBy.get(w.id) ?? []).filter((x) => x.completed_at);
      return {
        workout: w,
        durationSec: durationSec(w),
        volumeKg: Math.round(s.reduce((a, x) => a + setVolume(x), 0)),
        setCount: s.filter((x) => x.set_type !== "warmup").length,
        exerciseIds: exBy.get(w.id) ?? [],
      };
    });
    return { rows, workouts, workoutExercises: liveWes, sets: liveSets };
  }, [ready]);
}
