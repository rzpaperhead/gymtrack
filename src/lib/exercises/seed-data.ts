import type { Equipment, Exercise, ExerciseType, Muscle } from "@/lib/types";

/**
 * Deterministic UUID for built-in rows so the client bundle and the SQL seed
 * agree on ids. `prefix` must be a single hex char.
 */
export function builtinUuid(prefix: string, n: number): string {
  return `${prefix}0000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

type Row = [
  n: number,
  name_id: string,
  name_en: string,
  primary: Muscle,
  secondary: Muscle[],
  equipment: Equipment,
  type: ExerciseType,
  rest: number,
];

// APPEND ONLY. The first column becomes part of the id, never renumber.
const ROWS: Row[] = [
  // Chest
  [1, "Bench Press (Barbel)", "Bench Press (Barbell)", "chest", ["triceps", "shoulders"], "barbell", "weight_reps", 180],
  [2, "Incline Bench Press (Barbel)", "Incline Bench Press (Barbell)", "chest", ["shoulders", "triceps"], "barbell", "weight_reps", 150],
  [3, "Decline Bench Press (Barbel)", "Decline Bench Press (Barbell)", "chest", ["triceps"], "barbell", "weight_reps", 150],
  [4, "Bench Press (Dumbel)", "Bench Press (Dumbbell)", "chest", ["triceps", "shoulders"], "dumbbell", "weight_reps", 120],
  [5, "Incline Press (Dumbel)", "Incline Press (Dumbbell)", "chest", ["shoulders", "triceps"], "dumbbell", "weight_reps", 120],
  [6, "Fly (Dumbel)", "Fly (Dumbbell)", "chest", ["shoulders"], "dumbbell", "weight_reps", 90],
  [7, "Cable Crossover", "Cable Crossover", "chest", ["shoulders"], "cable", "weight_reps", 90],
  [8, "Chest Press (Mesin)", "Chest Press (Machine)", "chest", ["triceps", "shoulders"], "machine", "weight_reps", 90],
  [9, "Pec Deck (Mesin)", "Pec Deck (Machine)", "chest", [], "machine", "weight_reps", 90],
  [10, "Push Up", "Push Up", "chest", ["triceps", "shoulders"], "bodyweight", "bodyweight_reps", 60],
  [11, "Dips", "Dips", "chest", ["triceps", "shoulders"], "bodyweight", "bodyweight_reps", 120],
  [12, "Dips (Dibantu)", "Assisted Dip", "chest", ["triceps"], "machine", "assisted", 90],
  // Back
  [13, "Deadlift (Barbel)", "Deadlift (Barbell)", "back", ["hamstrings", "glutes", "lower_back", "traps"], "barbell", "weight_reps", 240],
  [14, "Barbell Row", "Barbell Row", "back", ["lats", "biceps"], "barbell", "weight_reps", 150],
  [15, "Pendlay Row", "Pendlay Row", "back", ["lats", "biceps"], "barbell", "weight_reps", 150],
  [16, "One Arm Row (Dumbel)", "One Arm Row (Dumbbell)", "lats", ["back", "biceps"], "dumbbell", "weight_reps", 90],
  [17, "Pull Up", "Pull Up", "lats", ["biceps", "back"], "bodyweight", "bodyweight_reps", 120],
  [18, "Chin Up", "Chin Up", "lats", ["biceps"], "bodyweight", "bodyweight_reps", 120],
  [19, "Pull Up (Dibantu)", "Assisted Pull Up", "lats", ["biceps"], "machine", "assisted", 90],
  [20, "Lat Pulldown (Kabel)", "Lat Pulldown (Cable)", "lats", ["biceps"], "cable", "weight_reps", 90],
  [21, "Seated Cable Row", "Seated Cable Row", "back", ["lats", "biceps"], "cable", "weight_reps", 90],
  [22, "T-Bar Row", "T-Bar Row", "back", ["lats", "biceps"], "barbell", "weight_reps", 120],
  [23, "Chest Supported Row (Mesin)", "Chest Supported Row (Machine)", "back", ["lats", "biceps"], "machine", "weight_reps", 90],
  [24, "Straight Arm Pulldown", "Straight Arm Pulldown", "lats", [], "cable", "weight_reps", 60],
  [25, "Shrug (Dumbel)", "Shrug (Dumbbell)", "traps", [], "dumbbell", "weight_reps", 60],
  [26, "Shrug (Barbel)", "Shrug (Barbell)", "traps", [], "barbell", "weight_reps", 90],
  [27, "Back Extension", "Back Extension", "lower_back", ["glutes", "hamstrings"], "bodyweight", "bodyweight_reps", 60],
  [28, "Rack Pull", "Rack Pull", "back", ["traps", "lower_back"], "barbell", "weight_reps", 180],
  // Shoulders
  [29, "Overhead Press (Barbel)", "Overhead Press (Barbell)", "shoulders", ["triceps"], "barbell", "weight_reps", 150],
  [30, "Shoulder Press (Dumbel)", "Shoulder Press (Dumbbell)", "shoulders", ["triceps"], "dumbbell", "weight_reps", 120],
  [31, "Arnold Press", "Arnold Press", "shoulders", ["triceps"], "dumbbell", "weight_reps", 90],
  [32, "Shoulder Press (Mesin)", "Shoulder Press (Machine)", "shoulders", ["triceps"], "machine", "weight_reps", 90],
  [33, "Lateral Raise (Dumbel)", "Lateral Raise (Dumbbell)", "shoulders", [], "dumbbell", "weight_reps", 60],
  [34, "Lateral Raise (Kabel)", "Lateral Raise (Cable)", "shoulders", [], "cable", "weight_reps", 60],
  [35, "Front Raise (Dumbel)", "Front Raise (Dumbbell)", "shoulders", [], "dumbbell", "weight_reps", 60],
  [36, "Rear Delt Fly (Dumbel)", "Rear Delt Fly (Dumbbell)", "shoulders", ["back"], "dumbbell", "weight_reps", 60],
  [37, "Reverse Pec Deck", "Reverse Pec Deck", "shoulders", ["back"], "machine", "weight_reps", 60],
  [38, "Face Pull", "Face Pull", "shoulders", ["traps", "back"], "cable", "weight_reps", 60],
  [39, "Upright Row", "Upright Row", "shoulders", ["traps"], "barbell", "weight_reps", 90],
  // Arms
  [40, "Bicep Curl (Barbel)", "Bicep Curl (Barbell)", "biceps", ["forearms"], "barbell", "weight_reps", 60],
  [41, "Bicep Curl (Dumbel)", "Bicep Curl (Dumbbell)", "biceps", ["forearms"], "dumbbell", "weight_reps", 60],
  [42, "Hammer Curl", "Hammer Curl", "biceps", ["forearms"], "dumbbell", "weight_reps", 60],
  [43, "Preacher Curl", "Preacher Curl", "biceps", [], "ez_bar", "weight_reps", 60],
  [44, "Incline Curl (Dumbel)", "Incline Curl (Dumbbell)", "biceps", [], "dumbbell", "weight_reps", 60],
  [45, "Cable Curl", "Cable Curl", "biceps", ["forearms"], "cable", "weight_reps", 60],
  [46, "EZ Bar Curl", "EZ Bar Curl", "biceps", ["forearms"], "ez_bar", "weight_reps", 60],
  [47, "Triceps Pushdown (Kabel)", "Triceps Pushdown (Cable)", "triceps", [], "cable", "weight_reps", 60],
  [48, "Overhead Triceps Extension (Kabel)", "Overhead Triceps Extension (Cable)", "triceps", [], "cable", "weight_reps", 60],
  [49, "Skull Crusher", "Skull Crusher", "triceps", [], "ez_bar", "weight_reps", 90],
  [50, "Close Grip Bench Press", "Close Grip Bench Press", "triceps", ["chest", "shoulders"], "barbell", "weight_reps", 120],
  [51, "Overhead Triceps Extension (Dumbel)", "Overhead Triceps Extension (Dumbbell)", "triceps", [], "dumbbell", "weight_reps", 60],
  [52, "Wrist Curl", "Wrist Curl", "forearms", [], "dumbbell", "weight_reps", 45],
  // Legs
  [53, "Squat (Barbel)", "Squat (Barbell)", "quads", ["glutes", "hamstrings", "lower_back"], "barbell", "weight_reps", 210],
  [54, "Front Squat", "Front Squat", "quads", ["glutes", "abs"], "barbell", "weight_reps", 180],
  [55, "Goblet Squat", "Goblet Squat", "quads", ["glutes"], "dumbbell", "weight_reps", 90],
  [56, "Leg Press", "Leg Press", "quads", ["glutes", "hamstrings"], "machine", "weight_reps", 120],
  [57, "Hack Squat (Mesin)", "Hack Squat (Machine)", "quads", ["glutes"], "machine", "weight_reps", 120],
  [58, "Leg Extension", "Leg Extension", "quads", [], "machine", "weight_reps", 60],
  [59, "Bulgarian Split Squat", "Bulgarian Split Squat", "quads", ["glutes", "hamstrings"], "dumbbell", "weight_reps", 90],
  [60, "Lunge (Dumbel)", "Lunge (Dumbbell)", "quads", ["glutes", "hamstrings"], "dumbbell", "weight_reps", 90],
  [61, "Romanian Deadlift (Barbel)", "Romanian Deadlift (Barbell)", "hamstrings", ["glutes", "lower_back"], "barbell", "weight_reps", 150],
  [62, "Romanian Deadlift (Dumbel)", "Romanian Deadlift (Dumbbell)", "hamstrings", ["glutes"], "dumbbell", "weight_reps", 120],
  [63, "Lying Leg Curl", "Lying Leg Curl", "hamstrings", [], "machine", "weight_reps", 60],
  [64, "Seated Leg Curl", "Seated Leg Curl", "hamstrings", [], "machine", "weight_reps", 60],
  [65, "Hip Thrust (Barbel)", "Hip Thrust (Barbell)", "glutes", ["hamstrings"], "barbell", "weight_reps", 120],
  [66, "Glute Bridge", "Glute Bridge", "glutes", ["hamstrings"], "bodyweight", "bodyweight_reps", 60],
  [67, "Hip Adduction (Mesin)", "Hip Adduction (Machine)", "adductors", [], "machine", "weight_reps", 60],
  [68, "Hip Abduction (Mesin)", "Hip Abduction (Machine)", "glutes", [], "machine", "weight_reps", 60],
  [69, "Standing Calf Raise", "Standing Calf Raise", "calves", [], "machine", "weight_reps", 60],
  [70, "Seated Calf Raise", "Seated Calf Raise", "calves", [], "machine", "weight_reps", 60],
  [71, "Sumo Deadlift", "Sumo Deadlift", "glutes", ["quads", "hamstrings", "back"], "barbell", "weight_reps", 210],
  [72, "Step Up (Dumbel)", "Step Up (Dumbbell)", "quads", ["glutes"], "dumbbell", "weight_reps", 90],
  // Core
  [73, "Plank", "Plank", "abs", ["obliques"], "bodyweight", "time", 60],
  [74, "Crunch", "Crunch", "abs", [], "bodyweight", "bodyweight_reps", 45],
  [75, "Hanging Leg Raise", "Hanging Leg Raise", "abs", ["obliques"], "bodyweight", "bodyweight_reps", 60],
  [76, "Cable Crunch", "Cable Crunch", "abs", [], "cable", "weight_reps", 60],
  [77, "Russian Twist", "Russian Twist", "obliques", ["abs"], "bodyweight", "bodyweight_reps", 45],
  [78, "Ab Wheel Rollout", "Ab Wheel Rollout", "abs", ["lower_back"], "other", "bodyweight_reps", 60],
  [79, "Side Plank", "Side Plank", "obliques", ["abs"], "bodyweight", "time", 45],
  // Full body & cardio
  [80, "Kettlebell Swing", "Kettlebell Swing", "glutes", ["hamstrings", "lower_back"], "kettlebell", "weight_reps", 60],
  [81, "Farmer's Walk", "Farmer's Walk", "forearms", ["traps", "full_body"], "dumbbell", "distance_time", 90],
  [82, "Treadmill", "Treadmill", "cardio", [], "cardio_machine", "distance_time", 0],
  [83, "Sepeda Statis", "Stationary Bike", "cardio", [], "cardio_machine", "distance_time", 0],
  [84, "Rowing Machine", "Rowing Machine", "cardio", ["back"], "cardio_machine", "distance_time", 0],
  [85, "Lompat Tali", "Jump Rope", "cardio", ["calves"], "other", "time", 60],
];

export const BUILTIN_EXERCISES: Exercise[] = ROWS.map(
  ([n, name_id, name_en, primary_muscle, secondary_muscles, equipment, type, default_rest_sec]) => ({
    id: builtinUuid("e", n),
    owner_id: null,
    name_id,
    name_en,
    primary_muscle,
    secondary_muscles,
    equipment,
    type,
    default_rest_sec,
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
  }),
);

/** Lookup by the stable seed number (used by built-in templates). */
export const EX = (n: number) => builtinUuid("e", n);
