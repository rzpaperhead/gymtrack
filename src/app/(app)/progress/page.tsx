"use client";

import { subDays } from "date-fns";
import { Flame, Trophy } from "lucide-react";
import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { BadgesSection, PeriodSummaryCard } from "@/components/achievements";
import { Heatmap, HorizontalBars, LineTrend, WeeklyBars } from "@/components/charts";
import { Card, EmptyState, NativeSelect, PageHeader, PaywallCard, Section, Stat } from "@/components/common";
import { useProfile } from "@/components/providers/auth-provider";
import { exerciseName, useExerciseCatalog } from "@/lib/catalog";
import { epley1RM } from "@/lib/calc/one-rm";
import { computeRecords } from "@/lib/calc/prs";
import { dateKey, volumeByMuscle, weeklyConsistency, weeklyVolume, workoutsPerDay } from "@/lib/calc/stats";
import { kgToUnit } from "@/lib/calc/units";
import { useEntitlements, useUnit } from "@/lib/hooks";
import { useTrainingHistory } from "@/lib/history";

export default function ProgressPage() {
  const t = useTranslations();
  const f = useFormatter();
  const locale = useLocale();
  const unit = useUnit();
  const profile = useProfile();
  const ent = useEntitlements();
  const history = useTrainingHistory();
  const catalog = useExerciseCatalog();
  const [exerciseId, setExerciseId] = useState("");

  const limited = Number.isFinite(ent.chartHistoryDays);
  const cutoff = limited ? dateKey(subDays(new Date(), ent.chartHistoryDays)) : "";

  const derived = useMemo(() => {
    if (!history || !catalog) return null;
    const exOfWe = new Map(history.workoutExercises.map((we) => [we.id, we.exercise_id]));
    const sets = history.sets
      .filter((s) => s.completed_at)
      .map((s) => ({ ...s, exercise_id: exOfWe.get(s.workout_exercise_id)! }))
      .filter((s) => s.exercise_id);
    const inRange = sets.filter((s) => !cutoff || dateKey(s.completed_at!) >= cutoff);

    // e1RM series per exercise
    const e1rm = new Map<string, Map<string, number>>();
    for (const s of inRange) {
      if (s.set_type === "warmup") continue;
      const v = epley1RM(s.weight_kg, s.reps);
      if (v == null) continue;
      const m = e1rm.get(s.exercise_id) ?? new Map<string, number>();
      const d = dateKey(s.completed_at!);
      m.set(d, Math.max(m.get(d) ?? 0, v));
      e1rm.set(s.exercise_id, m);
    }
    const e1rmExercises = [...e1rm.entries()].sort((a, b) => b[1].size - a[1].size).map(([id]) => id);

    const weeks = limited ? Math.ceil(ent.chartHistoryDays / 7) : 26;
    const weekly = weeklyVolume(inRange, Math.min(weeks, 26)).map((w) => ({ ...w, volume: Math.round(kgToUnit(w.volume, unit)) }));
    const recent = sets.filter((s) => dateKey(s.completed_at!) >= dateKey(subDays(new Date(), 28)));
    const muscles = Object.entries(volumeByMuscle(recent, (id) => catalog.byId.get(id)?.primary_muscle))
      .map(([m, v]) => ({ name: t(`muscles.${m}` as "muscles.chest"), value: Math.round(kgToUnit(v, unit)) }))
      .sort((a, b) => b.value - a.value);

    const best = computeRecords(sets, (id) => catalog.byId.get(id)?.type)
      .filter((r) => r.record_type === "max_e1rm" || r.record_type === "max_reps" || r.record_type === "max_duration")
      .sort((a, b) => b.achieved_at.localeCompare(a.achieved_at))
      .slice(0, 8);

    return { e1rm, e1rmExercises, weekly, muscles, best };
  }, [history, catalog, cutoff, limited, ent.chartHistoryDays, unit, t]);

  if (!history || !derived || !catalog) return null;

  const consistency = weeklyConsistency(history.workouts.map((w) => w.started_at), profile?.weekly_target ?? 3);
  const selected = exerciseId || derived.e1rmExercises[0] || "";
  const series = [...(derived.e1rm.get(selected)?.entries() ?? [])]
    .sort()
    .map(([date, v]) => ({ date, value: Math.round(kgToUnit(v, unit) * 10) / 10 }));

  return (
    <div className="space-y-6">
      <PageHeader title={t("progress.title")} />

      <div className="grid grid-cols-3 gap-2">
        <Stat label={t("progress.streak")} value={<span className="flex items-center gap-1"><Flame className="size-6 text-primary" aria-hidden />{consistency.currentStreak}</span>} sub={t("progress.weeks", { count: consistency.currentStreak })} />
        <Stat label={t("progress.bestStreak")} value={consistency.bestStreak} sub={t("progress.weeks", { count: consistency.bestStreak })} />
        <Stat label={t("home.thisWeek")} value={`${consistency.thisWeekCount}/${consistency.target}`} />
      </div>

      {!history.rows.length && <EmptyState>{t("progress.noData")}</EmptyState>}
      {history.rows.length > 0 && <PeriodSummaryCard />}
      <BadgesSection />
      {limited && history.rows.length > 0 && <p className="text-xs text-muted-foreground">{t("progress.freeRange")}</p>}

      {derived.e1rmExercises.length > 0 && (
        <Section title={t("progress.e1rm")}>
          <Card className="space-y-3">
            <NativeSelect label={t("progress.chooseExercise")} hideLabel value={selected} onChange={setExerciseId}>
              {derived.e1rmExercises.map((id) => (
                <option key={id} value={id}>
                  {exerciseName(catalog.byId.get(id), locale)}
                </option>
              ))}
            </NativeSelect>
            {series.length > 1 ? (
              <LineTrend data={series} label={t("progress.e1rm")} unit={unit} />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("progress.noData")}</p>
            )}
          </Card>
        </Section>
      )}

      {history.rows.length > 0 && (
        <Section title={t("progress.weeklyVolume")}>
          <Card>
            <WeeklyBars data={derived.weekly} label={t("progress.weeklyVolume")} unit={unit} />
          </Card>
        </Section>
      )}

      <Section title={t("progress.muscleVolume")}>
        {ent.charts.has("volume_muscle") ? (
          derived.muscles.length ? (
            <Card>
              <HorizontalBars data={derived.muscles} label={t("progress.muscleVolume")} unit={unit} />
            </Card>
          ) : (
            <EmptyState>{t("progress.noData")}</EmptyState>
          )
        ) : (
          <PaywallCard reason={t("premium.features.charts")} />
        )}
      </Section>

      <Section title={t("progress.heatmap")}>
        {ent.charts.has("heatmap") ? (
          <Card>
            <Heatmap counts={workoutsPerDay(history.workouts.map((w) => w.started_at))} />
          </Card>
        ) : (
          <PaywallCard reason={t("premium.features.charts")} />
        )}
      </Section>

      {derived.best.length > 0 && (
        <Section title={t("progress.records")}>
          <ul className="space-y-2">
            {derived.best.map((r) => (
              <li key={`${r.exercise_id}-${r.record_type}`}>
                <Link href={`/exercises/view?id=${r.exercise_id}`} className="flex items-center gap-3 rounded-2xl border bg-card p-3">
                  <Trophy className="size-5 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{exerciseName(catalog.byId.get(r.exercise_id), locale)}</span>
                    <span className="block text-xs text-muted-foreground">{t(`records.${r.record_type}`, { weight: "" })}</span>
                  </span>
                  <span className="num text-xl">
                    {r.record_type === "max_e1rm" ? `${f.number(kgToUnit(r.value, unit), { maximumFractionDigits: 1 })} ${unit}` : r.record_type === "max_duration" ? `${r.value}s` : `${r.value} reps`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
