import { z } from "zod";
import { alive, db } from "@/lib/db/local";
import { newId, nowIso, requireUserId } from "@/lib/db/session";
import { saveRow, softDelete } from "@/lib/db/write";
import { EQUIPMENT, EXERCISE_TYPES, MUSCLES, type Exercise } from "@/lib/types";

export const customExerciseSchema = z.object({
  name: z.string().trim().min(1).max(80),
  primary_muscle: z.enum(MUSCLES),
  secondary_muscles: z.array(z.enum(MUSCLES)),
  equipment: z.enum(EQUIPMENT),
  type: z.enum(EXERCISE_TYPES),
  default_rest_sec: z.number().int().min(0).max(900),
});
export type CustomExerciseInput = z.infer<typeof customExerciseSchema>;

export async function countCustomExercises() {
  return (await db.exercises.toArray()).filter(alive).length;
}

/** Custom exercises have one user-chosen name, used for both languages. */
export async function saveCustomExercise(input: CustomExerciseInput, id?: string) {
  const data = customExerciseSchema.parse(input);
  const row: Exercise = {
    id: id ?? newId(),
    owner_id: requireUserId(),
    category: "strength",
    name_id: data.name,
    name_en: data.name,
    primary_muscle: data.primary_muscle,
    secondary_muscles: data.secondary_muscles.filter((m) => m !== data.primary_muscle),
    equipment: data.equipment,
    type: data.type,
    default_rest_sec: data.default_rest_sec,
    updated_at: nowIso(),
    deleted_at: null,
  };
  await saveRow("exercises", row);
  return row.id;
}

export async function deleteCustomExercise(id: string) {
  await softDelete("exercises", [id]);
}
