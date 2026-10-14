"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Plus, Target, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/avatar";
import { Card, ConfirmDialog, EmptyState, Field, Segmented } from "@/components/common";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { kgToUnit, unitToKg } from "@/lib/calc/units";
import {
  challengeProgress,
  createChallenge,
  deleteChallenge,
  joinChallenge,
  leaveChallenge,
  listChallenges,
  listFriends,
  type Challenge,
  type LeaderMetric,
} from "@/lib/data/friends";
import { useNow, useUnit } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export function Challenges() {
  const t = useTranslations("social");
  const [creating, setCreating] = useState(false);
  const list = useQuery({ queryKey: ["challenges"], queryFn: listChallenges });
  const today = new Date().toISOString().slice(0, 10);
  const active = list.data?.filter((c) => c.end_date >= today) ?? [];
  const past = list.data?.filter((c) => c.end_date < today) ?? [];
  return (
    <div className="space-y-4">
      <Button className="w-full" onClick={() => setCreating(true)}>
        <Plus aria-hidden /> {t("newChallenge")}
      </Button>
      {list.isSuccess && !list.data.length && <EmptyState>{t("challengesEmpty")}</EmptyState>}
      {active.map((c) => (
        <ChallengeCard key={c.id} c={c} />
      ))}
      {past.length > 0 && (
        <details className="rounded-2xl border p-3">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">{t("pastChallenges", { count: past.length })}</summary>
          <div className="mt-2 space-y-3">
            {past.map((c) => (
              <ChallengeCard key={c.id} c={c} />
            ))}
          </div>
        </details>
      )}
      {creating && <CreateChallenge onClose={() => setCreating(false)} />}
    </div>
  );
}

function ChallengeCard({ c }: { c: Challenge }) {
  const t = useTranslations("social");
  const f = useFormatter();
  const unit = useUnit();
  const qc = useQueryClient();
  const { userId } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const now = useNow(60_000);
  const members = useQuery({ queryKey: ["challenge", c.id], queryFn: () => challengeProgress(c.id) });
  const me = members.data?.find((m) => m.is_me);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["challenge", c.id] });
    void qc.invalidateQueries({ queryKey: ["challenges"] });
  };
  const join = useMutation({ mutationFn: () => joinChallenge(c.id), onSuccess: refresh });
  const leave = useMutation({ mutationFn: () => leaveChallenge(c.id, userId!), onSuccess: refresh });
  const del = useMutation({ mutationFn: () => deleteChallenge(c.id), onSuccess: refresh });

  const target = c.metric === "volume" ? kgToUnit(c.target, unit) : c.target;
  const show = (v: number) => (c.metric === "volume" ? `${f.number(Math.round(kgToUnit(v, unit)))} ${unit}` : t("sessionsCount", { count: v }));
  const daysLeft = Math.max(0, Math.ceil((Date.parse(`${c.end_date}T23:59:59`) - now) / 86400000));

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold">{c.title}</h3>
          <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Target className="size-3.5" aria-hidden />
              {c.metric === "volume" ? `${f.number(Math.round(target))} ${unit}` : t("sessionsCount", { count: c.target })}
            </span>
            <span className="flex items-center gap-1">
              <CalendarRange className="size-3.5" aria-hidden />
              {f.dateTime(new Date(`${c.start_date}T12:00:00`), { day: "numeric", month: "short" })} –{" "}
              {f.dateTime(new Date(`${c.end_date}T12:00:00`), { day: "numeric", month: "short" })}
              {daysLeft > 0 && ` · ${t("daysLeft", { count: daysLeft })}`}
            </span>
          </p>
        </div>
        {c.creator === userId && (
          <Button variant="ghost" size="icon" aria-label={t("deleteChallenge")} onClick={() => setConfirmDelete(true)}>
            <Trash2 />
          </Button>
        )}
      </div>
      <ul className="space-y-2">
        {members.data?.map((m) => {
          const pct = Math.min(100, (m.value / c.target) * 100);
          return (
            <li key={m.user_id} className={cn(m.status === "invited" && "opacity-60")}>
              <div className="flex items-center gap-2 text-sm">
                <Avatar url={m.avatar_url} name={m.display_name} className="size-7 text-xs" />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {m.display_name}
                  {m.is_me && <span className="text-muted-foreground"> ({t("you")})</span>}
                </span>
                <span className="num shrink-0">{m.status === "invited" ? t("invited") : show(m.value)}</span>
                {pct >= 100 && <span aria-label={t("completed")}>🏆</span>}
              </div>
              <div
                className="mt-1 h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pct)}
                aria-label={m.display_name}
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      {me?.status === "invited" && (
        <div className="flex gap-2">
          <Button className="flex-1" disabled={join.isPending} onClick={() => join.mutate()}>
            {t("join")}
          </Button>
          <Button variant="outline" disabled={leave.isPending} onClick={() => leave.mutate()}>
            {t("decline")}
          </Button>
        </div>
      )}
      {me?.status === "joined" && c.creator !== userId && (
        <Button variant="ghost" size="sm" onClick={() => leave.mutate()}>
          {t("leave")}
        </Button>
      )}
      {me?.status === "invited" && <p className="text-xs text-muted-foreground">{t("joinNote")}</p>}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("deleteChallenge")}
        description={c.title}
        confirmLabel={t("deleteChallenge")}
        destructive
        onConfirm={() => del.mutate()}
      />
    </Card>
  );
}

function CreateChallenge({ onClose }: { onClose: () => void }) {
  const t = useTranslations("social");
  const tc = useTranslations("common");
  const unit = useUnit();
  const qc = useQueryClient();
  const friends = useQuery({ queryKey: ["friends"], queryFn: listFriends });
  const [title, setTitle] = useState("");
  const [metric, setMetric] = useState<LeaderMetric>("sessions");
  const [target, setTarget] = useState("12");
  const [days, setDays] = useState("30");
  const [picked, setPicked] = useState<string[]>([]);
  const accepted = friends.data?.filter((f) => f.status === "accepted") ?? [];
  const create = useMutation({
    mutationFn: () =>
      createChallenge({
        title,
        metric,
        target: metric === "volume" ? unitToKg(Number(target), unit) : Number(target),
        days: Number(days),
        friends: picked,
      }),
    onSuccess: () => {
      toast.success(t("challengeCreated"));
      void qc.invalidateQueries({ queryKey: ["challenges"] });
      onClose();
    },
    onError: () => toast.error(tc("error")),
  });
  const valid = title.trim() && Number(target) > 0 && Number(days) >= 1 && Number(days) <= 366;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" closeLabel={tc("close")}>
        <DialogHeader>
          <DialogTitle>{t("newChallenge")}</DialogTitle>
        </DialogHeader>
        <Field label={t("challengeTitle")} htmlFor="ch-title">
          <Input id="ch-title" value={title} maxLength={80} placeholder={t("challengeTitlePlaceholder")} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Segmented
          label={t("metricLabel")}
          value={metric}
          onChange={(m) => {
            setMetric(m);
            setTarget(m === "volume" ? (unit === "kg" ? "50000" : "110000") : "12");
          }}
          options={[
            { value: "sessions", label: t("metric.sessions") },
            { value: "volume", label: t("metric.volume") },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label={metric === "volume" ? `${t("target")} (${unit})` : t("target")} htmlFor="ch-target">
            <Input id="ch-target" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label={t("durationDays")} htmlFor="ch-days">
            <Input id="ch-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">{t("inviteFriends")}</legend>
          {!accepted.length ? (
            <p className="text-sm text-muted-foreground">{t("noFriendsYet")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {accepted.map((f) => {
                const on = picked.includes(f.friend_id);
                return (
                  <button
                    key={f.friend_id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPicked(on ? picked.filter((x) => x !== f.friend_id) : [...picked, f.friend_id])}
                    className={cn("flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm", on && "border-primary bg-primary text-primary-foreground")}
                  >
                    <Avatar url={f.avatar_url} name={f.display_name ?? "?"} className="size-6 text-xs" />
                    {f.display_name ?? "—"}
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>
        <DialogFooter>
          <Button size="lg" disabled={!valid || create.isPending} onClick={() => create.mutate()}>
            {t("createChallenge")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
