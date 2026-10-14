"use client";

import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDown, ArrowUp, GripVertical, Link2, Link2Off, MoreHorizontal, Plus, StickyNote, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { NativeSelect } from "@/components/common";
import { useProfile } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ExercisePicker } from "@/components/workout/exercise-picker";
import { SetRow, fieldsFor } from "@/components/workout/set-row";
import { exerciseName, useExerciseCatalog } from "@/lib/catalog";
import { alive, db } from "@/lib/db/local";
import { formatClock, useUnit } from "@/lib/hooks";
import { SET_TYPES, type Exercise, type WorkoutExercise, type WorkoutSet } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  addExercises,
  addSet,
  lastPerformance,
  removeExercise,
  removeSet,
  reorderExercises,
  setExerciseNotes,
  setExerciseRest,
  toggleSetDone,
  toggleSupersetWithNext,
  updateSet,
} from "@/lib/workout/actions";
import { startRest } from "@/lib/workout/rest-timer";

const REST_OPTIONS = [0, 30, 45, 60, 75, 90, 120, 150, 180, 210, 240, 300];

interface Props {
  workoutId: string;
  /** "active" runs the rest timer and haptics; "edit" is for past sessions. */
  mode: "active" | "edit";
}

export function WorkoutEditor({ workoutId, mode }: Props) {
  const t = useTranslations();
  const catalog = useExerciseCatalog();
  const [picker, setPicker] = useState(false);
  const data = useLiveQuery(async () => {
    const [wes, sets] = await Promise.all([
      db.workout_exercises.where("workout_id").equals(workoutId).toArray(),
      db.sets.where("workout_id").equals(workoutId).toArray(),
    ]);
    return {
      wes: wes.filter(alive).sort((a, b) => a.position - b.position),
      sets: sets.filter(alive).sort((a, b) => a.position - b.position),
    };
  }, [workoutId]);

  if (!data || !catalog) return null;
  const { wes, sets } = data;

  return (
    <div className="space-y-4">
      {!wes.length && <p className="rounded-2xl border border-dashed p-6 text-center text-muted-foreground">{t("active.empty")}</p>}
      <DragDropProvider
        onDragEnd={(event) => {
          if (event.canceled) return;
          const { source } = event.operation;
          if (!isSortable(source) || source.initialIndex === source.index) return;
          const ids = wes.map((w) => w.id);
          const [moved] = ids.splice(source.initialIndex, 1);
          ids.splice(source.index, 0, moved);
          void reorderExercises(ids);
        }}
      >
        {wes.map((we, i) => (
          <ExerciseCard
            key={we.id}
            index={i}
            we={we}
            prev={wes[i - 1]}
            next={wes[i + 1]}
            allIds={wes.map((w) => w.id)}
            exercise={catalog.byId.get(we.exercise_id)}
            sets={sets.filter((s) => s.workout_exercise_id === we.id)}
            mode={mode}
            workoutId={workoutId}
            groupWes={we.superset_group ? wes.filter((w) => w.superset_group === we.superset_group) : [we]}
            catalogById={catalog.byId}
          />
        ))}
      </DragDropProvider>
      <Button variant="secondary" size="xl" className="w-full" onClick={() => setPicker(true)}>
        <Plus aria-hidden /> {t("active.addExercise")}
      </Button>
      <ExercisePicker open={picker} onOpenChange={setPicker} onPick={(ids) => addExercises(workoutId, ids)} />
    </div>
  );
}

function ExerciseCard({
  we,
  index,
  prev,
  next,
  allIds,
  exercise,
  sets,
  mode,
  workoutId,
  groupWes,
  catalogById,
}: {
  we: WorkoutExercise;
  index: number;
  prev?: WorkoutExercise;
  next?: WorkoutExercise;
  allIds: string[];
  exercise?: Exercise;
  sets: WorkoutSet[];
  mode: Props["mode"];
  workoutId: string;
  groupWes: WorkoutExercise[];
  catalogById: Map<string, Exercise>;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const unit = useUnit();
  const profile = useProfile();
  const [options, setOptions] = useState(false);
  const [setOptionsFor, setSetOptionsFor] = useState<WorkoutSet | null>(null);
  const { ref, handleRef, isDragging } = useSortable({ id: we.id, index });
  const previous = useLiveQuery(() => lastPerformance(we.exercise_id, workoutId), [we.exercise_id, workoutId]);
  const type = exercise?.type ?? "weight_reps";
  const name = exerciseName(exercise, locale);
  const restSec = we.rest_sec ?? exercise?.default_rest_sec ?? profile?.default_rest_sec ?? 120;
  const inSuperset = !!we.superset_group && groupWes.length > 1;
  const linkedToPrev = inSuperset && prev?.superset_group === we.superset_group;
  const linkedToNext = inSuperset && next?.superset_group === we.superset_group;

  let working = 0;
  const workingIndex = sets.map((s) => (s.set_type === "working" ? ++working : 0));

  const onToggle = async (s: WorkoutSet, i: number) => {
    const fallback = previous?.[i] ?? previous?.[previous.length - 1];
    const nowDone = await toggleSetDone(s.id, fallback);
    if (!nowDone || mode !== "active") return;
    try {
      navigator.vibrate?.(30);
    } catch {}
    // In a superset, rest only after the last exercise of the round.
    const last = groupWes[groupWes.length - 1];
    if (inSuperset && last.id !== we.id) return;
    const nextLabel = inSuperset ? exerciseName(catalogById.get(groupWes[0].exercise_id), locale) : name;
    void startRest(restSec, nextLabel);
  };

  return (
    <article
      ref={ref}
      aria-label={name}
      className={cn(
        "rounded-2xl border bg-card p-3",
        inSuperset && "border-l-4 border-l-chart-2",
        linkedToPrev && "-mt-3 rounded-t-none border-t-0",
        linkedToNext && "rounded-b-none",
        isDragging && "opacity-60 shadow-lg",
      )}
    >
      <header className="mb-2 flex items-center gap-1">
        <button
          ref={handleRef}
          type="button"
          className="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground"
          aria-label={t("active.dragHandle", { name })}
        >
          <GripVertical className="size-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          {inSuperset && !linkedToPrev && (
            <p className="text-xs font-bold uppercase text-chart-2">
              {t("active.superset")} {we.superset_group?.toUpperCase()}
            </p>
          )}
          <h3 className="truncate font-sans text-lg font-bold normal-case">{name}</h3>
          <p className="text-xs text-muted-foreground">{t("active.restSetting", { time: formatClock(restSec) })}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setOptions(true)} aria-label={t("active.options")}>
          <MoreHorizontal />
        </Button>
      </header>
      {we.notes && (
        <p className="mb-2 flex gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
          <StickyNote className="mt-0.5 size-4 shrink-0" aria-hidden /> {we.notes}
        </p>
      )}

      <div
        className={cn(
          "grid gap-1 px-0.5 pb-1 text-center text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground",
          fieldsFor(type).length === 2 ? "grid-cols-[2.25rem_minmax(0,1fr)_4.25rem_3.5rem_2.75rem]" : "grid-cols-[2.25rem_minmax(0,1fr)_5rem_2.75rem]",
        )}
        aria-hidden
      >
        <span>{t("active.set")}</span>
        <span>{t("active.previous")}</span>
        {fieldsFor(type).map((f) => (
          <span key={f}>
            {f === "weight" ? unit : f === "reps" ? t("active.reps") : f === "duration" ? t("active.colTime") : t("active.colDistance")}
          </span>
        ))}
        <span>✓</span>
      </div>
      <div className="space-y-1">
        {sets.map((s, i) => (
          <SetRow
            key={s.id}
            set={s}
            index={i}
            workingIndex={workingIndex[i]}
            type={type}
            unit={unit}
            previous={previous?.[i]}
            onChange={(patch) => updateSet(s.id, patch)}
            onToggle={() => onToggle(s, i)}
            onOpenOptions={() => setSetOptionsFor(s)}
            onUsePrevious={() => {
              const p = previous?.[i];
              if (p) void updateSet(s.id, { weight_kg: p.weight_kg, reps: p.reps, duration_sec: p.duration_sec, distance_m: p.distance_m });
            }}
          />
        ))}
      </div>
      <Button variant="ghost" className="mt-1 w-full" onClick={() => addSet(we.id)}>
        <Plus aria-hidden /> {t("active.addSet")}
      </Button>

      <ExerciseOptions
        open={options}
        onOpenChange={setOptions}
        we={we}
        name={name}
        restSec={restSec}
        canMoveUp={index > 0}
        canMoveDown={index < allIds.length - 1}
        hasNext={!!next}
        linkedToNext={linkedToNext}
        onMove={(dir) => {
          const ids = [...allIds];
          const j = index + dir;
          [ids[index], ids[j]] = [ids[j], ids[index]];
          void reorderExercises(ids);
        }}
        workoutId={workoutId}
      />
      <SetOptions set={setOptionsFor} onClose={() => setSetOptionsFor(null)} />
    </article>
  );
}

function ExerciseOptions({
  open,
  onOpenChange,
  we,
  name,
  restSec,
  canMoveUp,
  canMoveDown,
  hasNext,
  linkedToNext,
  onMove,
  workoutId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  we: WorkoutExercise;
  name: string;
  restSec: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  hasNext: boolean;
  linkedToNext: boolean;
  onMove: (dir: -1 | 1) => void;
  workoutId: string;
}) {
  const t = useTranslations();
  const [notes, setNotes] = useState(we.notes ?? "");
  const close = () => onOpenChange(false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-3xl p-4" closeLabel={t("common.close")}>
        <SheetHeader className="p-0">
          <SheetTitle className="pr-10 text-lg font-bold">{name}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4">
          <div className="grid gap-1.5">
            <label htmlFor={`notes-${we.id}`} className="text-sm font-medium">
              {t("active.exerciseNotes")}
            </label>
            <Textarea id={`notes-${we.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => setExerciseNotes(we.id, notes)} rows={2} />
          </div>
          <NativeSelect label={t("active.restCustom")} value={String(restSec)} onChange={(v) => setExerciseRest(we.id, Number(v))}>
            {[...new Set([...REST_OPTIONS, restSec])]
              .sort((a, b) => a - b)
              .map((s) => (
                <option key={s} value={s}>
                  {formatClock(s)}
                </option>
              ))}
          </NativeSelect>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={!canMoveUp} onClick={() => onMove(-1)}>
              <ArrowUp aria-hidden /> {t("active.moveUp")}
            </Button>
            <Button variant="secondary" disabled={!canMoveDown} onClick={() => onMove(1)}>
              <ArrowDown aria-hidden /> {t("active.moveDown")}
            </Button>
          </div>
          {(hasNext || linkedToNext) && (
            <Button
              variant="secondary"
              className="w-full"
              onClick={async () => {
                await toggleSupersetWithNext(workoutId, we.id);
                close();
              }}
            >
              {linkedToNext ? <Link2Off aria-hidden /> : <Link2 aria-hidden />}
              {linkedToNext ? t("active.unlinkSuperset") : t("active.supersetWithNext")}
            </Button>
          )}
          <Button
            variant="destructive"
            className="w-full"
            onClick={async () => {
              await removeExercise(we.id);
              close();
            }}
          >
            <Trash2 aria-hidden /> {t("active.removeExercise")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SetOptions({ set, onClose }: { set: WorkoutSet | null; onClose: () => void }) {
  const t = useTranslations();
  const rpes = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
  return (
    <Sheet open={!!set} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-3xl p-4" closeLabel={t("common.close")}>
        <SheetHeader className="p-0">
          <SheetTitle className="text-lg font-bold">{t("active.setType")}</SheetTitle>
        </SheetHeader>
        {set && (
          <div className="space-y-4">
            <div role="radiogroup" aria-label={t("active.setType")} className="grid grid-cols-2 gap-2">
              {SET_TYPES.map((st) => (
                <button
                  key={st}
                  type="button"
                  role="radio"
                  aria-checked={set.set_type === st}
                  onClick={async () => {
                    await updateSet(set.id, { set_type: st });
                    onClose();
                  }}
                  className={cn(
                    "min-h-12 rounded-xl border font-semibold",
                    set.set_type === st && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {t(`setTypes.${st}`)}
                </button>
              ))}
            </div>
            <NativeSelect
              label={t("active.rpeOptional")}
              value={set.rpe?.toString() ?? ""}
              onChange={async (v) => {
                await updateSet(set.id, { rpe: v ? Number(v) : null });
                onClose();
              }}
            >
              <option value="">—</option>
              {rpes.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </NativeSelect>
            <Button
              variant="destructive"
              className="w-full"
              onClick={async () => {
                await removeSet(set.id);
                onClose();
              }}
            >
              <Trash2 aria-hidden /> {t("active.removeSet")}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
