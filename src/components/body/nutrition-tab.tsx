"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { lastNDates, TargetBars } from "@/components/charts";
import { Card, Field, PaywallCard, Section } from "@/components/common";
import { useProfile } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { dateKey } from "@/lib/calc/stats";
import { latestPerDate, saveNutrition } from "@/lib/data/body";
import { updateProfile } from "@/lib/data/profile";
import { db } from "@/lib/db/local";
import { useEntitlements } from "@/lib/hooks";

const FIELDS = [
  ["calories", "calories", "calorie_target"],
  ["protein_g", "protein", "protein_target"],
  ["carbs_g", "carbs", "carbs_target"],
  ["fat_g", "fat", "fat_target"],
] as const;

type Vals = Record<(typeof FIELDS)[number][0], string>;
const EMPTY: Vals = { calories: "", protein_g: "", carbs_g: "", fat_g: "" };

const toInt = (s: string) => {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function NutritionTab() {
  const t = useTranslations();
  const f = useFormatter();
  const profile = useProfile();
  const ent = useEntitlements();
  const [date, setDate] = useState(() => dateKey(new Date()));
  const [vals, setVals] = useState<Vals>(EMPTY);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const logs = useLiveQuery(async () => latestPerDate(await db.nutrition_logs.toArray()), []);
  const current = logs?.find((l) => l.date === date);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the selected day's entry into the form
    setVals(
      current
        ? {
            calories: current.calories?.toString() ?? "",
            protein_g: current.protein_g?.toString() ?? "",
            carbs_g: current.carbs_g?.toString() ?? "",
            fat_g: current.fat_g?.toString() ?? "",
          }
        : EMPTY,
    );
  }, [current?.id, current?.updated_at, date]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!logs || !profile) return null;
  const week = lastNDates(7);
  const byDate = new Map(logs.map((l) => [l.date, l]));
  const series = (k: "calories" | "protein_g") => week.map((d) => ({ date: d, value: byDate.get(d)?.[k] ?? null }));

  return (
    <div className="space-y-5">
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold uppercase">{t("nutrition.title")}</h2>
          <Button variant="ghost" size="sm" onClick={() => setTargetsOpen(true)}>
            {t("nutrition.setTargets")}
          </Button>
        </div>
        <Field label={t("common.date")} htmlFor="n-date">
          <Input id="n-date" type="date" value={date} max={dateKey(new Date())} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map(([k, label, target]) => (
            <Field
              key={k}
              label={t(`nutrition.${label}`)}
              htmlFor={`n-${k}`}
              hint={profile[target] ? t("nutrition.ofTarget", { value: vals[k] || 0, target: profile[target]! }) : undefined}
            >
              <Input id={`n-${k}`} inputMode="numeric" className="num text-lg" value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value.replace(/\D/g, "") })} />
            </Field>
          ))}
        </div>
        <Button
          className="w-full"
          onClick={() =>
            saveNutrition(date, {
              calories: toInt(vals.calories),
              protein_g: toInt(vals.protein_g),
              carbs_g: toInt(vals.carbs_g),
              fat_g: toInt(vals.fat_g),
            })
          }
        >
          {t("common.save")}
        </Button>
      </Card>

      <Section title={t("nutrition.compliance")}>
        {ent.charts.has("nutrition_compliance") ? (
          <div className="space-y-3">
            <Card>
              <p className="mb-2 text-sm font-semibold">
                {t("nutrition.calories")} {profile.calorie_target ? `· ${f.number(profile.calorie_target)}` : `· ${t("nutrition.noTarget")}`}
              </p>
              <TargetBars data={series("calories")} label={t("nutrition.calories")} target={profile.calorie_target} unit=" kkal" />
            </Card>
            <Card>
              <p className="mb-2 text-sm font-semibold">
                {t("nutrition.protein")} {profile.protein_target ? `· ${profile.protein_target} g` : `· ${t("nutrition.noTarget")}`}
              </p>
              <TargetBars data={series("protein_g")} label={t("nutrition.protein")} target={profile.protein_target} unit=" g" />
            </Card>
          </div>
        ) : (
          <PaywallCard reason={t("premium.features.charts")} />
        )}
      </Section>

      <TargetsDialog open={targetsOpen} onOpenChange={setTargetsOpen} />
    </div>
  );
}

function TargetsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations();
  const profile = useProfile();
  const [v, setV] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open && profile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seed the form when the dialog opens
      setV(Object.fromEntries(FIELDS.map(([, , k]) => [k, profile[k]?.toString() ?? ""])));
    }
  }, [open, profile]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{t("nutrition.targets")}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map(([, label, k]) => (
            <Field key={k} label={t(`nutrition.${label}`)} htmlFor={`t-${k}`}>
              <Input id={`t-${k}`} inputMode="numeric" value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value.replace(/\D/g, "") })} />
            </Field>
          ))}
        </div>
        <DialogFooter>
          <Button
            onClick={async () => {
              await updateProfile(Object.fromEntries(FIELDS.map(([, , k]) => [k, toInt(v[k] ?? "")])));
              onOpenChange(false);
            }}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
