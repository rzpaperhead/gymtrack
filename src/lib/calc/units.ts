import type { Unit } from "@/lib/types";

export const KG_PER_LB = 0.45359237;

export function kgToUnit(kg: number, unit: Unit): number {
  return unit === "kg" ? kg : kg / KG_PER_LB;
}

export function unitToKg(value: number, unit: Unit): number {
  return unit === "kg" ? value : value * KG_PER_LB;
}

/** Value to show in an input / label: kg to 0.01, lb to 0.1, trailing zeros trimmed. */
export function displayWeight(kg: number | null | undefined, unit: Unit): string {
  if (kg == null) return "";
  const v = kgToUnit(kg, unit);
  const rounded = unit === "kg" ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10;
  return String(rounded);
}

/** Parse a user-typed weight (accepts "," as decimal separator) into kg. */
export function parseWeightInput(raw: string, unit: Unit): number | null {
  const s = raw.trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  // Store with enough precision that lb → kg → lb round-trips cleanly.
  return Math.round(unitToKg(n, unit) * 10000) / 10000;
}

export function weightStep(unit: Unit): number {
  return unit === "kg" ? 2.5 : 5;
}
