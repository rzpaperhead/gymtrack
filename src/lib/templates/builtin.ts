import { builtinUuid, EX } from "@/lib/exercises/seed-data";
import type { Template, TemplateExercise } from "@/lib/types";

const TS = "2026-01-01T00:00:00.000Z";

type Item = [exercise: number, sets: number, repsMin: number, repsMax: number, rest: number, superset?: string];

interface BuiltinTemplateDef {
  n: number;
  name_id: string;
  name_en: string;
  items: Item[];
}

// APPEND ONLY: `n` is part of the id.
const DEFS: BuiltinTemplateDef[] = [
  {
    n: 1,
    name_id: "Full Body A",
    name_en: "Full Body A",
    items: [
      [53, 3, 5, 8, 180],
      [1, 3, 5, 8, 180],
      [14, 3, 6, 10, 150],
      [33, 2, 10, 15, 60],
      [73, 2, 30, 60, 60],
    ],
  },
  {
    n: 2,
    name_id: "Full Body B",
    name_en: "Full Body B",
    items: [
      [13, 3, 3, 6, 210],
      [29, 3, 6, 10, 150],
      [20, 3, 8, 12, 90],
      [59, 2, 8, 12, 90],
      [41, 2, 10, 15, 60, "a"],
      [47, 2, 10, 15, 60, "a"],
    ],
  },
  {
    n: 3,
    name_id: "Upper A",
    name_en: "Upper A",
    items: [
      [1, 4, 5, 8, 180],
      [14, 4, 6, 10, 150],
      [30, 3, 8, 12, 120],
      [20, 3, 8, 12, 90],
      [40, 2, 10, 15, 60, "a"],
      [47, 2, 10, 15, 60, "a"],
    ],
  },
  {
    n: 4,
    name_id: "Lower A",
    name_en: "Lower A",
    items: [
      [53, 4, 5, 8, 210],
      [61, 3, 8, 12, 150],
      [56, 3, 10, 15, 120],
      [63, 3, 10, 15, 60],
      [69, 3, 10, 15, 60],
    ],
  },
  {
    n: 5,
    name_id: "Upper B",
    name_en: "Upper B",
    items: [
      [29, 4, 5, 8, 180],
      [17, 4, 6, 10, 150],
      [5, 3, 8, 12, 120],
      [21, 3, 8, 12, 90],
      [33, 3, 12, 15, 60],
      [42, 2, 10, 15, 60],
    ],
  },
  {
    n: 6,
    name_id: "Lower B",
    name_en: "Lower B",
    items: [
      [13, 3, 3, 6, 240],
      [54, 3, 6, 10, 180],
      [65, 3, 8, 12, 120],
      [64, 3, 10, 15, 60],
      [75, 3, 10, 15, 60],
    ],
  },
  {
    n: 7,
    name_id: "Push",
    name_en: "Push",
    items: [
      [1, 4, 5, 8, 180],
      [30, 3, 8, 12, 120],
      [5, 3, 8, 12, 90],
      [33, 3, 12, 15, 60],
      [47, 3, 10, 15, 60, "a"],
      [48, 3, 10, 15, 60, "a"],
    ],
  },
  {
    n: 8,
    name_id: "Pull",
    name_en: "Pull",
    items: [
      [13, 3, 3, 6, 210],
      [17, 3, 6, 10, 150],
      [21, 3, 8, 12, 90],
      [38, 3, 12, 15, 60],
      [42, 3, 10, 12, 60, "a"],
      [41, 3, 10, 12, 60, "a"],
    ],
  },
  {
    n: 9,
    name_id: "Legs",
    name_en: "Legs",
    items: [
      [53, 4, 5, 8, 210],
      [61, 3, 8, 12, 150],
      [56, 3, 10, 15, 120],
      [58, 3, 12, 15, 60],
      [63, 3, 10, 15, 60],
      [69, 4, 10, 15, 60],
    ],
  },
];

export const BUILTIN_TEMPLATES: Template[] = DEFS.map((d) => ({
  id: builtinUuid("f", d.n),
  user_id: null,
  name: d.name_id,
  name_en: d.name_en,
  notes: null,
  updated_at: TS,
  deleted_at: null,
}));

export const BUILTIN_TEMPLATE_EXERCISES: TemplateExercise[] = DEFS.flatMap((d) =>
  d.items.map(([ex, sets, min, max, rest, ss], i) => ({
    id: builtinUuid("d", d.n * 100 + i),
    user_id: null,
    template_id: builtinUuid("f", d.n),
    exercise_id: EX(ex),
    position: i,
    target_sets: sets,
    target_reps_min: min,
    target_reps_max: max,
    rest_sec: rest,
    superset_group: ss ?? null,
    updated_at: TS,
    deleted_at: null,
  })),
);

const T = (n: number) => builtinUuid("f", n);

export interface BuiltinProgram {
  key: string;
  name_id: string;
  name_en: string;
  days_per_week: number;
  /** weekday (0 = Sun) → template id */
  schedule: Record<number, string>;
}

export const BUILTIN_PROGRAMS: BuiltinProgram[] = [
  {
    key: "full_body_3",
    name_id: "Full Body 3x",
    name_en: "Full Body 3x",
    days_per_week: 3,
    schedule: { 1: T(1), 3: T(2), 5: T(1) },
  },
  {
    key: "upper_lower_4",
    name_id: "Upper/Lower 4x",
    name_en: "Upper/Lower 4x",
    days_per_week: 4,
    schedule: { 1: T(3), 2: T(4), 4: T(5), 5: T(6) },
  },
  {
    key: "ppl_6",
    name_id: "Push/Pull/Legs 6x",
    name_en: "Push/Pull/Legs 6x",
    days_per_week: 6,
    schedule: { 1: T(7), 2: T(8), 3: T(9), 4: T(7), 5: T(8), 6: T(9) },
  },
];
