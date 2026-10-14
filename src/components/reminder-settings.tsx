"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { BellRing } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, Field } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getActiveProgram } from "@/lib/data/programs";
import { getReminder, saveReminder } from "@/lib/data/reminders";
import { useOnline } from "@/lib/hooks";
import { ensurePushSubscription, pushSupported } from "@/lib/push";
import { cn } from "@/lib/utils";

const WEEK = [1, 2, 3, 4, 5, 6, 0];

/** Daily "time to train" push reminder (needs an account + notifications). */
export function ReminderSettings() {
  const t = useTranslations();
  const online = useOnline();
  const qc = useQueryClient();
  const current = useQuery({ queryKey: ["reminder"], queryFn: getReminder, enabled: online });
  const programDays = useLiveQuery(async () => (await getActiveProgram())?.days.map((d) => d.weekday) ?? [], []);
  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState("18:00");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);

  useEffect(() => {
    if (current.data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seed the form from the server row
      setEnabled(current.data.enabled);
      setTime(current.data.time_local);
      setDays(current.data.weekdays);
    } else if (current.isSuccess && programDays?.length) {
      setDays(programDays);
    }
  }, [current.data, current.isSuccess, programDays]);

  const save = useMutation({
    mutationFn: async (next: { enabled: boolean }) => {
      if (next.enabled) {
        const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
        if (perm !== "granted" || !(await ensurePushSubscription())) throw new Error("permission");
      }
      await saveReminder({ enabled: next.enabled, time_local: time, weekdays: days });
    },
    onSuccess: (_, v) => {
      setEnabled(v.enabled);
      toast.success(v.enabled ? t("reminder.saved", { time }) : t("reminder.off"));
      void qc.invalidateQueries({ queryKey: ["reminder"] });
    },
    onError: (e) => toast.error(e.message === "permission" ? t("reminder.needPermission") : t("common.error")),
  });

  if (!pushSupported()) return null;
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2 font-semibold">
        <BellRing className="size-5 text-primary" aria-hidden /> {t("reminder.title")}
      </div>
      <p className="text-sm text-muted-foreground">{t("reminder.hint")}</p>
      <Field label={t("reminder.time")} htmlFor="rem-time">
        <Input id="rem-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </Field>
      <div role="group" aria-label={t("reminder.days")} className="grid grid-cols-7 gap-1">
        {WEEK.map((d) => {
          const on = days.includes(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
              className={cn("min-h-11 rounded-lg border text-xs font-semibold", on && "border-primary bg-primary text-primary-foreground")}
            >
              {t(`weekdays.${d}` as "weekdays.0").slice(0, 3)}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" disabled={!online || !days.length || save.isPending} onClick={() => save.mutate({ enabled: true })}>
          {enabled ? t("reminder.update") : t("reminder.enable")}
        </Button>
        {enabled && (
          <Button variant="outline" disabled={!online || save.isPending} onClick={() => save.mutate({ enabled: false })}>
            {t("reminder.disable")}
          </Button>
        )}
      </div>
    </Card>
  );
}
