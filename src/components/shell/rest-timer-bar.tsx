"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db/local";
import { formatClock, useNow } from "@/lib/hooks";
import { adjustRest, notifyRestDone, REST_TIMER_KEY, stopRest, type RestTimer } from "@/lib/workout/rest-timer";

export function RestTimerBar() {
  const t = useTranslations("rest");
  const timer = useLiveQuery(async () => (await db.meta.get(REST_TIMER_KEY))?.value as RestTimer | undefined, []);
  const now = useNow(250);
  const fired = useRef<number | null>(null);
  const remaining = timer ? Math.ceil((timer.endsAt - now) / 1000) : 0;

  useEffect(() => {
    if (!timer || remaining > 0 || fired.current === timer.endsAt) return;
    fired.current = timer.endsAt;
    void notifyRestDone(t("done"), t("doneBody", { label: timer.label }));
    void stopRest();
  }, [timer, remaining, t]);

  if (!timer || remaining <= 0) return null;
  const pct = timer.durationSec ? Math.min(100, ((timer.durationSec - remaining) / timer.durationSec) * 100) : 0;

  return (
    <div className="relative overflow-hidden border-t bg-card" role="timer" aria-label={t("title")}>
      <div className="absolute inset-y-0 left-0 bg-primary/20 transition-[width] duration-200" style={{ width: `${pct}%` }} aria-hidden />
      <div className="relative flex items-center gap-2 px-3 py-2">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("title")}</p>
          <p className="num text-4xl leading-none" aria-live="off">
            {formatClock(remaining)}
          </p>
        </div>
        <Button variant="secondary" size="sm" className="h-11" onClick={() => adjustRest(-15)}>
          {t("sub15")}
        </Button>
        <Button variant="secondary" size="sm" className="h-11" onClick={() => adjustRest(15)}>
          {t("add15")}
        </Button>
        <Button size="sm" className="h-11" onClick={() => stopRest()}>
          {t("skip")}
        </Button>
      </div>
    </div>
  );
}
