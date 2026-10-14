"use client";

import { Activity } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Card } from "@/components/common";
import type { Catalog } from "@/lib/catalog";
import type { TrainingHistory } from "@/lib/history";
import { useNow } from "@/lib/hooks";
import { computeRecovery, MAP_MUSCLES, type MapMuscle, type MuscleRecovery, type RecoveryLevel } from "@/lib/recovery";
import { cn } from "@/lib/utils";

const FILL: Record<RecoveryLevel, string> = {
  fresh: "fill-emerald-500",
  recovering: "fill-amber-400",
  fatigued: "fill-red-500",
};
const DOT: Record<RecoveryLevel, string> = { fresh: "bg-emerald-500", recovering: "bg-amber-400", fatigued: "bg-red-500" };

type Shape = { m: MapMuscle; d?: string; e?: [number, number, number, number]; r?: [number, number, number, number] };

/** Stylised body, mirrored shapes listed once per side. viewBox 0 0 100 190. */
const FRONT: Shape[] = [
  { m: "shoulders", e: [29, 41, 8, 7] },
  { m: "shoulders", e: [71, 41, 8, 7] },
  { m: "chest", r: [36.5, 35, 13, 15] },
  { m: "chest", r: [50.5, 35, 13, 15] },
  { m: "biceps", e: [26, 59, 5, 10] },
  { m: "biceps", e: [74, 59, 5, 10] },
  { m: "forearms", e: [23, 83, 4.5, 11] },
  { m: "forearms", e: [77, 83, 4.5, 11] },
  { m: "abs", r: [43, 52, 14, 32] },
  { m: "obliques", r: [36, 54, 6, 26] },
  { m: "obliques", r: [58, 54, 6, 26] },
  { m: "quads", e: [41.5, 116, 7.5, 21] },
  { m: "quads", e: [58.5, 116, 7.5, 21] },
  { m: "adductors", e: [47.5, 105, 2.6, 10] },
  { m: "adductors", e: [52.5, 105, 2.6, 10] },
  { m: "calves", e: [41.5, 160, 4.5, 15] },
  { m: "calves", e: [58.5, 160, 4.5, 15] },
];
const BACK: Shape[] = [
  { m: "traps", d: "M41 28 L59 28 L68 38 L50 47 L32 38 Z" },
  { m: "shoulders", e: [29, 41, 8, 7] },
  { m: "shoulders", e: [71, 41, 8, 7] },
  { m: "back", r: [40, 46, 20, 13] },
  { m: "lats", e: [37.5, 60, 4.5, 14] },
  { m: "lats", e: [62.5, 60, 4.5, 14] },
  { m: "lower_back", r: [43.5, 62, 13, 20] },
  { m: "triceps", e: [26, 59, 5, 10] },
  { m: "triceps", e: [74, 59, 5, 10] },
  { m: "forearms", e: [23, 83, 4.5, 11] },
  { m: "forearms", e: [77, 83, 4.5, 11] },
  { m: "glutes", e: [43, 95, 7.5, 8] },
  { m: "glutes", e: [57, 95, 7.5, 8] },
  { m: "hamstrings", e: [42, 124, 7, 18] },
  { m: "hamstrings", e: [58, 124, 7, 18] },
  { m: "calves", e: [42, 158, 6, 15] },
  { m: "calves", e: [58, 158, 6, 15] },
];

function Figure({ shapes, data, label }: { shapes: Shape[]; data: Record<MapMuscle, MuscleRecovery>; label: string }) {
  return (
    <figure className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 100 190" className="h-64 w-auto" aria-hidden>
        {/* silhouette */}
        <g className="fill-muted">
          <circle cx="50" cy="15" r="10" />
          <rect x="45" y="23" width="10" height="8" rx="2" />
          <rect x="33" y="31" width="34" height="58" rx="11" />
          <rect x="35" y="84" width="30" height="16" rx="6" />
          <rect x="19" y="34" width="15" height="62" rx="7" />
          <rect x="66" y="34" width="15" height="62" rx="7" />
          <rect x="33" y="94" width="16" height="84" rx="7" />
          <rect x="51" y="94" width="16" height="84" rx="7" />
        </g>
        {shapes.map((s, i) => {
          const cls = cn(FILL[data[s.m].level], "stroke-background stroke-[0.8]");
          if (s.d) return <path key={i} d={s.d} className={cls} />;
          if (s.r) return <rect key={i} x={s.r[0]} y={s.r[1]} width={s.r[2]} height={s.r[3]} rx="3.5" className={cls} />;
          const [cx, cy, rx, ry] = s.e!;
          return <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} className={cls} />;
        })}
      </svg>
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

/** Body map of muscle recovery + what is ready to train today. */
export function RecoveryMap({ history, catalog }: { history: TrainingHistory; catalog: Catalog | undefined }) {
  const t = useTranslations("recovery");
  const tm = useTranslations("muscles");
  const now = useNow(60_000);
  const data = useMemo(() => (catalog ? computeRecovery(history, catalog.byId, now) : null), [history, catalog, now]);
  if (!data) return null;

  const list = MAP_MUSCLES.map((m) => data[m]);
  const ready = list
    .filter((r) => r.level === "fresh")
    // longest since trained first: those are the best picks today
    .sort((a, b) => (a.lastTrainedAt ?? 0) - (b.lastTrainedAt ?? 0));
  const resting = list.filter((r) => r.level !== "fresh").sort((a, b) => (b.readyAt ?? 0) - (a.readyAt ?? 0));
  const hoursLeft = (r: MuscleRecovery) => Math.max(1, Math.ceil(((r.readyAt ?? now) - now) / 3_600_000));
  const neglected = (r: MuscleRecovery) => r.lastTrainedAt === null || now - r.lastTrainedAt > 7 * 86_400_000;

  return (
    <Card>
      <div className="flex items-center gap-2 text-sm font-semibold uppercase text-muted-foreground">
        <Activity className="size-4" aria-hidden /> {t("title")}
      </div>
      <div
        className="mt-2 flex justify-center gap-4"
        role="img"
        aria-label={t("aria", { ready: ready.map((r) => tm(r.muscle)).join(", ") || "-", resting: resting.map((r) => tm(r.muscle)).join(", ") || "-" })}
      >
        <Figure shapes={FRONT} data={data} label={t("front")} />
        <Figure shapes={BACK} data={data} label={t("back")} />
      </div>
      <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(["fresh", "recovering", "fatigued"] as const).map((l) => (
          <li key={l} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-full", DOT[l])} aria-hidden /> {t(l)}
          </li>
        ))}
      </ul>

      {ready.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold">{t("readyTitle")}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {ready.map((r) => (
              <li key={r.muscle} className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium">
                {tm(r.muscle)}
                {neglected(r) && <span className="text-muted-foreground"> · {r.lastTrainedAt === null ? t("never") : t("neglected")}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {resting.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold">{t("restingTitle")}</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {resting.map((r) => (
              <li key={r.muscle} className="flex items-center gap-2">
                <span className={cn("size-2.5 shrink-0 rounded-full", DOT[r.level])} aria-hidden />
                <span className="flex-1">{tm(r.muscle)}</span>
                <span className="num text-muted-foreground">{t("readyIn", { hours: hoursLeft(r) })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">{t("hint")}</p>
    </Card>
  );
}
