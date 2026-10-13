"use client";

import { ChevronRight, Timer } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { durationSec } from "@/lib/calc/stats";
import { formatClock, useActiveWorkout, useNow } from "@/lib/hooks";

/** Sticky bar on every page while a session runs. */
export function ActiveWorkoutBar() {
  const w = useActiveWorkout();
  const t = useTranslations();
  const now = useNow(1000);
  if (!w) return null;
  return (
    <Link
      href="/workout/active"
      className="flex min-h-14 items-center gap-3 bg-primary px-4 text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
    >
      <Timer className="size-5" aria-hidden />
      <span className="flex-1 truncate font-semibold">{w.name ?? t("active.title")}</span>
      <span className="num text-xl" aria-label={t("summary.duration")}>
        {formatClock(durationSec(w, new Date(now)))}
      </span>
      <ChevronRight className="size-5" aria-hidden />
    </Link>
  );
}
