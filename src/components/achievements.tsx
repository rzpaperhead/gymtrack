"use client";

import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";
import { useLiveQuery } from "dexie-react-hooks";
import { Share2 } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, Section, Segmented } from "@/components/common";
import { useAuth, useProfile } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { computeBadges, summarizePeriod, type TrainingData } from "@/lib/achievements";
import { exerciseName, useExerciseCatalog } from "@/lib/catalog";
import { WEEK_OPTS } from "@/lib/calc/stats";
import { kgToUnit } from "@/lib/calc/units";
import { latestPerDate } from "@/lib/data/body";
import { db } from "@/lib/db/local";
import { formatClock, useUnit } from "@/lib/hooks";
import { useTrainingHistory } from "@/lib/history";
import { shareSummaryCard } from "@/lib/share-card";
import { cn } from "@/lib/utils";

/** Latest logged bodyweight, else the onboarding value, else 70 kg. */
export function useBodyweightKg(): number {
  const profile = useProfile();
  const latest = useLiveQuery(async () => {
    const rows = latestPerDate(await db.body_metrics.toArray()).filter((r) => r.weight_kg != null);
    return rows[rows.length - 1]?.weight_kg ?? null;
  }, []);
  return latest ?? profile?.bodyweight_start_kg ?? 70;
}

export function useTrainingData(): TrainingData | undefined {
  const history = useTrainingHistory();
  const catalog = useExerciseCatalog();
  return useMemo(
    () =>
      history && catalog
        ? { workouts: history.workouts, workoutExercises: history.workoutExercises, sets: history.sets, exercise: (id) => catalog.byId.get(id) }
        : undefined,
    [history, catalog],
  );
}

export function PeriodSummaryCard() {
  const t = useTranslations("achievements");
  const f = useFormatter();
  const locale = useLocale();
  const unit = useUnit();
  const profile = useProfile();
  const data = useTrainingData();
  const bw = useBodyweightKg();
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [busy, setBusy] = useState(false);

  const range = useMemo(() => {
    const now = new Date();
    return period === "week"
      ? { from: startOfWeek(now, WEEK_OPTS), to: endOfWeek(now, WEEK_OPTS) }
      : { from: startOfMonth(now), to: endOfMonth(now) };
  }, [period]);
  const s = useMemo(() => (data ? summarizePeriod(data, range.from, new Date(range.to.getTime() + 1), bw) : null), [data, range, bw]);
  if (!s || !data) return null;

  const vol = `${f.number(Math.round(kgToUnit(s.volumeKg, unit)), { notation: s.volumeKg > 999999 ? "compact" : "standard" })} ${unit}`;
  const top = s.topExerciseId ? exerciseName(data.exercise(s.topExerciseId), locale) : "—";
  const stats = [
    { label: t("sessions"), value: String(s.sessions) },
    { label: t("volume"), value: vol },
    { label: t("time"), value: formatClock(s.durationSec) },
    { label: t("prs"), value: String(s.prs) },
    { label: t("calories"), value: `${f.number(s.calories)} kkal` },
    { label: t("sets"), value: String(s.sets) },
  ];
  const rangeLabel = `${f.dateTime(range.from, { day: "numeric", month: "short" })} – ${f.dateTime(range.to, { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <Section title={t("summaryTitle")}>
      <Card className="space-y-3">
        <Segmented
          label={t("summaryTitle")}
          value={period}
          onChange={setPeriod}
          options={[
            { value: "week", label: t("thisWeek") },
            { value: "month", label: t("thisMonth") },
          ]}
        />
        <p className="text-xs text-muted-foreground">{rangeLabel}</p>
        <dl className="grid grid-cols-3 gap-2">
          {stats.map((st, i) => (
            <div key={st.label} className="rounded-xl bg-muted p-2">
              <dt className="text-[0.7rem] font-semibold uppercase text-muted-foreground">{st.label}</dt>
              <dd className={cn("num truncate text-xl", i === 0 && "text-primary")}>{st.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground">
          {t("topExercise")}: <span className="font-semibold text-foreground">{top}</span>
        </p>
        <p className="text-xs text-muted-foreground">{t("caloriesNote")}</p>
        <Button
          variant="secondary"
          className="w-full"
          disabled={busy || !s.sessions}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await shareSummaryCard({
                title: period === "week" ? t("thisWeek") : t("thisMonth"),
                subtitle: `${profile?.display_name ? `${profile.display_name} · ` : ""}${rangeLabel}`,
                stats,
                footer: `${t("topExercise")}: ${top}`,
                fileName: `gymtrack-${period}.png`,
                shareText: t("shareText"),
              });
              if (r === "downloaded") toast.success(t("downloaded"));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Share2 aria-hidden /> {t("share")}
        </Button>
      </Card>
    </Section>
  );
}

export function BadgesSection() {
  const t = useTranslations("achievements");
  const profile = useProfile();
  const data = useTrainingData();
  const [showAll, setShowAll] = useState(false);
  const badges = useMemo(() => (data ? computeBadges(data, profile?.weekly_target ?? 3) : []), [data, profile?.weekly_target]);
  if (!badges.length) return null;
  const earned = badges.filter((b) => b.earned).length;
  const list = showAll ? badges : [...badges].sort((a, b) => Number(b.earned) - Number(a.earned) || b.progress - a.progress).slice(0, 6);
  return (
    <Section
      title={t("badgesTitle", { earned, total: badges.length })}
      action={
        <Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)}>
          {showAll ? t("showLess") : t("showAll")}
        </Button>
      }
    >
      <ul className="grid grid-cols-3 gap-2">
        {list.map((b) => (
          <li
            key={b.key}
            className={cn("flex flex-col items-center gap-1 rounded-2xl border bg-card p-3 text-center", b.earned ? "border-primary/60" : "opacity-60")}
          >
            <span className={cn("text-3xl", !b.earned && "grayscale")} aria-hidden>
              {b.icon}
            </span>
            <span className="text-xs font-semibold leading-tight">{t(`badge.${b.key}`)}</span>
            {b.earned ? (
              <span className="text-[0.65rem] font-semibold text-primary">{t("earned")}</span>
            ) : (
              <span className="w-full">
                <span className="block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span className="block h-full bg-primary" style={{ width: `${b.progress * 100}%` }} />
                </span>
                <span className="sr-only">
                  {b.current}/{b.target}
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Toast when a badge is newly earned (e.g. right after finishing a workout). */
export function useBadgeWatcher() {
  const t = useTranslations("achievements");
  const { userId, ready } = useAuth();
  const profile = useProfile();
  const data = useTrainingData();
  const earnedKeys = useMemo(
    () => (data && profile ? computeBadges(data, profile.weekly_target).filter((b) => b.earned).map((b) => b.key) : null),
    [data, profile],
  );
  useEffect(() => {
    if (!earnedKeys || !userId || !ready) return;
    const key = `gt-badges:${userId}`;
    try {
      const seen = localStorage.getItem(key);
      if (seen != null) {
        const prev = new Set(JSON.parse(seen) as string[]);
        for (const k of earnedKeys) if (!prev.has(k)) toast.success(t("newBadge", { name: t(`badge.${k}`) }), { icon: "🏅" });
      }
      localStorage.setItem(key, JSON.stringify(earnedKeys));
    } catch {}
  }, [earnedKeys, userId, ready, t]);
}
