"use client";

import { Lock, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { Card, LinkButton } from "@/components/common";
import { exerciseName, useExerciseCatalog } from "@/lib/catalog";
import { weeklyInsights, type Insight } from "@/lib/coach";
import { useEntitlements } from "@/lib/hooks";
import type { TrainingHistory } from "@/lib/history";

/** Home-screen "Asisten PT": a few prioritised training notes (Premium). */
export function CoachCard({ history, weeklyTarget }: { history: TrainingHistory; weeklyTarget: number }) {
  const t = useTranslations("coach");
  const locale = useLocale();
  const ent = useEntitlements();
  const catalog = useExerciseCatalog();
  const insights = useMemo(
    () =>
      catalog
        ? weeklyInsights({
            workouts: history.workouts,
            workoutExercises: history.workoutExercises,
            sets: history.sets,
            exercise: (id) => catalog.byId.get(id),
            weeklyTarget,
          })
        : [],
    [history, catalog, weeklyTarget],
  );

  const text = (i: Insight) => {
    switch (i.key) {
      case "stalled":
      case "progressing":
        return t(`insight.${i.key}`, { ...i, exercise: exerciseName(catalog?.byId.get(i.exerciseId), locale) });
      case "neglected":
        return t(i.days == null ? "insight.neglectedNever" : "insight.neglected", { group: t(`group.${i.group}`), days: i.days ?? 0 });
      default:
        return t(`insight.${i.key}`, i as never);
    }
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold uppercase text-muted-foreground">
        <Sparkles className="size-4 text-primary" aria-hidden /> {t("title")}
      </div>
      {ent.tier !== "premium" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("pitch")}</p>
          <LinkButton href="/premium" size="sm" variant="secondary">
            <Lock aria-hidden /> {t("unlock")}
          </LinkButton>
        </div>
      ) : insights.length ? (
        <ul className="space-y-2">
          {insights.map((i, n) => (
            <li key={n} className="flex gap-2 text-sm">
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              {text(i)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      )}
    </Card>
  );
}
