import { alive, db } from "@/lib/db/local";
import { newId, nowIso, requireUserId } from "@/lib/db/session";
import { saveRow, softDelete } from "@/lib/db/write";
import type { BodyMetric, NutritionLog } from "@/lib/types";

/**
 * Date-keyed rows (one per day). Two offline devices may each create a row for
 * the same day; readers pick the most recently updated one.
 */
export function latestPerDate<T extends { date: string; updated_at: string; deleted_at: string | null }>(rows: T[]): T[] {
  const m = new Map<string, T>();
  for (const r of rows) {
    if (!alive(r)) continue;
    const cur = m.get(r.date);
    if (!cur || r.updated_at > cur.updated_at) m.set(r.date, r);
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function saveBodyMetric(date: string, patch: Partial<Pick<BodyMetric, "weight_kg" | "body_fat_pct" | "measurements">>) {
  const existing = latestPerDate(await db.body_metrics.where("date").equals(date).toArray())[0];
  const row: BodyMetric = existing
    ? { ...existing, ...patch, measurements: { ...existing.measurements, ...(patch.measurements ?? {}) } }
    : {
        id: newId(),
        user_id: requireUserId(),
        date,
        weight_kg: null,
        body_fat_pct: null,
        measurements: {},
        updated_at: nowIso(),
        deleted_at: null,
        ...patch,
      };
  await saveRow("body_metrics", row);
}

export async function deleteBodyMetric(id: string) {
  await softDelete("body_metrics", [id]);
}

export async function saveNutrition(date: string, values: Pick<NutritionLog, "calories" | "protein_g" | "carbs_g" | "fat_g">) {
  const existing = latestPerDate(await db.nutrition_logs.where("date").equals(date).toArray())[0];
  const row: NutritionLog = existing
    ? { ...existing, ...values }
    : { id: newId(), user_id: requireUserId(), date, ...values, updated_at: nowIso(), deleted_at: null };
  await saveRow("nutrition_logs", row);
}

export async function deleteNutrition(id: string) {
  await softDelete("nutrition_logs", [id]);
}
