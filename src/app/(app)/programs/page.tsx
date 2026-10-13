"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog, Field, NativeSelect, PageHeader, PaywallCard, Section } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { findTemplateSync, templateName, useTemplates } from "@/lib/catalog";
import { activateBuiltinProgram, deleteProgram, saveCustomProgram, setProgramActive } from "@/lib/data/programs";
import { alive, db } from "@/lib/db/local";
import { useEntitlements } from "@/lib/hooks";
import { BUILTIN_PROGRAMS } from "@/lib/templates/builtin";
import type { Program, ProgramDay } from "@/lib/types";
import { cn } from "@/lib/utils";

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function ProgramsPage() {
  const t = useTranslations();
  const locale = useLocale();
  const ent = useEntitlements();
  const templates = useTemplates();
  const [editing, setEditing] = useState<{ program?: Program; days?: ProgramDay[] } | null>(null);
  const [paywall, setPaywall] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    const [ps, ds] = await Promise.all([db.programs.toArray(), db.program_days.toArray()]);
    return { programs: ps.filter(alive), days: ds.filter(alive) };
  }, []);

  const mine = templates?.mine.map((x) => x.template) ?? [];
  const activeBuiltinKey = data?.programs.find((p) => p.is_active && p.builtin_key)?.builtin_key;
  const custom = data?.programs.filter((p) => !p.builtin_key) ?? [];

  const scheduleText = (schedule: Record<number, string>) =>
    WEEK_ORDER.filter((d) => schedule[d])
      .map((d) => `${t(`weekdays.${d}` as "weekdays.0").slice(0, 3)}: ${templateName(findTemplateSync(schedule[d], mine), locale)}`)
      .join(" · ");

  return (
    <div className="space-y-6">
      <PageHeader back="/workout" title={t("programs.title")} />

      <Section title={t("programs.builtin")}>
        <div className="space-y-3">
          {BUILTIN_PROGRAMS.map((p) => {
            const active = activeBuiltinKey === p.key;
            return (
              <article key={p.key} className={cn("rounded-2xl border bg-card p-4", active && "border-primary")}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-xl font-bold uppercase">{locale === "en" ? p.name_en : p.name_id}</h3>
                    <p className="text-sm text-muted-foreground">{t("programs.daysPerWeek", { count: p.days_per_week })}</p>
                  </div>
                  {active && (
                    <span className="flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground">
                      <CheckCircle2 className="size-4" aria-hidden /> {t("programs.active")}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm">{scheduleText(p.schedule)}</p>
                <Button
                  className="mt-3 w-full"
                  variant={active ? "secondary" : "default"}
                  onClick={async () => {
                    if (active) {
                      const prog = data?.programs.find((x) => x.builtin_key === p.key);
                      if (prog) await setProgramActive(prog.id, false);
                    } else {
                      await activateBuiltinProgram(p.key, locale);
                      toast.success(t("programs.activated"));
                    }
                  }}
                >
                  {active ? t("programs.deactivate") : t("programs.activate")}
                </Button>
              </article>
            );
          })}
        </div>
      </Section>

      <Section
        title={t("programs.custom")}
        action={
          <Button size="sm" variant="secondary" onClick={() => (ent.customPrograms ? setEditing({}) : setPaywall(true))}>
            <Plus aria-hidden /> {t("programs.createCustom")}
          </Button>
        }
      >
        {(paywall || (!ent.customPrograms && !custom.length)) && <PaywallCard reason={t("programs.customPremium")} />}
        <div className="space-y-3">
          {custom.map((p) => {
            const days = data!.days.filter((d) => d.program_id === p.id);
            const schedule = Object.fromEntries(days.map((d) => [d.weekday, d.template_id]));
            return (
              <article key={p.id} className={cn("rounded-2xl border bg-card p-4", p.is_active && "border-primary")}>
                <div className="flex items-center gap-1">
                  <h3 className="min-w-0 flex-1 truncate text-xl font-bold uppercase">{p.name}</h3>
                  {ent.customPrograms && (
                    <Button variant="ghost" size="icon" aria-label={t("common.edit")} onClick={() => setEditing({ program: p, days })}>
                      <Pencil />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" aria-label={t("common.delete")} onClick={() => setToDelete(p.id)}>
                    <Trash2 />
                  </Button>
                </div>
                <p className="mt-1 text-sm">{scheduleText(schedule)}</p>
                <Button className="mt-3 w-full" variant={p.is_active ? "secondary" : "default"} onClick={() => setProgramActive(p.id, !p.is_active)}>
                  {p.is_active ? t("programs.deactivate") : t("programs.activate")}
                </Button>
              </article>
            );
          })}
        </div>
      </Section>

      {editing && <ProgramDialog initial={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t("common.delete")}
        description={t("programs.deleteConfirm")}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={() => deleteProgram(toDelete!)}
      />
    </div>
  );
}

function ProgramDialog({ initial, onClose }: { initial: { program?: Program; days?: ProgramDay[] }; onClose: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const templates = useTemplates();
  const [name, setName] = useState(initial.program?.name ?? "");
  const [schedule, setSchedule] = useState<Record<number, string>>(
    Object.fromEntries((initial.days ?? []).map((d) => [d.weekday, d.template_id])),
  );
  const all = [...(templates?.mine ?? []), ...(templates?.builtin ?? [])];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{initial.program ? t("programs.editCustom") : t("programs.createCustom")}</DialogTitle>
        </DialogHeader>
        <Field label={t("programs.name")} htmlFor="prog-name">
          <Input id="prog-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">{t("programs.schedule")}</legend>
          {WEEK_ORDER.map((d) => (
            <NativeSelect
              key={d}
              label={t(`weekdays.${d}` as "weekdays.0")}
              value={schedule[d] ?? ""}
              onChange={(v) => setSchedule({ ...schedule, [d]: v })}
            >
              <option value="">{t("programs.restDay")}</option>
              {all.map((x) => (
                <option key={x.template.id} value={x.template.id}>
                  {templateName(x.template, locale)}
                </option>
              ))}
            </NativeSelect>
          ))}
        </fieldset>
        <DialogFooter>
          <Button
            size="lg"
            disabled={!name.trim()}
            onClick={async () => {
              await saveCustomProgram({ id: initial.program?.id, name, schedule, activate: !initial.program });
              onClose();
            }}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
