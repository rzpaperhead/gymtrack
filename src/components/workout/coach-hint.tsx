"use client";

import { Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useProfile } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { REP_RANGE, suggestNext } from "@/lib/coach";
import { kgToUnit } from "@/lib/calc/units";
import { useEntitlements, useUnit } from "@/lib/hooks";
import type { Exercise, WorkoutSet } from "@/lib/types";

/** "PT says": next-session target for one exercise (Premium). */
export function CoachHint({
  exercise,
  history,
  onApply,
}: {
  exercise: Exercise;
  history: WorkoutSet[][];
  onApply: (weightKg: number, reps: number) => void;
}) {
  const t = useTranslations("coach");
  const f = useFormatter();
  const unit = useUnit();
  const profile = useProfile();
  const ent = useEntitlements();
  if ((exercise.category ?? "strength") !== "strength") return null;
  const s = suggestNext(exercise, history, REP_RANGE[profile?.goal ?? "general"], unit);
  if (!s) return null;
  if (ent.tier !== "premium") {
    return (
      <Link href="/premium" className="mb-2 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
        <Lock className="size-3.5" aria-hidden /> {t("teaser")}
      </Link>
    );
  }
  const w = `${f.number(kgToUnit(s.weight_kg, unit), { maximumFractionDigits: 1 })} ${unit}`;
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg border border-primary/40 bg-accent/30 px-3 py-2">
      <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">{t("label")}:</span> {t(`next.${s.kind}`, { weight: w, reps: s.reps })}
      </p>
      <Button size="xs" variant="secondary" onClick={() => onApply(s.weight_kg, s.reps)}>
        {t("apply")}
      </Button>
    </div>
  );
}
