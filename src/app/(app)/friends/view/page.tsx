"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, EyeOff, Flame, Trophy, UserMinus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { Heatmap } from "@/components/charts";
import { Avatar } from "@/components/avatar";
import { Card, ConfirmDialog, EmptyState, PageHeader, Section, Stat } from "@/components/common";
import { Button } from "@/components/ui/button";
import { exerciseName, useExerciseCatalog } from "@/lib/catalog";
import { weeklyConsistency, workoutsPerDay } from "@/lib/calc/stats";
import { kgToUnit } from "@/lib/calc/units";
import { blockUser, friendProgress, giveKudos, KUDOS, listFriends, removeFriend, type Kudos } from "@/lib/data/friends";
import { formatClock, useUnit } from "@/lib/hooks";

function FriendView() {
  const id = useSearchParams().get("id") ?? "";
  const t = useTranslations();
  const f = useFormatter();
  const locale = useLocale();
  const unit = useUnit();
  const router = useRouter();
  const qc = useQueryClient();
  const catalog = useExerciseCatalog();
  const [confirm, setConfirm] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const kudos = useMutation({
    mutationFn: ({ workoutId, emoji }: { workoutId: string; emoji: Kudos }) => giveKudos(workoutId, emoji),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["friend-progress", id] }),
  });
  const block = useMutation({
    mutationFn: () => blockUser(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["friends"] });
      router.replace("/friends");
    },
  });
  const friends = useQuery({ queryKey: ["friends"], queryFn: listFriends });
  const progress = useQuery({ queryKey: ["friend-progress", id], queryFn: () => friendProgress(id), enabled: !!id });
  const row = friends.data?.find((x) => x.friend_id === id && x.status === "accepted");
  const remove = useMutation({
    mutationFn: () => removeFriend(row!.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["friends"] });
      router.replace("/friends");
    },
  });

  if (friends.isLoading || progress.isLoading) return null;
  if (!row || !progress.data) return <EmptyState>{t("friends.notFriends")}</EmptyState>;
  const p = progress.data;
  const name = row.display_name ?? t("friends.noName");
  const c = p.hidden ? null : weeklyConsistency(p.workout_dates ?? [], p.weekly_target ?? 3);

  return (
    <div className="space-y-6">
      <PageHeader back="/friends" title={name} />
      <div className="flex items-center gap-4">
        <Avatar url={row.avatar_url} name={name} className="size-20 text-3xl" />
        {!p.hidden && (
          <p className="text-muted-foreground">{t("friends.totalWorkouts", { count: p.total_workouts ?? 0 })}</p>
        )}
      </div>

      {p.hidden ? (
        <Card className="flex items-start gap-3">
          <EyeOff className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">{t("friends.hiddenExplain")}</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat
              label={t("progress.streak")}
              value={
                <span className="flex items-center gap-1">
                  <Flame className="size-6 text-primary" aria-hidden />
                  {c!.currentStreak}
                </span>
              }
              sub={t("progress.weeks", { count: c!.currentStreak })}
            />
            <Stat label={t("progress.bestStreak")} value={c!.bestStreak} sub={t("progress.weeks", { count: c!.bestStreak })} />
            <Stat label={t("home.thisWeek")} value={`${c!.thisWeekCount}/${c!.target}`} />
          </div>

          <Section title={t("progress.heatmap")}>
            <Card>
              <Heatmap counts={workoutsPerDay(p.workout_dates ?? [])} weeks={17} />
            </Card>
          </Section>

          {(p.share_streak === false || p.share_workouts === false || p.share_lifts === false) && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <EyeOff className="size-3.5" aria-hidden /> {t("social.partiallyHidden")}
            </p>
          )}
          {!!p.best?.some((b) => catalog?.byId.has(b.exercise_id)) && (
            <Section title={t("friends.bestLifts")}>
              <ul className="space-y-2">
                {p.best!.filter((b) => catalog?.byId.has(b.exercise_id)).map((b) => (
                  <li key={b.exercise_id} className="flex items-center gap-3 rounded-2xl border bg-card p-3">
                    <Trophy className="size-5 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-semibold">{exerciseName(catalog?.byId.get(b.exercise_id), locale)}</span>
                    <span className="num text-xl">
                      {f.number(kgToUnit(Number(b.e1rm), unit), { maximumFractionDigits: 1 })} {unit}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">{t("friends.e1rmNote")}</p>
            </Section>
          )}

          <Section title={t("friends.recent")}>
            {!p.recent?.length ? (
              <EmptyState>{t("friends.noWorkouts")}</EmptyState>
            ) : (
              <ul className="space-y-2">
                {p.recent.map((w) => (
                  <li key={w.id} className="rounded-2xl border bg-card p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate font-bold">{w.name ?? t("workout.untitled")}</p>
                      <time className="shrink-0 text-xs text-muted-foreground" dateTime={w.started_at}>
                        {f.dateTime(new Date(w.started_at), { weekday: "short", day: "numeric", month: "short" })}
                      </time>
                    </div>
                    <p className="text-sm">
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
                          onClick={() => kudos.mutate({ workoutId: w.id, emoji: e })}
                          className={`flex size-10 items-center justify-center rounded-full border text-lg ${w.my_kudos === e ? "border-primary bg-accent" : ""}`}
                        >
                          {e}
                        </button>
                      ))}
                      {w.kudos > 0 && <span className="ml-2 text-xs text-muted-foreground">{t("social.kudosCount", { count: w.kudos })}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" className="text-destructive" onClick={() => setConfirm(true)}>
          <UserMinus aria-hidden /> {t("friends.remove")}
        </Button>
        <Button variant="ghost" className="text-destructive" onClick={() => setConfirmBlock(true)}>
          <Ban aria-hidden /> {t("friends.block")}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmBlock}
        onOpenChange={setConfirmBlock}
        title={t("friends.block")}
        description={t("friends.blockConfirm", { name })}
        confirmLabel={t("friends.block")}
        destructive
        onConfirm={() => block.mutate()}
      />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("friends.remove")}
        description={t("friends.removeConfirm", { name })}
        confirmLabel={t("friends.remove")}
        destructive
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

export default function FriendViewPage() {
  return (
    <Suspense>
      <FriendView />
    </Suspense>
  );
}
