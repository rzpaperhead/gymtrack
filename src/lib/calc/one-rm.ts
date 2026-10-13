/** Reps above this are too inaccurate for an e1RM estimate and are ignored. */
export const E1RM_MAX_REPS = 12;

/**
 * Estimated one-rep max using the Epley formula: `w × (1 + reps / 30)`.
 * A single rep *is* the 1RM, so reps = 1 returns the weight itself.
 * Returns null when the set can't produce a meaningful estimate.
 */
export function epley1RM(weightKg: number | null | undefined, reps: number | null | undefined): number | null {
  if (weightKg == null || reps == null) return null;
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps)) return null;
  if (weightKg <= 0 || reps < 1 || reps > E1RM_MAX_REPS) return null;
  if (reps === 1) return round1(weightKg);
  return round1(weightKg * (1 + reps / 30));
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
