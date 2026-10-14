"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/common";
import { kgToUnit } from "@/lib/calc/units";
import { giveKudos, KUDOS, type Kudos } from "@/lib/data/friends";
import { formatClock, useUnit } from "@/lib/hooks";
import { getSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface FeedItem {
  workout_id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  name: string | null;
  started_at: string;
  duration_sec: number | null;
  sets: number;
  volume_kg: number;
  kudos: number;
  my_kudos: Kudos | null;
}

async function loadFeed(): Promise<FeedItem[]> {
  const { data, error } = await (await getSupabase()).rpc("friends_feed", { p_days: 14 });
  if (error) throw error;
  return data as FeedItem[];
}

/** Friends' recent workouts (last 14 days) with quick kudos. */
export function ActivityFeed() {
  const t = useTranslations();
  const f = useFormatter();
  const unit = useUnit();
  const qc = useQueryClient();
  const feed = useQuery({ queryKey: ["feed"], queryFn: loadFeed, refetchInterval: 60_000 });
  const kudos = useMutation({
    mutationFn: ({ id, emoji }: { id: string; emoji: Kudos }) => giveKudos(id, emoji),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feed"] }),
  });

  if (feed.isSuccess && !feed.data.length) return <EmptyState>{t("social.feedEmpty")}</EmptyState>;
  return (
    <ul className="space-y-3">
      {feed.data?.map((w) => (
        <li key={w.workout_id} className="rounded-2xl border bg-card p-3">
          <Link href={`/friends/view?id=${w.user_id}`} className="flex items-center gap-3">
            <Avatar url={w.avatar_url} name={w.display_name} className="size-10 text-base" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">
                <span className="font-semibold">{w.display_name}</span> {t("social.finished")} <span className="font-semibold">{w.name ?? t("workout.untitled")}</span>
              </span>
              <span className="block text-xs text-muted-foreground">{f.relativeTime(new Date(w.started_at))}</span>
            </span>
          </Link>
          <p className="mt-2 text-sm">
            {w.duration_sec != null && <span className="num">{formatClock(w.duration_sec)} · </span>}
            {t("common.sets", { count: w.sets })}
            {w.volume_kg > 0 && (
              <span className="num">
                {" "}
                · {f.number(Math.round(kgToUnit(w.volume_kg, unit)))} {unit}
              </span>
            )}
          </p>
          <div className="mt-2 flex items-center gap-1" role="group" aria-label={t("social.giveKudos")}>
            {KUDOS.map((e) => (
              <button
                key={e}
                type="button"
                aria-pressed={w.my_kudos === e}
                aria-label={`${t("social.giveKudos")} ${e}`}
                onClick={() => kudos.mutate({ id: w.workout_id, emoji: e })}
                className={cn("flex size-10 items-center justify-center rounded-full border text-lg", w.my_kudos === e && "border-primary bg-accent")}
              >
                {e}
              </button>
            ))}
            {w.kudos > 0 && <span className="ml-2 text-xs text-muted-foreground">{t("social.kudosCount", { count: w.kudos })}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
