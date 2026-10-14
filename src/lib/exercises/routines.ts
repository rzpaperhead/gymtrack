import { EX } from "@/lib/exercises/seed-data";
import type { Muscle } from "@/lib/types";

/**
 * Suggested warm-up (dynamic) and cool-down (static) routines for the muscles
 * trained in a session. Built-in exercise numbers from seed-data.ts.
 */

const UPPER_PUSH: Muscle[] = ["chest", "shoulders", "triceps"];
const UPPER_PULL: Muscle[] = ["back", "lats", "traps", "biceps", "forearms"];
const LOWER: Muscle[] = ["quads", "hamstrings", "glutes", "calves", "adductors", "lower_back"];

const has = (ms: Set<Muscle>, list: Muscle[]) => list.some((m) => ms.has(m));

export function warmupFor(muscles: Muscle[]): string[] {
  const ms = new Set(muscles);
  const out = [86]; // jumping jack: raise heart rate first
  if (has(ms, LOWER)) out.push(90, 88, 91, 92);
  if (has(ms, UPPER_PUSH)) out.push(87, 99);
  if (has(ms, UPPER_PULL)) out.push(95, 96);
  if (out.length < 4) out.push(87, 93, 98);
  return [...new Set(out)].slice(0, 6).map(EX);
}

const STRETCH_FOR: Partial<Record<Muscle, number>> = {
  chest: 100,
  lats: 101,
  back: 101,
  hamstrings: 102,
  quads: 103,
  glutes: 104,
  shoulders: 105,
  triceps: 106,
  calves: 107,
  adductors: 108,
  abs: 109,
  biceps: 111,
  lower_back: 112,
  traps: 113,
};

export function cooldownFor(muscles: Muscle[]): string[] {
  const out: number[] = [];
  for (const m of muscles) {
    const s = STRETCH_FOR[m];
    if (s && !out.includes(s)) out.push(s);
  }
  for (const d of [101, 102, 105, 109]) if (out.length < 4 && !out.includes(d)) out.push(d);
  return out.slice(0, 6).map(EX);
}

/** Sensible single-set defaults for warm-up / stretch items. */
export const ROUTINE_DEFAULTS = { duration_sec: 30, reps: 10 } as const;
