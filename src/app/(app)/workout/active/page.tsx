"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ConfirmDialog, EmptyState, LinkButton } from "@/components/common";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WorkoutEditor } from "@/components/workout/workout-editor";
import { track } from "@/lib/analytics";
import { durationSec } from "@/lib/calc/stats";
import { alive, db } from "@/lib/db/local";
import { formatClock, useActiveWorkout, useNow } from "@/lib/hooks";
import { deleteWorkout, finishWorkout, hasValues, updateWorkout } from "@/lib/workout/actions";
import { stopRest } from "@/lib/workout/rest-timer";

export default function ActiveWorkoutPage() {
  const t = useTranslations();
  const router = useRouter();
  const workout = useActiveWorkout();
  const now = useNow(1000);
  const [finishOpen, setFinishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [finishing, setFinishing] = useState<string | null>(null);

  const openSets = useLiveQuery(
    async () => (workout ? (await db.sets.where("workout_id").equals(workout.id).toArray()).filter((s) => alive(s) && !s.completed_at) : []),
    [workout?.id],
  );

  // Ask for notification permission once a session starts (used by the rest timer).
  useEffect(() => {
    if (workout && typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission().catch(() => {});
    }
  }, [workout]);

  useEffect(() => {
    if (finishing && workout === null) router.replace(`/workout/summary?id=${finishing}`);
  }, [finishing, workout, router]);

  if (workout === undefined) return null;
  if (workout === null) {
    if (finishing) return null;
    return (
      <div className="pt-10">
        <EmptyState action={<LinkButton href="/workout">{t("workout.title")}</LinkButton>}>{t("home.noWorkouts")}</EmptyState>
      </div>
    );
  }

  const doFinish = async (mode: "complete" | "discard") => {
    setFinishOpen(false);
    setFinishing(workout.id);
    await stopRest();
    await finishWorkout(workout.id, mode);
    track("workout_completed", { duration_min: Math.round(durationSec(workout) / 60) });
  };

  const incomplete = openSets?.length ?? 0;
  const incompleteWithValues = openSets?.filter(hasValues).length ?? 0;

  return (
    <div className="space-y-4">
      <header className="pt-safe sticky top-0 z-20 -mx-4 bg-background/95 px-4 pb-2 backdrop-blur">
        <div className="flex min-h-16 items-center gap-3">
          <div className="min-w-0 flex-1">
            <Input
              aria-label={t("common.name")}
              value={name ?? workout.name ?? ""}
              placeholder={t("workout.untitled")}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name != null && updateWorkout(workout.id, { name: name.trim() || null })}
              className="h-9 border-none bg-transparent px-0 text-xl font-bold shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            <p className="num text-3xl leading-none text-primary" role="timer" aria-label={t("summary.duration")}>
              {formatClock(durationSec(workout, new Date(now)))}
            </p>
          </div>
          <Button size="lg" onClick={() => (incomplete ? setFinishOpen(true) : doFinish("discard"))}>
            {t("active.finish")}
          </Button>
        </div>
      </header>

      <WorkoutEditor workoutId={workout.id} mode="active" />

      <div className="grid gap-1.5">
        <label htmlFor="session-notes" className="text-sm font-medium">
          {t("active.sessionNotes")}
        </label>
        <Textarea
          id="session-notes"
          rows={2}
          value={notes ?? workout.notes ?? ""}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes != null && updateWorkout(workout.id, { notes: notes.trim() || null })}
        />
      </div>

      <Button variant="ghost" className="w-full text-destructive" onClick={() => setDiscardOpen(true)}>
        <Trash2 aria-hidden /> {t("active.discard")}
      </Button>

      <AlertDialog open={finishOpen} onOpenChange={setFinishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("active.finishTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("active.finishIncomplete", { count: incomplete })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            {incompleteWithValues > 0 && (
              <Button size="lg" onClick={() => doFinish("complete")}>
                {t("active.finishCompleteAll")}
              </Button>
            )}
            <Button size="lg" variant="secondary" onClick={() => doFinish("discard")}>
              {t("active.finishDiscardOpen")}
            </Button>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title={t("active.discard")}
        description={t("active.discardConfirm")}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={async () => {
          await stopRest();
          await deleteWorkout(workout.id);
          router.replace("/home");
        }}
      />
    </div>
  );
}
