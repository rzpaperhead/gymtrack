"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { track } from "@/lib/analytics";
import { deleteWorkout, startWorkout, WorkoutInProgressError } from "@/lib/workout/actions";

type StartOpts = { templateId?: string | null; name?: string | null };

/** Start a session, or ask what to do if one is already running. */
export function useStartWorkout() {
  const router = useRouter();
  const t = useTranslations("workout");
  const [conflict, setConflict] = useState<{ existing: string; opts: StartOpts } | null>(null);

  const go = useCallback(
    async (opts: StartOpts) => {
      try {
        await startWorkout(opts);
        track("workout_started", { from: opts.templateId ? "template" : "empty" });
        router.push("/workout/active");
      } catch (e) {
        if (e instanceof WorkoutInProgressError) setConflict({ existing: e.workoutId, opts });
        else throw e;
      }
    },
    [router],
  );

  const dialog = (
    <AlertDialog open={!!conflict} onOpenChange={(o) => !o && setConflict(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("inProgressTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("inProgressBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="destructive"
            onClick={async () => {
              const c = conflict!;
              setConflict(null);
              await deleteWorkout(c.existing);
              await go(c.opts);
            }}
          >
            {t("discardAndStart")}
          </Button>
          <Button
            onClick={() => {
              setConflict(null);
              router.push("/workout/active");
            }}
          >
            {t("resume")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { start: go, dialog };
}
