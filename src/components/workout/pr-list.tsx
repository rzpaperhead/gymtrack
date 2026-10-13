"use client";

import { Trophy } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { exerciseName, type Catalog } from "@/lib/catalog";
import { RECORD_PRIORITY, type PersonalRecord } from "@/lib/calc/prs";
import { displayWeight } from "@/lib/calc/units";
import type { Unit } from "@/lib/types";
import { cn } from "@/lib/utils";

export function formatRecordValue(r: PersonalRecord, unit: Unit, num: (n: number) => string = String): string {
  switch (r.record_type) {
    case "max_weight":
    case "max_e1rm":
    case "max_set_volume":
      return `${num(Number(displayWeight(r.value, unit)))} ${unit}`;
    case "max_reps_at_weight":
    case "max_reps":
      return `${r.value} reps`;
    case "max_duration":
      return `${r.value}s`;
    case "max_distance":
      return `${num(r.value)} m`;
  }
}

export function sortRecords(rs: PersonalRecord[]) {
  return [...rs].sort((a, b) => RECORD_PRIORITY.indexOf(a.record_type) - RECORD_PRIORITY.indexOf(b.record_type));
}

/** PR highlight: trophy icon + text, so it never relies on colour alone. */
export function PRList({ records, catalog, unit, animate }: { records: PersonalRecord[]; catalog?: Catalog; unit: Unit; animate?: boolean }) {
  const t = useTranslations("records");
  const locale = useLocale();
  const f = useFormatter();
  const num = (n: number) => f.number(n, { maximumFractionDigits: 2 });
  return (
    <ul className="space-y-2">
      {sortRecords(records).map((r, i) => (
        <li
          key={`${r.exercise_id}-${r.record_type}-${r.weight_kg ?? ""}`}
          className={cn("flex items-center gap-3 rounded-2xl border border-primary/50 bg-card p-3", animate && "pr-card shine")}
          style={animate ? { animationDelay: `${i * 90}ms` } : undefined}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Trophy className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{exerciseName(catalog?.byId.get(r.exercise_id), locale)}</span>
            <span className="block text-xs text-muted-foreground">
              {t(r.record_type, { weight: r.weight_kg != null ? `${num(Number(displayWeight(r.weight_kg, unit)))} ${unit}` : "" })}
            </span>
          </span>
          <span className="num text-2xl">{formatRecordValue(r, unit, num)}</span>
        </li>
      ))}
    </ul>
  );
}
