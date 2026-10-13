import { getTemplate } from "@/lib/catalog";
import { alive, db } from "@/lib/db/local";
import { newId, nowIso, requireUserId } from "@/lib/db/session";
import { saveRow, saveRows, softDelete } from "@/lib/db/write";
import type { Template, TemplateExercise } from "@/lib/types";

export interface TemplateItemInput {
  id?: string;
  exercise_id: string;
  target_sets: number;
  target_reps_min: number | null;
  target_reps_max: number | null;
  rest_sec: number | null;
  superset_group: string | null;
}

export async function countCustomTemplates(): Promise<number> {
  return (await db.templates.toArray()).filter(alive).length;
}

/** Create or replace a user template and its items. Returns the template id. */
export async function saveTemplate(input: { id?: string; name: string; notes?: string | null; items: TemplateItemInput[] }) {
  const userId = requireUserId();
  const id = input.id ?? newId();
  const existing = input.id ? await db.templates.get(input.id) : undefined;
  const tpl: Template = {
    id,
    user_id: userId,
    name: input.name.trim(),
    name_en: null,
    notes: input.notes ?? existing?.notes ?? null,
    updated_at: nowIso(),
    deleted_at: null,
  };
  const items: TemplateExercise[] = input.items.map((it, position) => ({
    id: it.id ?? newId(),
    user_id: userId,
    template_id: id,
    exercise_id: it.exercise_id,
    position,
    target_sets: it.target_sets,
    target_reps_min: it.target_reps_min,
    target_reps_max: it.target_reps_max,
    rest_sec: it.rest_sec,
    superset_group: it.superset_group,
    updated_at: nowIso(),
    deleted_at: null,
  }));
  await saveRow("templates", tpl);
  if (existing) {
    const keep = new Set(items.map((i) => i.id));
    const old = (await db.template_exercises.where("template_id").equals(id).toArray()).filter(alive);
    await softDelete("template_exercises", old.filter((o) => !keep.has(o.id)).map((o) => o.id));
  }
  await saveRows("template_exercises", items);
  return id;
}

export async function deleteTemplate(id: string) {
  const items = await db.template_exercises.where("template_id").equals(id).toArray();
  await softDelete("template_exercises", items.map((i) => i.id));
  await softDelete("templates", [id]);
}

/** Copy any template (e.g. a built-in) into an editable user template. */
export async function duplicateTemplate(id: string, name: string) {
  const src = await getTemplate(id);
  if (!src) throw new Error("Template not found");
  return saveTemplate({
    name,
    notes: src.template.notes,
    items: src.items.map(({ exercise_id, target_sets, target_reps_min, target_reps_max, rest_sec, superset_group }) => ({
      exercise_id,
      target_sets,
      target_reps_min,
      target_reps_max,
      rest_sec,
      superset_group,
    })),
  });
}

/** Turn a finished session into a template: same exercises, set counts and rep range. */
export async function saveWorkoutAsTemplate(workoutId: string, name: string) {
  const wes = (await db.workout_exercises.where("workout_id").equals(workoutId).toArray())
    .filter(alive)
    .sort((a, b) => a.position - b.position);
  const sets = (await db.sets.where("workout_id").equals(workoutId).toArray()).filter(alive);
  return saveTemplate({
    name,
    items: wes.map((we) => {
      const working = sets.filter((s) => s.workout_exercise_id === we.id && s.set_type !== "warmup");
      const reps = working.map((s) => s.reps).filter((r): r is number => r != null);
      return {
        exercise_id: we.exercise_id,
        target_sets: Math.max(1, working.length),
        target_reps_min: reps.length ? Math.min(...reps) : null,
        target_reps_max: reps.length ? Math.max(...reps) : null,
        rest_sec: we.rest_sec,
        superset_group: we.superset_group,
      };
    }),
  });
}
