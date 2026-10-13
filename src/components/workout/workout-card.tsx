"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { exerciseName, type Catalog } from "@/lib/catalog";
import { displayWeight } from "@/lib/calc/units";
import type { WorkoutRow } from "@/lib/history";
import type { Unit } from "@/lib/types";

export function WorkoutCard({ row, catalog, unit }: { row: WorkoutRow; catalog?: Catalog; unit: Unit }) {
  const t = useTranslations();
  const f = useFormatter();
  const locale = useLocale();
  const names = row.exerciseIds.map((id) => exerciseName(catalog?.byId.get(id), locale));
  return (
    <Link
      href={`/workout/view?id=${row.workout.id}`}
      className="flex items-center gap-3 rounded-2xl border bg-card p-4 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-lg font-bold">{row.workout.name ?? t("workout.untitled")}</p>
          <time className="shrink-0 text-xs text-muted-foreground" dateTime={row.workout.started_at}>
            {f.dateTime(new Date(row.workout.started_at), { weekday: "short", day: "numeric", month: "short" })}
          </time>
        </div>
        <p className="truncate text-sm text-muted-foreground">{names.join(" · ") || "—"}</p>
        <p className="text-sm">
          <span className="num">{t("common.minutes", { count: Math.round(row.durationSec / 60) })}</span>
          <span className="text-muted-foreground"> · </span>
          <span>{t("common.sets", { count: row.setCount })}</span>
          {row.volumeKg > 0 && (
            <>
              <span className="text-muted-foreground"> · </span>
              <span className="num">
                {f.number(Number(displayWeight(row.volumeKg, unit)), { maximumFractionDigits: 0 })} {unit}
              </span>
            </>
          )}
        </p>
      </div>
      <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
    </Link>
  );
}
