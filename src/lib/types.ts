// Domain types. These mirror the Postgres schema in supabase/migrations and the
// local Dexie tables. Weights are always stored in kilograms.

export type Locale = "id" | "en";
export type Unit = "kg" | "lb";
export type Goal = "strength" | "hypertrophy" | "general";
export type ThemePref = "dark" | "light" | "system";

export const MUSCLES = [
  "chest",
  "back",
  "lats",
  "traps",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "abs",
  "obliques",
  "lower_back",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
  "adductors",
  "full_body",
  "cardio",
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "kettlebell",
  "band",
  "smith_machine",
  "ez_bar",
  "cardio_machine",
  "other",
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const EXERCISE_TYPES = [
  "weight_reps",
  "bodyweight_reps",
  "assisted",
  "time",
  "distance_time",
] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const SET_TYPES = ["warmup", "working", "drop", "failure"] as const;
export type SetType = (typeof SET_TYPES)[number];

export const POSES = ["front", "side", "back"] as const;
export type Pose = (typeof POSES)[number];

/** Columns every synced row carries. */
export interface SyncedRow {
  id: string;
  user_id: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Profile {
  id: string; // = auth.users.id
  display_name: string;
  locale: Locale;
  unit: Unit;
  goal: Goal;
  weekly_target: number;
  default_rest_sec: number;
  theme: ThemePref;
  bodyweight_start_kg: number | null;
  calorie_target: number | null;
  protein_target: number | null;
  carbs_target: number | null;
  fat_target: number | null;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Exercise {
  id: string;
  owner_id: string | null; // null = built-in
  name_id: string;
  name_en: string;
  primary_muscle: Muscle;
  secondary_muscles: Muscle[];
  equipment: Equipment;
  type: ExerciseType;
  default_rest_sec: number;
  updated_at: string;
  deleted_at: string | null;
}

export interface Template extends Omit<SyncedRow, "user_id"> {
  user_id: string | null; // null = built-in
  name: string;
  name_en: string | null; // only used by built-in templates
  notes: string | null;
}

export interface TemplateExercise extends Omit<SyncedRow, "user_id"> {
  user_id: string | null;
  template_id: string;
  exercise_id: string;
  position: number;
  target_sets: number;
  target_reps_min: number | null;
  target_reps_max: number | null;
  rest_sec: number | null;
  superset_group: string | null;
}

export interface Program extends SyncedRow {
  name: string;
  is_active: boolean;
  /** Key of the built-in program this was activated from, or null for custom programs. */
  builtin_key: string | null;
}

export interface ProgramDay extends SyncedRow {
  program_id: string;
  weekday: number; // 0 = Sunday … 6 = Saturday (JS Date#getDay)
  template_id: string;
}

export type WorkoutStatus = "in_progress" | "completed";

export interface Workout extends SyncedRow {
  template_id: string | null;
  name: string | null;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
  status: WorkoutStatus;
}

export interface WorkoutExercise extends SyncedRow {
  workout_id: string;
  exercise_id: string;
  position: number;
  notes: string | null;
  superset_group: string | null;
  rest_sec: number | null;
}

export interface WorkoutSet extends SyncedRow {
  workout_exercise_id: string;
  workout_id: string;
  position: number;
  set_type: SetType;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  duration_sec: number | null;
  distance_m: number | null;
  completed_at: string | null;
}

export interface BodyMetric extends SyncedRow {
  date: string; // yyyy-MM-dd
  weight_kg: number | null;
  body_fat_pct: number | null;
  measurements: Partial<Record<MeasurementKey, number>>;
}

export const MEASUREMENT_KEYS = ["chest", "waist", "arm", "thigh"] as const;
export type MeasurementKey = (typeof MEASUREMENT_KEYS)[number];

export interface ProgressPhoto extends SyncedRow {
  date: string;
  pose: Pose;
  storage_path: string;
}

export interface NutritionLog extends SyncedRow {
  date: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

export type Tier = "free" | "premium";

export interface Subscription {
  user_id: string;
  tier: Tier;
  status: "active" | "canceled" | "expired" | "pending";
  provider: string | null;
  provider_ref: string | null;
  current_period_end: string | null;
  updated_at: string;
}
