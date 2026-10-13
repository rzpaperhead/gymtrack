"use client";

import { subDays } from "date-fns";
import { useLiveQuery } from "dexie-react-hooks";
import { Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { LineTrend } from "@/components/charts";
import { Card, EmptyState, Field, Section, Stat } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dateKey, movingAverage } from "@/lib/calc/stats";
import { displayWeight, kgToUnit, parseWeightInput } from "@/lib/calc/units";
import { deleteBodyMetric, latestPerDate, saveBodyMetric } from "@/lib/data/body";
import { db } from "@/lib/db/local";
import { useEntitlements, useUnit } from "@/lib/hooks";

export function WeightTab() {
  const t = useTranslations();
  const f = useFormatter();
  const unit = useUnit();
  const ent = useEntitlements();
  const [date, setDate] = useState(() => dateKey(new Date()));
  const [value, setValue] = useState("");
  const rows = useLiveQuery(async () => latestPerDate(await db.body_metrics.toArray()).filter((r) => r.weight_kg != null), []);

  if (!rows) return null;
  const cutoff = Number.isFinite(ent.chartHistoryDays) ? dateKey(subDays(new Date(), ent.chartHistoryDays)) : "";
  const series = movingAverage(rows.map((r) => ({ date: r.date, value: Math.round(kgToUnit(r.weight_kg!, unit) * 10) / 10 }))).filter((p) => p.date >= cutoff);
  const latest = series[series.length - 1];
  const first = series[0];
  const parsed = parseWeightInput(value, unit);
  const num = (n: number | undefined) => (n == null ? "—" : f.number(n, { maximumFractionDigits: 1 }));

  return (
    <div className="space-y-5">
      <Card>
        <form
          className="flex items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (parsed == null || parsed < 20) return;
            await saveBodyMetric(date, { weight_kg: Math.round(parsed * 100) / 100 });
            setValue("");
          }}
        >
          <div className="w-36">
            <Field label={t("common.date")} htmlFor="w-date">
              <Input id="w-date" type="date" value={date} max={dateKey(new Date())} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <div className="flex-1">
            <Field label={t("body.weightKg", { unit })} htmlFor="w-val">
              <Input id="w-val" inputMode="decimal" className="num text-xl" value={value} onChange={(e) => setValue(e.target.value)} />
            </Field>
          </div>
          <Button type="submit" disabled={parsed == null || parsed < 20}>
            {t("common.save")}
          </Button>
        </form>
      </Card>

      {!rows.length ? (
        <EmptyState>{t("body.noWeights")}</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label={t("body.latest")} value={num(latest?.value)} sub={unit} />
            <Stat label={t("body.avg7")} value={num(latest?.avg)} sub={unit} />
            <Stat
              label={t("body.change")}
              value={latest && first ? f.number(latest.avg - first.avg, { maximumFractionDigits: 1, signDisplay: "exceptZero" }) : "—"}
              sub={unit}
            />
          </div>
          {series.length > 1 && (
            <Card>
              <LineTrend data={series} label={t("body.weight")} unit={unit} secondary={t("body.avg7")} />
              <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-block h-1 w-5 rounded bg-chart-1" aria-hidden /> {t("body.avg7")}
              </p>
            </Card>
          )}
          <Section>
            <ul className="divide-y rounded-2xl border bg-card">
              {[...rows].reverse().slice(0, 30).map((r) => (
                <li key={r.id} className="flex min-h-14 items-center gap-3 px-4">
                  <span className="flex-1 text-sm">{f.dateTime(new Date(`${r.date}T12:00:00`), { dateStyle: "medium" })}</span>
                  <span className="num text-xl">
                    {num(Number(displayWeight(r.weight_kg, unit)))} {unit}
                  </span>
                  <Button variant="ghost" size="icon" aria-label={t("common.delete")} onClick={() => (r.measurements && Object.keys(r.measurements).length) || r.body_fat_pct ? saveBodyMetric(r.date, { weight_kg: null }) : deleteBodyMetric(r.id)}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </div>
  );
}
