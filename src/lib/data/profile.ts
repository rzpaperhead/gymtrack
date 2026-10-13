import { db } from "@/lib/db/local";
import { nowIso, requireUserId } from "@/lib/db/session";
import { saveRow } from "@/lib/db/write";
import type { Profile } from "@/lib/types";

export function defaultProfile(id: string, locale: Profile["locale"] = "id"): Profile {
  const now = nowIso();
  return {
    id,
    display_name: "",
    locale,
    unit: "kg",
    goal: "general",
    weekly_target: 3,
    default_rest_sec: 120,
    theme: "dark",
    bodyweight_start_kg: null,
    calorie_target: null,
    protein_target: null,
    carbs_target: null,
    fat_target: null,
    onboarded_at: null,
    created_at: now,
    updated_at: now,
  };
}

export async function getProfile(): Promise<Profile | undefined> {
  return db.profiles.get(requireUserId());
}

export async function updateProfile(patch: Partial<Profile>) {
  const id = requireUserId();
  const cur = (await db.profiles.get(id)) ?? defaultProfile(id);
  await saveRow("profiles", { ...cur, ...patch, id });
}
