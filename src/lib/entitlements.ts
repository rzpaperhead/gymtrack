import type { Subscription, Tier } from "@/lib/types";

/**
 * Single source of truth for what each tier can do. Server-side limits in
 * supabase/migrations/0003_entitlements.sql mirror the numeric limits here —
 * change both together.
 */

export type ChartKey =
  | "e1rm"
  | "volume_total"
  | "volume_muscle"
  | "heatmap"
  | "bodyweight"
  | "measurements"
  | "nutrition_compliance";

export interface Entitlements {
  tier: Tier;
  maxCustomTemplates: number; // Infinity = unlimited
  maxCustomExercises: number;
  maxProgressPhotos: number;
  customPrograms: boolean;
  csvExport: boolean;
  charts: ReadonlySet<ChartKey>;
  /** How far back charts may look, in days. Infinity = full history. */
  chartHistoryDays: number;
}

const FREE: Entitlements = {
  tier: "free",
  maxCustomTemplates: 3,
  maxCustomExercises: 5,
  maxProgressPhotos: 6,
  customPrograms: false,
  csvExport: false,
  charts: new Set<ChartKey>(["e1rm", "volume_total", "bodyweight"]),
  chartHistoryDays: 90,
};

const PREMIUM: Entitlements = {
  tier: "premium",
  maxCustomTemplates: Infinity,
  maxCustomExercises: Infinity,
  maxProgressPhotos: Infinity,
  customPrograms: true,
  csvExport: true,
  charts: new Set<ChartKey>(["e1rm", "volume_total", "volume_muscle", "heatmap", "bodyweight", "measurements", "nutrition_compliance"]),
  chartHistoryDays: Infinity,
};

export function tierOf(sub: Pick<Subscription, "tier" | "status" | "current_period_end"> | null | undefined, now = new Date()): Tier {
  if (!sub || sub.tier !== "premium") return "free";
  if (sub.status !== "active" && sub.status !== "canceled") return "free";
  // A canceled subscription stays premium until the paid period ends.
  if (sub.current_period_end && new Date(sub.current_period_end) < now) return "free";
  return "premium";
}

export function entitlementsFor(tier: Tier): Entitlements {
  return tier === "premium" ? PREMIUM : FREE;
}

export type LimitedResource = "templates" | "exercises" | "photos";

/** Whether one more item may be created. Existing items are never blocked. */
export function canCreate(e: Entitlements, resource: LimitedResource, currentCount: number): boolean {
  const max =
    resource === "templates" ? e.maxCustomTemplates : resource === "exercises" ? e.maxCustomExercises : e.maxProgressPhotos;
  return currentCount < max;
}

/** Pricing is config, not code: amounts in IDR. Final prices are still open (BRIEF §12). */
export const PRICING = {
  currency: "IDR",
  monthly: Number(process.env.NEXT_PUBLIC_PRICE_MONTHLY_IDR ?? 39000),
  yearly: Number(process.env.NEXT_PUBLIC_PRICE_YEARLY_IDR ?? 299000),
  trialDays: Number(process.env.NEXT_PUBLIC_TRIAL_DAYS ?? 0),
} as const;

export type Plan = "monthly" | "yearly";
