"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { LineTrend } from "@/components/charts";
import { Card, EmptyState, Field, NativeSelect, PaywallCard, Section } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dateKey } from "@/lib/calc/stats";
import { latestPerDate, saveBodyMetric } from "@/lib/data/body";
import { db } from "@/lib/db/local";
import { useEntitlements } from "@/lib/hooks";
import { MEASUREMENT_KEYS, type MeasurementKey } from "@/lib/types";

type Key = MeasurementKey | "body_fat_pct";
const KEYS: Key[] = ["body_fat_pct", ...MEASUREMENT_KEYS];

export function MeasurementsTab() {
  const t = useTranslations();
  const f = useFormatter();
  const ent = useEntitlements();
  const [date, setDate] = useState(() => dateKey(new Date()));
  const [values, setValues] = useState<Partial<Record<Key, string>>>({});
  const [chartKey, setChartKey] = useState<Key>("waist");
  const rows = useLiveQuery(
    async () => latestPerDate(await db.body_metrics.toArray()).filter((r) => r.body_fat_pct != null || Object.keys(r.measurements ?? {}).length),
    [],
  );

  const label = (k: Key) => (k === "body_fat_pct" ? t("body.bodyFat") : t(`body.${k}`));
  const val = (r: NonNullable<typeof rows>[number], k: Key) => (k === "body_fat_pct" ? r.body_fat_pct : r.measurements?.[k]) ?? null;
  const num = (s?: string) => {
    const n = Number((s ?? "").replace(",", "."));
    return s && s.trim() !== "" && Number.isFinite(n) && n > 0 ? n : undefined;
  };

  const save = async () => {
    const measurements: Partial<Record<MeasurementKey, number>> = {};
    for (const k of MEASUREMENT_KEYS) {
      const n = num(values[k]);
      if (n != null) measurements[k] = n;
    }
    const bf = num(values.body_fat_pct);
    await saveBodyMetric(date, { measurements, ...(bf != null ? { body_fat_pct: bf } : {}) });
    setValues({});
  };

  if (!rows) return null;
  const series = rows.map((r) => ({ date: r.date, value: val(r, chartKey) })).filter((p): p is { date: string; value: number } => p.value != null);

  return (
    <div className="space-y-5">
      <Card className="space-y-3">
        <h2 className="font-bold uppercase">{t("body.logMeasurements")}</h2>
        <Field label={t("common.date")} htmlFor="m-date">
          <Input id="m-date" type="date" value={date} max={dateKey(new Date())} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {KEYS.map((k) => (
            <Field key={k} label={label(k)} htmlFor={`m-${k}`}>
              <Input id={`m-${k}`} inputMode="decimal" className="num text-lg" value={values[k] ?? ""} onChange={(e) => setValues({ ...values, [k]: e.target.value })} />
            </Field>
          ))}
        </div>
        <Button className="w-full" onClick={save} disabled={!KEYS.some((k) => num(values[k]) != null)}>
          {t("common.save")}
        </Button>
      </Card>

      {!rows.length ? (
        <EmptyState>{t("body.noMeasurements")}</EmptyState>
      ) : (
        <>
          <Section>
            {ent.charts.has("measurements") ? (
              <Card className="space-y-3">
                <NativeSelect label={t("body.measurements")} hideLabel value={chartKey} onChange={(v) => setChartKey(v as Key)}>
                  {KEYS.map((k) => (
                    <option key={k} value={k}>
                      {label(k)}
                    </option>
                  ))}
                </NativeSelect>
                {series.length > 1 ? (
                  <LineTrend data={series} label={label(chartKey)} unit={chartKey === "body_fat_pct" ? "%" : "cm"} />
                ) : (
                  <p className="py-4 text-center text-sm text-muted-foreground">{t("progress.noData")}</p>
                )}
              </Card>
            ) : (
              <PaywallCard reason={t("premium.features.charts")} />
            )}
          </Section>
          <div className="overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full text-sm">
              <caption className="sr-only">{t("body.measurements")}</caption>
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th scope="col" className="p-3">
                    {t("common.date")}
                  </th>
                  {KEYS.map((k) => (
                    <th key={k} scope="col" className="p-3 text-right">
                      {label(k).replace(/ \(.*\)/, "")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((r) => (
                  <tr key={r.id} className="border-t">
                    <th scope="row" className="p-3 text-left font-normal whitespace-nowrap">
                      {f.dateTime(new Date(`${r.date}T12:00:00`), { day: "numeric", month: "short" })}
                    </th>
                    {KEYS.map((k) => (
                      <td key={k} className="num p-3 text-right text-base">
                        {val(r, k) ?? "–"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
