"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { PartyPopper, Save } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { Field, LinkButton, Section, Stat } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PRList } from "@/components/workout/pr-list";
import { useExerciseCatalog } from "@/lib/catalog";
import { displayWeight } from "@/lib/calc/units";
import { canCreate } from "@/lib/entitlements";
import { countCustomTemplates, saveWorkoutAsTemplate } from "@/lib/data/templates";
import { db } from "@/lib/db/local";
import { formatClock, useEntitlements, useUnit } from "@/lib/hooks";
import { sessionSummary } from "@/lib/workout/actions";

function Summary() {
  const id = useSearchParams().get("id") ?? "";
  const t = useTranslations();
  const f = useFormatter();
  const unit = useUnit();
  const catalog = useExerciseCatalog();
  const ent = useEntitlements();
  const summary = useLiveQuery(() => sessionSummary(id), [id]);
  const workout = useLiveQuery(() => db.workouts.get(id), [id]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [limitHit, setLimitHit] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- default the name once the workout loads
    if (workout?.name && !tplName) setTplName(workout.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout?.name]);

  if (!summary) return null;

  return (
    <div className="space-y-6 pt-6">
      <header className="pt-safe text-center">
        <PartyPopper className="mx-auto size-12 text-primary" aria-hidden />
        <h1 className="mt-2 text-4xl font-extrabold uppercase">{t("summary.title")}</h1>
        {workout?.name && <p className="text-muted-foreground">{workout.name}</p>}
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Stat label={t("summary.duration")} value={formatClock(summary.durationSec)} />
        <Stat
          label={t("summary.volume")}
          value={
            <>
              {f.number(Number(displayWeight(summary.volumeKg, unit)), { maximumFractionDigits: 0 })}
              <span className="text-base text-muted-foreground"> {unit}</span>
            </>
          }
        />
        <Stat label={t("summary.sets")} value={summary.setCount} />
        <Stat label={t("summary.exercises")} value={summary.exerciseCount} />
      </div>

      <Section title={t("summary.newPRs")}>
        {summary.prs.length ? (
          <PRList records={summary.prs} catalog={catalog} unit={unit} animate />
        ) : (
          <p className="rounded-2xl border border-dashed p-4 text-center text-muted-foreground">{t("summary.noPRs")}</p>
        )}
      </Section>

      <div className="space-y-3">
        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          onClick={async () => {
            setLimitHit(!canCreate(ent, "templates", await countCustomTemplates()));
            setSaveOpen(true);
          }}
        >
          <Save aria-hidden /> {t("summary.saveAsTemplate")}
        </Button>
        <LinkButton href={`/workout/view?id=${id}`} variant="outline" size="lg" className="w-full">
          {t("summary.viewDetails")}
        </LinkButton>
        <LinkButton href="/home" size="xl" className="w-full">
          {t("summary.done")}
        </LinkButton>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent closeLabel={t("common.close")}>
          <DialogHeader>
            <DialogTitle>{t("summary.saveAsTemplate")}</DialogTitle>
          </DialogHeader>
          {limitHit ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("templates.limitReached", { max: ent.maxCustomTemplates })}</p>
              <LinkButton href="/premium" className="w-full">
                {t("premium.seePremium")}
              </LinkButton>
            </div>
          ) : (
            <>
              <Field label={t("summary.templateName")} htmlFor="tpl-name">
                <Input id="tpl-name" value={tplName} onChange={(e) => setTplName(e.target.value)} maxLength={80} />
              </Field>
              <DialogFooter>
                <Button
                  disabled={!tplName.trim()}
                  onClick={async () => {
                    await saveWorkoutAsTemplate(id, tplName.trim());
                    setSaveOpen(false);
                    toast.success(t("summary.templateSaved"));
                  }}
                >
                  {t("common.save")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function SummaryPage() {
  return (
    <Suspense>
      <Summary />
    </Suspense>
  );
}
