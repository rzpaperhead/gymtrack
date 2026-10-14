"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CalendarDays, Flame, Play, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { CoachCard } from "@/components/coach-card";
import { RecoveryMap } from "@/components/recovery-map";
import { ChatButton } from "@/components/social/chat-button";
import { Card, EmptyState, LinkButton, Section } from "@/components/common";
import { useProfile } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { useStartWorkout } from "@/components/workout/start-workout";
import { WorkoutCard } from "@/components/workout/workout-card";
import { exerciseName, getTemplate, templateName, useExerciseCatalog } from "@/lib/catalog";
import { weeklyConsistency } from "@/lib/calc/stats";
import { getActiveProgram } from "@/lib/data/programs";
import { useActiveWorkout, useUnit } from "@/lib/hooks";
import { useTrainingHistory } from "@/lib/history";

export default function HomePage() {
  const t = useTranslations();
  const locale = useLocale();
  const profile = useProfile();
  const unit = useUnit();
  const active = useActiveWorkout();
  const history = useTrainingHistory();
  const catalog = useExerciseCatalog();
  const { start, dialog } = useStartWorkout();

  const today = useLiveQuery(async () => {
    const p = await getActiveProgram();
    if (!p) return { program: null, template: null } as const;
    const day = p.days.find((d) => d.weekday === new Date().getDay());
    const template = day ? await getTemplate(day.template_id) : undefined;
    return { program: p.program, template: template ?? null };
  }, []);

  const consistency = history ? weeklyConsistency(history.workouts.map((w) => w.started_at), profile?.weekly_target ?? 3) : undefined;

  return (
    <div className="space-y-6 pt-4">
      <header className="pt-safe flex items-center gap-3">
        <div className="min-w-0 flex-1">
        <p className="text-sm text-muted-foreground">
          {new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(new Date())}
        </p>
        <h1 className="text-4xl font-extrabold uppercase">
          {profile?.display_name ? t("home.greeting", { name: profile.display_name }) : t("home.greetingNoName")}
        </h1>
        </div>
        <ChatButton />
        <Link href="/profile" aria-label={t("nav.profile")}>
          <Avatar url={profile?.avatar_url} name={profile?.display_name ?? ""} className="size-12 text-xl" />
        </Link>
      </header>

      {active ? (
        <Card className="border-primary">
          <p className="text-sm font-semibold uppercase text-muted-foreground">{t("active.title")}</p>
          <p className="mt-1 text-2xl font-bold">{active.name ?? t("workout.untitled")}</p>
          <LinkButton href="/workout/active" size="xl" className="mt-4 w-full">
            <Play aria-hidden /> {t("home.resume")}
          </LinkButton>
        </Card>
      ) : (
        <Card>
          <div className="flex items-center gap-2 text-sm font-semibold uppercase text-muted-foreground">
            <CalendarDays className="size-4" aria-hidden /> {t("home.today")}
          </div>
          {today === undefined ? (
            <div className="h-24" />
          ) : today.template ? (
            <>
              <p className="mt-1 text-3xl font-extrabold uppercase">{templateName(today.template.template, locale)}</p>
              <p className="text-sm text-muted-foreground">
                {today.program?.name} ·{" "}
                {today.template.items
                  .slice(0, 4)
                  .map((i) => exerciseName(catalog?.byId.get(i.exercise_id), locale))
                  .join(", ")}
                {today.template.items.length > 4 ? "…" : ""}
              </p>
              <Button size="xl" className="mt-4 w-full" onClick={() => start({ templateId: today.template!.template.id })}>
                <Play aria-hidden /> {t("home.startToday", { name: templateName(today.template.template, locale) })}
              </Button>
            </>
          ) : today.program ? (
            <p className="mt-2 text-muted-foreground">{t("home.restDay")}</p>
          ) : (
            <div className="mt-2 space-y-3">
              <p className="text-muted-foreground">{t("home.noProgram")}</p>
              <LinkButton href="/programs" variant="secondary">
                {t("home.chooseProgram")}
              </LinkButton>
            </div>
          )}
          {!today?.template && (
            <Button size="xl" className="mt-4 w-full" onClick={() => start({})}>
              <Plus aria-hidden /> {t("home.startEmpty")}
            </Button>
          )}
        </Card>
      )}

      {consistency && (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <p className="text-xs font-semibold uppercase text-muted-foreground">{t("home.thisWeek")}</p>
            <p className="num text-4xl">
              {consistency.thisWeekCount}
              <span className="text-xl text-muted-foreground">/{consistency.target}</span>
            </p>
            <div className="mt-2 flex gap-1" aria-label={t("home.weekProgress", { count: consistency.thisWeekCount, target: consistency.target })} role="img">
              {Array.from({ length: consistency.target }, (_, i) => (
                <span key={i} className={`h-2 flex-1 rounded-full ${i < consistency.thisWeekCount ? "bg-primary" : "bg-muted"}`} />
              ))}
            </div>
          </Card>
          <Card>
            <p className="text-xs font-semibold uppercase text-muted-foreground">{t("progress.streak")}</p>
            <p className="num flex items-center gap-1 text-4xl">
              <Flame className="size-7 text-primary" aria-hidden />
              {consistency.currentStreak}
            </p>
            <p className="text-xs text-muted-foreground">{t("home.streak", { count: consistency.currentStreak })}</p>
          </Card>
        </div>
      )}

      {history && history.rows.length > 0 && <CoachCard history={history} weeklyTarget={profile?.weekly_target ?? 3} />}

      {history && history.rows.length > 0 && <RecoveryMap history={history} catalog={catalog} />}

      <Section
        title={t("home.recent")}
        action={
          history?.rows.length ? (
            <LinkButton href="/workout#history" variant="ghost" size="sm">
              {t("home.seeAll")}
            </LinkButton>
          ) : null
        }
      >
        {history && !history.rows.length && <EmptyState>{t("home.noWorkouts")}</EmptyState>}
        <div className="space-y-3">
          {history?.rows.slice(0, 3).map((r) => (
            <WorkoutCard key={r.workout.id} row={r} catalog={catalog} unit={unit} />
          ))}
        </div>
      </Section>
      {dialog}
    </div>
  );
}
