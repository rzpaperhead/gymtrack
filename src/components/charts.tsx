"use client";

import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { useFormatter, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { WEEK_OPTS, dateKey } from "@/lib/calc/stats";

const axis = { stroke: "var(--muted-foreground)", fontSize: 12, tickLine: false, axisLine: false } as const;
const grid = <CartesianGrid stroke="var(--border)" vertical={false} />;
const tooltipStyle = {
  contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--popover-foreground)" },
  labelStyle: { color: "var(--muted-foreground)" },
  cursor: { fill: "var(--muted)", opacity: 0.4 },
};

/** Charts carry a visually-hidden summary so screen readers get the gist. */
function ChartFrame({ label, summary, height = 220, children }: { label: string; summary: string; height?: number; children: React.ReactElement }) {
  return (
    <figure aria-label={label} className="w-full">
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}

export function LineTrend({
  data,
  label,
  unit,
  secondary,
}: {
  data: { date: string; value: number; avg?: number }[];
  label: string;
  unit: string;
  /** Optional second series (e.g. moving average), drawn emphasised. */
  secondary?: string;
}) {
  const f = useFormatter();
  const first = data[0];
  const last = data[data.length - 1];
  const summary = first && last ? `${label}: ${first.value} → ${last.value} ${unit} (${first.date} – ${last.date})` : label;
  return (
    <ChartFrame label={label} summary={summary}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        {grid}
        <XAxis dataKey="date" {...axis} tickFormatter={(d: string) => f.dateTime(parseISO(d), { day: "numeric", month: "short" })} minTickGap={24} />
        <YAxis {...axis} domain={["auto", "auto"]} width={44} />
        <Tooltip
          {...tooltipStyle}
          labelFormatter={(d) => f.dateTime(parseISO(String(d)), { dateStyle: "medium" })}
          formatter={(v) => [`${v} ${unit}`]}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={secondary ? "var(--muted-foreground)" : "var(--chart-1)"}
          strokeWidth={secondary ? 1.5 : 3}
          dot={{ r: secondary ? 2 : 3, fill: secondary ? "var(--muted-foreground)" : "var(--chart-1)" }}
          isAnimationActive={false}
        />
        {secondary && <Line type="monotone" dataKey="avg" name={secondary} stroke="var(--chart-1)" strokeWidth={3} dot={false} isAnimationActive={false} />}
      </LineChart>
    </ChartFrame>
  );
}

export function WeeklyBars({ data, label, unit }: { data: { week: string; volume: number }[]; label: string; unit: string }) {
  const f = useFormatter();
  const summary = `${label}: ${data.map((d) => `${d.week} ${d.volume} ${unit}`).join(", ")}`;
  return (
    <ChartFrame label={label} summary={summary}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
        {grid}
        <XAxis dataKey="week" {...axis} tickFormatter={(d: string) => f.dateTime(parseISO(d), { day: "numeric", month: "short" })} minTickGap={16} />
        <YAxis {...axis} width={52} tickFormatter={(v: number) => f.number(v, { notation: "compact" })} />
        <Tooltip {...tooltipStyle} labelFormatter={(d) => f.dateTime(parseISO(String(d)), { dateStyle: "medium" })} formatter={(v) => [`${f.number(Number(v))} ${unit}`]} />
        <Bar dataKey="volume" fill="var(--chart-1)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartFrame>
  );
}

export function HorizontalBars({ data, label, unit }: { data: { name: string; value: number }[]; label: string; unit: string }) {
  const f = useFormatter();
  return (
    <ChartFrame label={label} summary={`${label}: ${data.map((d) => `${d.name} ${d.value} ${unit}`).join(", ")}`} height={Math.max(160, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" {...axis} width={110} />
        <Tooltip {...tooltipStyle} formatter={(v) => [`${f.number(Number(v))} ${unit}`]} />
        <Bar dataKey="value" fill="var(--chart-2)" radius={[0, 6, 6, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartFrame>
  );
}

export function TargetBars({
  data,
  label,
  target,
  unit,
}: {
  data: { date: string; value: number | null }[];
  label: string;
  target: number | null;
  unit: string;
}) {
  const f = useFormatter();
  return (
    <ChartFrame label={label} summary={`${label}: ${data.map((d) => `${d.date} ${d.value ?? "-"}${unit}`).join(", ")}${target ? `; target ${target}` : ""}`} height={180}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        {grid}
        <XAxis dataKey="date" {...axis} tickFormatter={(d: string) => f.dateTime(parseISO(d), { weekday: "narrow" })} />
        <YAxis {...axis} width={44} />
        <Tooltip {...tooltipStyle} labelFormatter={(d) => f.dateTime(parseISO(String(d)), { dateStyle: "medium" })} formatter={(v) => [`${v} ${unit}`]} />
        {target && <ReferenceLine y={target} stroke="var(--chart-3)" strokeDasharray="4 4" />}
        <Bar dataKey="value" fill="var(--chart-1)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartFrame>
  );
}

/** GitHub-style calendar of sessions per day. Columns are weeks (Mon-start). */
export function Heatmap({ counts, weeks = 26 }: { counts: Map<string, number>; weeks?: number }) {
  const t = useTranslations("progress");
  const f = useFormatter();
  const start = addDays(startOfWeek(new Date(), WEEK_OPTS), -7 * (weeks - 1));
  const cell = 14;
  const gap = 3;
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const level = (n: number) => (n === 0 ? "var(--muted)" : n === 1 ? "color-mix(in oklch, var(--chart-1) 55%, var(--muted))" : "var(--chart-1)");
  return (
    <figure className="space-y-2">
      <div className="overflow-x-auto">
        <svg
          width={weeks * (cell + gap)}
          height={7 * (cell + gap)}
          role="img"
          aria-label={`${t("heatmap")}: ${t("sessions", { count: total })}`}
          className="mx-auto"
        >
          {Array.from({ length: weeks }, (_, w) =>
            Array.from({ length: 7 }, (_, d) => {
              const day = addDays(start, w * 7 + d);
              if (day > new Date()) return null;
              const k = dateKey(day);
              const n = counts.get(k) ?? 0;
              return (
                <rect key={k} x={w * (cell + gap)} y={d * (cell + gap)} width={cell} height={cell} rx={3} fill={level(n)}>
                  <title>{`${f.dateTime(day, { dateStyle: "medium" })}: ${t("sessions", { count: n })}`}</title>
                </rect>
              );
            }),
          )}
        </svg>
      </div>
      <figcaption className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
        {t("less")}
        {[0, 1, 2].map((n) => (
          <span key={n} className="inline-block size-3 rounded-sm" style={{ background: level(n) }} aria-hidden />
        ))}
        {t("more")}
      </figcaption>
    </figure>
  );
}

export function lastNDates(n: number, end = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => format(addDays(end, i - n + 1), "yyyy-MM-dd"));
}
