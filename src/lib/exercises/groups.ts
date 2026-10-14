import type { Exercise, Muscle } from "@/lib/types";

/** How the exercise list is grouped for browsing (by primary muscle). */
export const MUSCLE_GROUPS = [
  { key: "chest", parts: [{ key: "chest", muscles: ["chest"] }] },
  { key: "back", parts: [{ key: "back", muscles: ["back", "lats", "traps", "lower_back"] }] },
  { key: "shoulders", parts: [{ key: "shoulders", muscles: ["shoulders"] }] },
  {
    key: "arms",
    parts: [
      { key: "biceps", muscles: ["biceps"] },
      { key: "triceps", muscles: ["triceps"] },
      { key: "forearms", muscles: ["forearms"] },
    ],
  },
  { key: "legs", parts: [{ key: "legs", muscles: ["quads", "hamstrings", "glutes", "calves", "adductors"] }] },
  { key: "core", parts: [{ key: "core", muscles: ["abs", "obliques"] }] },
  { key: "cardio", parts: [{ key: "cardio", muscles: ["cardio", "full_body"] }] },
] as const satisfies readonly { key: string; parts: readonly { key: string; muscles: readonly Muscle[] }[] }[];

export type GroupKey = (typeof MUSCLE_GROUPS)[number]["key"];

export interface GroupedSection {
  group: GroupKey;
  part: string;
  /** Show a sub-heading (e.g. Biceps/Triceps inside Arms). */
  isSub: boolean;
  items: Exercise[];
}

/** Split an (already filtered & sorted) list into group → part sections, skipping empty ones. */
export function groupExercises(list: Exercise[], only?: GroupKey | ""): GroupedSection[] {
  const out: GroupedSection[] = [];
  for (const g of MUSCLE_GROUPS) {
    if (only && g.key !== only) continue;
    for (const p of g.parts) {
      const items = list.filter((e) => (p.muscles as readonly Muscle[]).includes(e.primary_muscle));
      if (items.length) out.push({ group: g.key, part: p.key, isSub: g.parts.length > 1, items });
    }
  }
  return out;
}
