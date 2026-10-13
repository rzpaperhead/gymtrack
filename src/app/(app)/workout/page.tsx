"use client";

import { ClipboardList, Download, Dumbbell, LayoutList, Plus } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState, Field, NativeSelect, PageHeader, Section } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStartWorkout } from "@/components/workout/start-workout";
import { WorkoutCard } from "@/components/workout/workout-card";
import { exerciseName, templateName, useExerciseCatalog, useTemplates } from "@/lib/catalog";
import { dateKey } from "@/lib/calc/stats";
import { exportWorkoutsCsv } from "@/lib/data/export";
import { getActiveProgram } from "@/lib/data/programs";
import { useEntitlements, useUnit } from "@/lib/hooks";
import { useTrainingHistory } from "@/lib/history";

export default function WorkoutPage() {
  const t = useTranslations();
  const locale = useLocale();
  const unit = useUnit();
  const history = useTrainingHistory();
  const catalog = useExerciseCatalog();
  const templates = useTemplates();
  const ent = useEntitlements();
  const { start, dialog } = useStartWorkout();
  const [exerciseFilter, setExerciseFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const usedExercises = useMemo(() => {
    const ids = new Set(history?.rows.flatMap((r) => r.exerciseIds));
    return [...ids]
      .map((id) => catalog?.byId.get(id))
      .filter((e) => !!e)
      .sort((a, b) => exerciseName(a, locale).localeCompare(exerciseName(b, locale)));
  }, [history, catalog, locale]);

  const rows = (history?.rows ?? []).filter((r) => {
    const d = dateKey(r.workout.started_at);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (exerciseFilter && !r.exerciseIds.includes(exerciseFilter)) return false;
    return true;
  });

  // Today's program day first, then the rest of the active program, then everything else.
  const programOrder = useLiveQuery(async () => {
    const p = await getActiveProgram();
    if (!p) return [];
    const today = new Date().getDay();
    return [...p.days].sort((a, b) => ((a.weekday - today + 7) % 7) - ((b.weekday - today + 7) % 7)).map((d) => d.template_id);
  }, []);
  const rank = (id: string) => {
    const i = programOrder?.indexOf(id) ?? -1;
    return i === -1 ? 1000 : i;
  };
  const quickTemplates = [...(templates?.mine ?? []), ...(templates?.builtin ?? [])]
    .map((x, i) => ({ x, i }))
    .sort((a, b) => rank(a.x.template.id) - rank(b.x.template.id) || a.i - b.i)
    .map(({ x }) => x)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader title={t("workout.title")} />
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => start({})}
          className="col-span-2 flex min-h-20 items-center gap-4 rounded-2xl bg-primary px-5 text-left text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          <Plus className="size-8" aria-hidden />
          <span>
            <span className="block text-xl font-extrabold uppercase">{t("workout.startEmpty")}</span>
            <span className="text-sm opacity-80">{t("workout.startEmptyHint")}</span>
          </span>
        </button>
        <Link href="/templates" className="flex min-h-16 items-center gap-3 rounded-2xl border bg-card px-4 font-semibold">
          <ClipboardList className="size-5 text-primary" aria-hidden /> {t("workout.templates")}
        </Link>
        <Link href="/programs" className="flex min-h-16 items-center gap-3 rounded-2xl border bg-card px-4 font-semibold">
          <LayoutList className="size-5 text-primary" aria-hidden /> {t("workout.programs")}
        </Link>
        <Link href="/exercises" className="col-span-2 flex min-h-14 items-center gap-3 rounded-2xl border bg-card px-4 font-semibold">
          <Dumbbell className="size-5 text-primary" aria-hidden /> {t("profile.manageExercises")}
        </Link>
      </div>

      <Section title={t("workout.fromTemplate")}>
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
          {quickTemplates.map((tpl) => (
            <button
              key={tpl.template.id}
              onClick={() => start({ templateId: tpl.template.id })}
              className="min-h-24 w-40 shrink-0 snap-start rounded-2xl border bg-card p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="line-clamp-2 font-bold">{templateName(tpl.template, locale)}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{t("common.exercisesCount", { count: tpl.items.length })}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section
        title={<span id="history">{t("workout.history")}</span>}
        action={
          ent.csvExport ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await exportWorkoutsCsv(unit, locale);
                toast.success(t("workout.exported"));
              }}
            >
              <Download aria-hidden /> CSV
            </Button>
          ) : null
        }
      >
        {history && history.rows.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <NativeSelect className="col-span-2" label={t("workout.filterExercise")} value={exerciseFilter} onChange={setExerciseFilter}>
              <option value="">{t("common.all")}</option>
              {usedExercises.map((e) => (
                <option key={e!.id} value={e!.id}>
                  {exerciseName(e, locale)}
                </option>
              ))}
            </NativeSelect>
            <Field label={t("workout.filterFrom")} htmlFor="from">
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label={t("workout.filterTo")} htmlFor="to">
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            {(exerciseFilter || from || to) && (
              <Button
                variant="ghost"
                className="col-span-2"
                onClick={() => {
                  setExerciseFilter("");
                  setFrom("");
                  setTo("");
                }}
              >
                {t("workout.clearFilters")}
              </Button>
            )}
          </div>
        )}
        {history && !rows.length && <EmptyState>{t("workout.historyEmpty")}</EmptyState>}
        <div className="space-y-3">
          {rows.map((r) => (
            <WorkoutCard key={r.workout.id} row={r} catalog={catalog} unit={unit} />
          ))}
        </div>
      </Section>
      {dialog}
    </div>
  );
}
