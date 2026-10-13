import Dexie, { type EntityTable } from "dexie";
import type {
  BodyMetric,
  Exercise,
  NutritionLog,
  Profile,
  Program,
  ProgramDay,
  ProgressPhoto,
  Subscription,
  Template,
  TemplateExercise,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from "@/lib/types";

/** Tables mirrored from Supabase, in parent → child order (push order matters for FKs). */
export const SYNCED_TABLES = [
  "profiles",
  "exercises",
  "templates",
  "template_exercises",
  "programs",
  "program_days",
  "workouts",
  "workout_exercises",
  "sets",
  "body_metrics",
  "progress_photos",
  "nutrition_logs",
] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

export interface RowMap {
  profiles: Profile;
  exercises: Exercise;
  templates: Template;
  template_exercises: TemplateExercise;
  programs: Program;
  program_days: ProgramDay;
  workouts: Workout;
  workout_exercises: WorkoutExercise;
  sets: WorkoutSet;
  body_metrics: BodyMetric;
  progress_photos: ProgressPhoto;
  nutrition_logs: NutritionLog;
}

export interface OutboxItem {
  key: string; // `${table}:${id}` — one entry per row, later edits coalesce
  table: SyncedTable;
  id: string;
  queued_at: number;
  /** Set when the server rejected the row for a non-transient reason. */
  error?: string;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export interface PhotoBlob {
  id: string;
  blob: Blob;
  /** true until the file is uploaded to Storage */
  pending_upload: boolean;
}

export class GymDB extends Dexie {
  profiles!: EntityTable<Profile, "id">;
  exercises!: EntityTable<Exercise, "id">;
  templates!: EntityTable<Template, "id">;
  template_exercises!: EntityTable<TemplateExercise, "id">;
  programs!: EntityTable<Program, "id">;
  program_days!: EntityTable<ProgramDay, "id">;
  workouts!: EntityTable<Workout, "id">;
  workout_exercises!: EntityTable<WorkoutExercise, "id">;
  sets!: EntityTable<WorkoutSet, "id">;
  body_metrics!: EntityTable<BodyMetric, "id">;
  progress_photos!: EntityTable<ProgressPhoto, "id">;
  nutrition_logs!: EntityTable<NutritionLog, "id">;
  subscriptions!: EntityTable<Subscription, "user_id">;
  outbox!: EntityTable<OutboxItem, "key">;
  meta!: EntityTable<MetaRow, "key">;
  photo_blobs!: EntityTable<PhotoBlob, "id">;

  constructor(name = "gymtrack") {
    super(name);
    this.version(1).stores({
      profiles: "id",
      exercises: "id",
      templates: "id",
      template_exercises: "id, template_id",
      programs: "id",
      program_days: "id, program_id",
      workouts: "id, status, started_at",
      workout_exercises: "id, workout_id, exercise_id",
      sets: "id, workout_exercise_id, workout_id",
      body_metrics: "id, date",
      progress_photos: "id, date",
      nutrition_logs: "id, date",
      subscriptions: "user_id",
      outbox: "key, table, queued_at",
      meta: "key",
      photo_blobs: "id",
    });
  }
}

export const db = new GymDB();

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value });
}

/** Wipe everything (sign-out / account deletion). */
export async function clearLocalData() {
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}

export const alive = <T extends { deleted_at: string | null }>(r: T | undefined): r is T => !!r && !r.deleted_at;
