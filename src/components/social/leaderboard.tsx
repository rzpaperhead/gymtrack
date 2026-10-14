"use client";

import { useQuery } from "@tanstack/react-query";
import { Medal } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { EmptyState, Segmented } from "@/components/common";
import { kgToUnit } from "@/lib/calc/units";
import { leaderboard, type LeaderMetric } from "@/lib/data/friends";
import { useUnit } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** This week's ranking among friends who share the metric (incl. me). */
export function Leaderboard() {
  const t = useTranslations("social");
  const f = useFormatter();
  const unit = useUnit();
  const [metric, setMetric] = useState<LeaderMetric>("sessions");
  const q = useQuery({ queryKey: ["leaderboard", metric], queryFn: () => leaderboard(metric) });
  const fmt = (v: number) =>
    metric === "volume" ? `${f.number(Math.round(kgToUnit(v, unit)), { notation: v > 99999 ? "compact" : "standard" })} ${unit}` : t("sessionsCount", { count: v });

  return (
    <div className="space-y-3">
      <Segmented
        label={t("leaderboard")}
        value={metric}
        onChange={setMetric}
        options={[
          { value: "sessions", label: t("metric.sessions") },
          { value: "volume", label: t("metric.volume") },
        ]}
      />
      <p className="text-xs text-muted-foreground">{t("thisWeekNote")}</p>
      {q.data && q.data.length <= 1 ? (
        <EmptyState>{t("leaderboardEmpty")}</EmptyState>
      ) : (
        <ol className="space-y-2">
          {q.data?.map((r, i) => (
            <li key={r.user_id} className={cn("flex items-center gap-3 rounded-2xl border bg-card p-3", r.is_me && "border-primary")}>
              <span className="num w-7 text-center text-xl" aria-label={t("rank", { n: i + 1 })}>
                {i < 3 ? <Medal className={cn("mx-auto size-6", i === 0 ? "text-primary" : i === 1 ? "text-chart-2" : "text-chart-3")} aria-hidden /> : i + 1}
              </span>
              <Avatar url={r.avatar_url} name={r.display_name} className="size-10 text-base" />
              <span className="min-w-0 flex-1 truncate font-semibold">
                {r.display_name}
                {r.is_me && <span className="ml-1 text-xs text-muted-foreground">({t("you")})</span>}
              </span>
              <span className="num shrink-0 text-lg">{fmt(r.value)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
