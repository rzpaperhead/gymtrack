"use client";

import { Copy, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDialog, EmptyState, PageHeader, PaywallCard, Section } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useStartWorkout } from "@/components/workout/start-workout";
import { exerciseName, templateName, useExerciseCatalog, useTemplates, type TemplateWithItems } from "@/lib/catalog";
import { canCreate } from "@/lib/entitlements";
import { deleteTemplate, duplicateTemplate } from "@/lib/data/templates";
import { useEntitlements } from "@/lib/hooks";

export default function TemplatesPage() {
  const t = useTranslations();
  const router = useRouter();
  const templates = useTemplates();
  const ent = useEntitlements();
  const { start, dialog } = useStartWorkout();
  const [paywall, setPaywall] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const locale = useLocale();

  const mineCount = templates?.mine.length ?? 0;
  const guard = (fn: () => void) => () => (canCreate(ent, "templates", mineCount) ? fn() : setPaywall(true));

  return (
    <div className="space-y-6">
      <PageHeader
        back="/workout"
        title={t("templates.title")}
        actions={
          <Button size="icon" aria-label={t("templates.create")} onClick={guard(() => router.push("/templates/edit"))}>
            <Plus />
          </Button>
        }
      />
      {paywall && <PaywallCard reason={t("templates.limitReached", { max: ent.maxCustomTemplates })} />}

      <Section title={t("templates.mine")}>
        {templates && !templates.mine.length && <EmptyState>{t("templates.empty")}</EmptyState>}
        <div className="space-y-3">
          {templates?.mine.map((tpl) => (
            <TemplateCard
              key={tpl.template.id}
              tpl={tpl}
              onStart={() => start({ templateId: tpl.template.id })}
              actions={
                <>
                  <Button variant="ghost" size="icon" aria-label={t("common.edit")} onClick={() => router.push(`/templates/edit?id=${tpl.template.id}`)}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={t("common.delete")} onClick={() => setToDelete(tpl.template.id)}>
                    <Trash2 />
                  </Button>
                </>
              }
            />
          ))}
        </div>
      </Section>

      <Section title={t("templates.builtin")}>
        <div className="space-y-3">
          {templates?.builtin.map((tpl) => (
            <TemplateCard
              key={tpl.template.id}
              tpl={tpl}
              onStart={() => start({ templateId: tpl.template.id })}
              actions={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("templates.duplicate")}
                  onClick={guard(async () => {
                    const id = await duplicateTemplate(tpl.template.id, t("templates.copyName", { name: templateName(tpl.template, locale) }));
                    router.push(`/templates/edit?id=${id}`);
                  })}
                >
                  <Copy />
                </Button>
              }
            />
          ))}
        </div>
      </Section>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t("common.delete")}
        description={t("templates.deleteConfirm")}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={() => deleteTemplate(toDelete!)}
      />
      {dialog}
    </div>
  );
}

function TemplateCard({ tpl, onStart, actions }: { tpl: TemplateWithItems; onStart: () => void; actions: React.ReactNode }) {
  const t = useTranslations();
  const locale = useLocale();
  const catalog = useExerciseCatalog();
  return (
    <article className="rounded-2xl border bg-card p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-xl font-bold uppercase">{templateName(tpl.template, locale)}</h3>
          <p className="text-sm text-muted-foreground">
            {tpl.items.map((i) => `${exerciseName(catalog?.byId.get(i.exercise_id), locale)} ${i.target_sets}×${i.target_reps_min ?? ""}${i.target_reps_max && i.target_reps_max !== i.target_reps_min ? `–${i.target_reps_max}` : ""}`).join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0">{actions}</div>
      </div>
      <Button className="mt-3 w-full" onClick={onStart}>
        <Play aria-hidden /> {t("templates.startThis")}
      </Button>
    </article>
  );
}
