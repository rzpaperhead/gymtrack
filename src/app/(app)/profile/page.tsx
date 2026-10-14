"use client";

import { useMutation } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { Bell, Camera, ChevronRight, ShieldCheck, ClipboardList, Crown, Download, Dumbbell, LayoutList, LogOut, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/avatar";
import { Card, ConfirmDialog, Field, NativeSelect, PageHeader, Section, Segmented } from "@/components/common";
import { useAuth, useProfile } from "@/components/providers/auth-provider";
import { useSetLocale } from "@/components/providers/i18n-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LOCALE_LABELS } from "@/i18n/messages";
import { removeAvatar, setAvatar } from "@/lib/data/avatar";
import { exportWorkoutsCsv } from "@/lib/data/export";
import { updateProfile } from "@/lib/data/profile";
import { clearLocalData, db } from "@/lib/db/local";
import { syncNow, useSyncStatus } from "@/lib/db/sync-manager";
import { formatClock, useEntitlements, useIsAdmin } from "@/lib/hooks";
import { authHeader } from "@/lib/supabase/client";
import type { Goal, Locale, ThemePref, Unit } from "@/lib/types";

const REST = [30, 45, 60, 90, 120, 150, 180, 240, 300];

export default function ProfilePage() {
  const t = useTranslations();
  const f = useFormatter();
  const router = useRouter();
  const profile = useProfile();
  const { email, mode, signOut, userId } = useAuth();
  const { setLocale } = useSetLocale();
  const ent = useEntitlements();
  const admin = useIsAdmin();
  const avatarRef = useRef<HTMLInputElement>(null);
  const sync = useSyncStatus();
  const sub = useLiveQuery(async () => (userId ? db.subscriptions.get(userId) : undefined), [userId]);
  const [name, setName] = useState("");
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [notif, setNotif] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only API
    setNotif(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed the field once the profile loads
    if (profile) setName(profile.display_name);
  }, [profile?.display_name]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteAccount = useMutation({
    mutationFn: async () => {
      if (mode === "supabase") {
        const res = await fetch("/api/account", { method: "DELETE", headers: await authHeader() });
        if (!res.ok) throw new Error(await res.text());
      }
      await clearLocalData();
      await signOut();
    },
    onSuccess: () => {
      toast.success(t("profile.deleted"));
      router.replace("/");
    },
    onError: () => toast.error(t("common.error")),
  });

  if (!profile) return null;
  const set = (patch: Parameters<typeof updateProfile>[0]) => updateProfile(patch);

  return (
    <div className="space-y-6">
      <PageHeader title={t("profile.title")} />

      <Card className="flex items-center gap-3">
        <div className="relative">
          <Avatar url={profile.avatar_url} name={profile.display_name || email || "G"} className="size-16" />
          <input
            ref={avatarRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label={t("profile.changePhoto")}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                await setAvatar(file);
                toast.success(t("profile.photoSaved"));
              } catch {
                toast.error(t("common.error"));
              }
            }}
          />
          <button
            type="button"
            onClick={() => avatarRef.current?.click()}
            aria-label={t("profile.changePhoto")}
            className="absolute -right-1 -bottom-1 flex size-8 items-center justify-center rounded-full border-2 border-card bg-secondary"
          >
            <Camera className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{profile.display_name || "—"}</p>
          <p className="truncate text-sm text-muted-foreground">{email ?? t("common.demoMode")}</p>
          {profile.avatar_url && (
            <button type="button" className="text-xs text-muted-foreground underline underline-offset-2" onClick={() => removeAvatar()}>
              {t("profile.removePhoto")}
            </button>
          )}
        </div>
        <Link href="/premium" className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold">
          <Crown className="size-4 text-primary" aria-hidden />
          {admin ? "Admin" : ent.tier === "premium" ? t("common.premium") : t("common.free")}
        </Link>
      </Card>

      {admin && (
        <Link href="/admin" className="flex min-h-14 items-center gap-3 rounded-2xl border border-primary bg-card px-4 font-bold">
          <ShieldCheck className="size-5 text-primary" aria-hidden /> <span className="flex-1">{t("admin.title")}</span> <ChevronRight aria-hidden />
        </Link>
      )}

      {ent.tier === "free" && !admin && (
        <Link href="/premium" className="flex min-h-14 items-center gap-3 rounded-2xl bg-primary px-4 font-bold text-primary-foreground">
          <Crown aria-hidden /> <span className="flex-1">{t("profile.upgrade")}</span> <ChevronRight aria-hidden />
        </Link>
      )}

      <Section title={t("profile.settings")}>
        <Card className="space-y-4">
          <Field label={t("profile.displayName")} htmlFor="p-name">
            <Input id="p-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onBlur={() => name !== profile.display_name && set({ display_name: name.trim() })} />
          </Field>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">{t("profile.language")}</span>
            <Segmented<Locale>
              label={t("profile.language")}
              value={profile.locale}
              onChange={(l) => {
                setLocale(l);
                void set({ locale: l });
              }}
              options={(["id", "en"] as const).map((l) => ({ value: l, label: LOCALE_LABELS[l] }))}
            />
          </div>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">{t("profile.unit")}</span>
            <Segmented<Unit> label={t("profile.unit")} value={profile.unit} onChange={(u) => set({ unit: u })} options={[{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }]} />
          </div>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">{t("profile.theme")}</span>
            <Segmented<ThemePref>
              label={t("profile.theme")}
              value={profile.theme}
              onChange={(v) => set({ theme: v })}
              options={(["dark", "light", "system"] as const).map((v) => ({ value: v, label: t(`profile.themes.${v}`) }))}
            />
          </div>
          <NativeSelect label={t("profile.restDefault")} value={String(profile.default_rest_sec)} onChange={(v) => set({ default_rest_sec: Number(v) })}>
            {[...new Set([...REST, profile.default_rest_sec])].sort((a, b) => a - b).map((s) => (
              <option key={s} value={s}>
                {formatClock(s)}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect label={t("profile.weeklyTarget")} value={String(profile.weekly_target)} onChange={(v) => set({ weekly_target: Number(v) })}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect label={t("profile.goal")} value={profile.goal} onChange={(v) => set({ goal: v as Goal })}>
            {(["strength", "hypertrophy", "general"] as const).map((g) => (
              <option key={g} value={g}>
                {t(`goals.${g}`)}
              </option>
            ))}
          </NativeSelect>
          {notif !== "unsupported" && (
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Bell className="size-4" aria-hidden /> {t("profile.notifications")}
              </span>
              {notif === "granted" ? (
                <span className="text-sm text-muted-foreground">{t("profile.notificationsOn")}</span>
              ) : notif === "denied" ? (
                <span className="text-sm text-muted-foreground">{t("profile.notificationsBlocked")}</span>
              ) : (
                <Button size="sm" variant="secondary" onClick={async () => setNotif(await Notification.requestPermission())}>
                  {t("rest.enableNotifications")}
                </Button>
              )}
            </div>
          )}
        </Card>
      </Section>

      <nav aria-label={t("workout.title")} className="divide-y rounded-2xl border bg-card">
        {[
          { href: "/templates", label: t("profile.manageTemplates"), icon: ClipboardList },
          { href: "/programs", label: t("profile.managePrograms"), icon: LayoutList },
          { href: "/exercises", label: t("profile.manageExercises"), icon: Dumbbell },
        ].map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex min-h-14 items-center gap-3 px-4 font-semibold">
            <Icon className="size-5 text-primary" aria-hidden /> <span className="flex-1">{label}</span> <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </nav>

      <Section title={t("profile.account")}>
        <Card className="space-y-3">
          {mode === "supabase" && (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold">
                  {t("profile.sync")}: {t(`sync.${sync.state}`)}
                </p>
                {sync.pending > 0 && <p className="text-muted-foreground">{t("sync.pending", { count: sync.pending })}</p>}
                {sync.failed > 0 && <p className="text-destructive">{t("sync.failed", { count: sync.failed })}</p>}
                {sync.lastSyncedAt && <p className="text-muted-foreground">{t("profile.lastSynced", { time: f.relativeTime(sync.lastSyncedAt) })}</p>}
              </div>
              <Button size="icon" variant="secondary" aria-label={t("profile.syncNow")} onClick={() => syncNow()}>
                <RefreshCw className={sync.state === "syncing" ? "animate-spin" : ""} />
              </Button>
            </div>
          )}
          {sub?.current_period_end && ent.tier === "premium" && (
            <p className="text-sm text-muted-foreground">{t("premium.until", { date: f.dateTime(new Date(sub.current_period_end), { dateStyle: "medium" }) })}</p>
          )}
          <Button
            variant="secondary"
            className="w-full"
            onClick={async () => (ent.csvExport ? exportWorkoutsCsv(profile.unit, profile.locale) : router.push("/premium"))}
          >
            <Download aria-hidden /> {t("profile.exportData")} {!ent.csvExport && <Crown className="size-4 text-primary" aria-label={t("common.premium")} />}
          </Button>
          <Button variant="outline" className="w-full" onClick={() => (sync.pending ? setConfirmSignOut(true) : signOut().then(() => router.replace("/")))}>
            <LogOut aria-hidden /> {t("auth.signOut")}
          </Button>
          <Button variant="ghost" className="w-full text-destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 aria-hidden /> {t("profile.deleteAccount")}
          </Button>
        </Card>
      </Section>

      <footer className="space-y-1 pb-4 text-center text-sm text-muted-foreground">
        <p>
          <Link href="/privacy" className="underline underline-offset-4">
            {t("landing.privacy")}
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="underline underline-offset-4">
            {t("landing.terms")}
          </Link>
        </p>
        <p>{t("profile.version", { version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0" })}</p>
      </footer>

      <ConfirmDialog
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        title={t("auth.signOut")}
        description={t("auth.signOutPending", { count: sync.pending })}
        confirmLabel={t("auth.signOut")}
        destructive
        onConfirm={async () => {
          await signOut();
          router.replace("/");
        }}
      />
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent closeLabel={t("common.close")}>
          <DialogHeader>
            <DialogTitle>{t("profile.deleteAccount")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("profile.deleteAccountBody")}</p>
          <Input aria-label={t("profile.deleteKeyword")} value={deleteText} onChange={(e) => setDeleteText(e.target.value)} autoComplete="off" />
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={deleteText.trim().toUpperCase() !== t("profile.deleteKeyword") || deleteAccount.isPending}
              onClick={() => deleteAccount.mutate()}
            >
              {t("profile.deleteAccount")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
