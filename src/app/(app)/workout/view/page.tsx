"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { kudosForWorkout } from "@/lib/data/friends";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog, EmptyState, PageHeader, Stat } from "@/components/common";
import { Button } from "@/components/ui/button";
import { formatPrevious } from "@/components/workout/set-row";
import { useStartWorkout } from "@/components/workout/start-workout";
import { WorkoutEditor } from "@/components/workout/workout-editor";
import { exerciseName, useExerciseCatalog } from "@/lib/catalog";
import { durationSec, totalVolume } from "@/lib/calc/stats";
import { displayWeight } from "@/lib/calc/units";
import { alive, db } from "@/lib/db/local";
import { formatClock, useUnit } from "@/lib/hooks";
import { addExercises, deleteWorkout, startWorkout, WorkoutInProgressError } from "@/lib/workout/actions";
import { cn } from "@/lib/utils";

function View() {
  const id = useSearchParams().get("id") ?? "";
  const t = useTranslations();
  const f = useFormatter();
  const locale = useLocale();
  const unit = useUnit();
  const router = useRouter();
  const catalog = useExerciseCatalog();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { start, dialog } = useStartWorkout();

  const data = useLiveQuery(async () => {
    const w = await db.workouts.get(id);
    if (!alive(w)) return null;
    const wes = (await db.workout_exercises.where("workout_id").equals(id).toArray()).filter(alive).sort((a, b) => a.position - b.position);
    const sets = (await db.sets.where("workout_id").equals(id).toArray()).filter(alive).sort((a, b) => a.position - b.position);
    return { w, wes, sets };
  }, [id]);

  if (data === undefined) return null;
  if (data === null) return <EmptyState>{t("history.notFound")}</EmptyState>;
  const { w, wes, sets } = data;
  const done = sets.filter((s) => s.completed_at);

  const repeat = async () => {
    if (w.template_id) return start({ templateId: w.template_id, name: w.name });
    try {
      const newId = await startWorkout({ name: w.name });
      await addExercises(newId, wes.map((we) => we.exercise_id));
      router.push("/workout/active");
    } catch (e) {
      if (e instanceof WorkoutInProgressError) router.push("/workout/active");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        back="/workout"
        title={w.name ?? t("workout.untitled")}
        actions={
          <Button variant={editing ? "default" : "ghost"} size="icon" aria-pressed={editing} aria-label={t("common.edit")} onClick={() => setEditing(!editing)}>
            <Pencil />
          </Button>
        }
      />
      <p className="text-sm text-muted-foreground">
        {t("history.startedAt")}: {f.dateTime(new Date(w.started_at), { dateStyle: "full", timeStyle: "short" })}
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Stat label={t("summary.duration")} value={formatClock(durationSec(w))} />
        <Stat label={t("summary.volume")} value={f.number(Number(displayWeight(totalVolume(done), unit)), { maximumFractionDigits: 0 })} sub={unit} />
        <Stat label={t("summary.sets")} value={done.filter((s) => s.set_type !== "warmup").length} />
      </div>
      {w.notes && <p className="rounded-xl bg-muted p-3 text-sm">{w.notes}</p>}
      <KudosReceived workoutId={id} />

      {editing ? (
        <>
          <p role="status" className="text-sm font-semibold text-primary">
            {t("history.editing")}
          </p>
          <WorkoutEditor workoutId={id} mode="edit" />
        </>
      ) : (
        <div className="space-y-3">
          {wes.map((we) => {
            const ex = catalog?.byId.get(we.exercise_id);
            const ws = sets.filter((s) => s.workout_exercise_id === we.id);
            return (
              <section key={we.id} className={cn("rounded-2xl border bg-card p-4", we.superset_group && "border-l-4 border-l-chart-2")}>
                <h2 className="font-sans text-lg font-bold normal-case">{exerciseName(ex, locale)}</h2>
                {we.notes && <p className="text-sm text-muted-foreground">{we.notes}</p>}
                <ol className="mt-2 space-y-1">
                  {ws.map((s, i) => (
                    <li key={s.id} className={cn("flex items-center gap-3 text-base", !s.completed_at && "opacity-50")}>
                      <span className="num w-6 text-muted-foreground">{s.set_type === "working" ? i + 1 : t(`setTypes.${s.set_type}_short` as "setTypes.warmup_short")}</span>
                      <span className="num text-xl">{formatPrevious(s, ex?.type ?? "weight_reps", unit)}</span>
                      {s.rpe != null && <span className="text-sm text-muted-foreground">@{s.rpe}</span>}
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        <Button size="lg" className="w-full" onClick={repeat}>
          <RotateCcw aria-hidden /> {t("history.repeat")}
        </Button>
        <Button variant="ghost" className="w-full text-destructive" onClick={() => setConfirmDelete(true)}>
          <Trash2 aria-hidden /> {t("common.delete")}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("common.delete")}
        description={t("history.deleteConfirm")}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={async () => {
          await deleteWorkout(id);
          toast.success(t("history.deleted"));
          router.replace("/workout");
        }}
      />
      {dialog}
    </div>
  );
}

/** Reactions friends left on this workout (online, accounts only). */
function KudosReceived({ workoutId }: { workoutId: string }) {
  const t = useTranslations("social");
  const { mode, guest } = useAuth();
  const q = useQuery({
    queryKey: ["kudos", workoutId],
    queryFn: () => kudosForWorkout(workoutId),
    enabled: mode === "supabase" && !guest && typeof navigator !== "undefined" && navigator.onLine,
  });
  if (!q.data?.length) return null;
  return (
    <p className="rounded-xl border border-primary/40 bg-accent/30 p-3 text-sm">
      {q.data.map((k) => k.emoji).join(" ")} {t("kudosFrom", { names: q.data.map((k) => k.from_name).join(", ") })}
    </p>
  );
}

export default function WorkoutViewPage() {
  return (
    <Suspense>
      <View />
    </Suspense>
  );
}
