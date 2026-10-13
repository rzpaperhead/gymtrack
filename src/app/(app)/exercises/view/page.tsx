"use client";

import { subDays } from "date-fns";
import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Suspense, useMemo, useState } from "react";
import { LineTrend } from "@/components/charts";
import { ConfirmDialog, EmptyState, PageHeader, Section } from "@/components/common";
import { ExerciseFormDialog } from "@/components/exercise-form";
import { Button } from "@/components/ui/button";
import { PRList } from "@/components/workout/pr-list";
import { formatPrevious } from "@/components/workout/set-row";
import { exerciseName, useExerciseCatalog } from "@/lib/catalog";
import { epley1RM } from "@/lib/calc/one-rm";
import { computeRecords } from "@/lib/calc/prs";
import { dateKey } from "@/lib/calc/stats";
import { kgToUnit } from "@/lib/calc/units";
import { deleteCustomExercise } from "@/lib/data/exercises";
import { useEntitlements, useUnit } from "@/lib/hooks";
import { useTrainingHistory } from "@/lib/history";

function ExerciseView() {
  const id = useSearchParams().get("id") ?? "";
  const t = useTranslations();
  const f = useFormatter();
  const locale = useLocale();
  const unit = useUnit();
  const router = useRouter();
  const ent = useEntitlements();
  const catalog = useExerciseCatalog();
  const history = useTrainingHistory();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const ex = catalog?.byId.get(id);

  const data = useMemo(() => {
    if (!history || !ex) return null;
    const weIds = new Set(history.workoutExercises.filter((we) => we.exercise_id === id).map((we) => we.id));
    const sets = history.sets.filter((s) => weIds.has(s.workout_exercise_id) && s.completed_at);
    const prSets = sets.map((s) => ({ ...s, exercise_id: id }));
    const records = computeRecords(prSets, () => ex.type).filter((r) => r.record_type !== "max_reps_at_weight");
    const cutoff = Number.isFinite(ent.chartHistoryDays) ? dateKey(subDays(new Date(), ent.chartHistoryDays)) : "";
    const byDay = new Map<string, number>();
    for (const s of sets) {
      if (s.set_type === "warmup") continue;
      const e = epley1RM(s.weight_kg, s.reps);
      if (e == null) continue;
      const d = dateKey(s.completed_at!);
      if (d < cutoff) continue;
      byDay.set(d, Math.max(byDay.get(d) ?? 0, e));
    }
    const trend = [...byDay.entries()].sort().map(([date, v]) => ({ date, value: Math.round(kgToUnit(v, unit) * 10) / 10 }));
    const sessions = history.rows
      .filter((r) => r.exerciseIds.includes(id))
      .map((r) => ({ row: r, sets: sets.filter((s) => s.workout_id === r.workout.id).sort((a, b) => a.position - b.position) }));
    return { records, trend, sessions };
  }, [history, ex, id, ent.chartHistoryDays, unit]);

  if (!catalog) return null;
  if (!ex) return <EmptyState>{t("exercises.noResults")}</EmptyState>;

  return (
    <div className="space-y-6">
      <PageHeader
        back
        title={exerciseName(ex, locale)}
        actions={
          ex.owner_id ? (
            <>
              <Button variant="ghost" size="icon" aria-label={t("common.edit")} onClick={() => setEditing(true)}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon" aria-label={t("common.delete")} onClick={() => setDeleting(true)}>
                <Trash2 />
              </Button>
            </>
          ) : null
        }
      />
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-primary px-3 py-1 font-semibold text-primary-foreground">{t(`muscles.${ex.primary_muscle}`)}</span>
        {ex.secondary_muscles.map((m) => (
          <span key={m} className="rounded-full bg-muted px-3 py-1">
            {t(`muscles.${m}`)}
          </span>
        ))}
        <span className="rounded-full border px-3 py-1">{t(`equipment.${ex.equipment}`)}</span>
        <span className="rounded-full border px-3 py-1">{t(`exerciseTypes.${ex.type}`)}</span>
      </div>

      {data && data.sessions.length === 0 && <EmptyState>{t("exercises.noHistory")}</EmptyState>}

      {data && data.records.length > 0 && (
        <Section title={t("exercises.records")}>
          <PRList records={data.records} catalog={catalog} unit={unit} />
        </Section>
      )}

      {data && data.trend.length > 1 && (
        <Section title={t("exercises.e1rmChart")}>
          <LineTrend data={data.trend} label={t("exercises.e1rmChart")} unit={unit} />
          {Number.isFinite(ent.chartHistoryDays) && <p className="text-xs text-muted-foreground">{t("progress.freeRange")}</p>}
        </Section>
      )}

      {data && data.sessions.length > 0 && (
        <Section title={t("exercises.history")}>
          <ul className="space-y-2">
            {data.sessions.map(({ row, sets }) => (
              <li key={row.workout.id}>
                <Link href={`/workout/view?id=${row.workout.id}`} className="block rounded-2xl border bg-card p-3">
                  <p className="text-sm text-muted-foreground">{f.dateTime(new Date(row.workout.started_at), { dateStyle: "medium" })}</p>
                  <p className="num text-lg">{sets.map((s) => formatPrevious(s, ex.type, unit)).join("  ·  ")}</p>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <ExerciseFormDialog open={editing} onOpenChange={setEditing} existing={ex} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t("common.delete")}
        description={t("exercises.deleteConfirm")}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={async () => {
          await deleteCustomExercise(ex.id);
          router.replace("/exercises");
        }}
      />
    </div>
  );
}

export default function ExerciseViewPage() {
  return (
    <Suspense>
      <ExerciseView />
    </Suspense>
  );
}
