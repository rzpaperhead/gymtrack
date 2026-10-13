"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { displayWeight, parseWeightInput } from "@/lib/calc/units";
import type { ExerciseType, Unit, WorkoutSet } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Which inputs a set row shows for each exercise type. */
export function fieldsFor(type: ExerciseType): ("weight" | "reps" | "duration" | "distance")[] {
  switch (type) {
    case "weight_reps":
    case "assisted":
      return ["weight", "reps"];
    case "bodyweight_reps":
      return ["reps"];
    case "time":
      return ["duration"];
    case "distance_time":
      return ["distance", "duration"];
  }
}

function NumCell({
  value,
  onCommit,
  label,
  decimal,
  done,
}: {
  value: string;
  onCommit: (raw: string) => void;
  label: string;
  decimal?: boolean;
  done: boolean;
}) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    // Mirror the stored value unless the user is mid-edit.
    if (!focused.current) setText(value);
  }, [value]);
  return (
    <input
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      enterKeyHint="next"
      aria-label={label}
      value={text}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
      }}
      onBlur={() => {
        focused.current = false;
        setText(value);
      }}
      onChange={(e) => {
        const v = e.target.value.replace(decimal ? /[^\d.,]/g : /\D/g, "");
        setText(v);
        onCommit(v);
      }}
      className={cn(
        "num h-11 w-full min-w-0 rounded-lg border border-transparent bg-muted text-center text-2xl outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        done && "bg-transparent",
      )}
    />
  );
}

export function formatPrevious(s: WorkoutSet | undefined, type: ExerciseType, unit: Unit): string {
  if (!s) return "—";
  switch (type) {
    case "weight_reps":
    case "assisted":
      return s.weight_kg != null || s.reps != null ? `${displayWeight(s.weight_kg, unit) || "0"} × ${s.reps ?? "–"}` : "—";
    case "bodyweight_reps":
      return s.reps != null ? `× ${s.reps}` : "—";
    case "time":
      return s.duration_sec != null ? `${s.duration_sec}s` : "—";
    case "distance_time":
      return s.distance_m != null ? `${s.distance_m}m` : "—";
  }
}

export function SetRow({
  set,
  index,
  workingIndex,
  type,
  unit,
  previous,
  onChange,
  onToggle,
  onOpenOptions,
  onUsePrevious,
}: {
  set: WorkoutSet;
  index: number;
  workingIndex: number;
  type: ExerciseType;
  unit: Unit;
  previous?: WorkoutSet;
  onChange: (patch: Partial<WorkoutSet>) => void;
  onToggle: () => void;
  onOpenOptions: () => void;
  onUsePrevious: () => void;
}) {
  const t = useTranslations();
  const done = !!set.completed_at;
  const fields = fieldsFor(type);
  const typeBadge =
    set.set_type === "working" ? String(workingIndex) : t(`setTypes.${set.set_type}_short` as "setTypes.warmup_short");
  const num = (raw: string) => {
    const n = Number(raw.replace(",", "."));
    return raw.trim() === "" || !Number.isFinite(n) ? null : n;
  };

  return (
    <div
      className={cn(
        "grid items-center gap-1 rounded-xl px-0.5 py-1 transition-colors",
        fields.length === 2 ? "grid-cols-[2.25rem_minmax(0,1fr)_4.25rem_3.5rem_2.75rem]" : "grid-cols-[2.25rem_minmax(0,1fr)_5rem_2.75rem]",
        done && "bg-primary/15",
      )}
    >
      <button
        type="button"
        onClick={onOpenOptions}
        aria-label={`${t("active.set")} ${index + 1}: ${t(`setTypes.${set.set_type}`)}${set.rpe ? `, RPE ${set.rpe}` : ""}`}
        className={cn(
          "num flex h-11 flex-col items-center justify-center rounded-lg text-lg leading-none outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
          set.set_type === "warmup" && "text-chart-3",
          set.set_type === "drop" && "text-chart-2",
          set.set_type === "failure" && "text-destructive",
        )}
      >
        {typeBadge}
        {set.rpe != null && <span className="text-[0.65rem] font-semibold text-muted-foreground">@{set.rpe}</span>}
      </button>
      <button
        type="button"
        onClick={onUsePrevious}
        disabled={!previous}
        className="truncate text-center text-sm text-muted-foreground tabular-nums disabled:cursor-default"
        aria-label={`${t("active.previous")}: ${formatPrevious(previous, type, unit)}`}
      >
        {formatPrevious(previous, type, unit)}
      </button>
      {fields.map((f) =>
        f === "weight" ? (
          <NumCell
            key={f}
            decimal
            done={done}
            label={type === "assisted" ? t("active.assist", { unit }) : t("active.weight", { unit })}
            value={displayWeight(set.weight_kg, unit)}
            onCommit={(raw) => onChange({ weight_kg: raw.trim() === "" ? null : parseWeightInput(raw, unit) })}
          />
        ) : f === "reps" ? (
          <NumCell key={f} done={done} label={t("active.reps")} value={set.reps?.toString() ?? ""} onCommit={(raw) => onChange({ reps: num(raw) })} />
        ) : f === "duration" ? (
          <NumCell
            key={f}
            done={done}
            label={t("active.time")}
            value={set.duration_sec?.toString() ?? ""}
            onCommit={(raw) => onChange({ duration_sec: num(raw) })}
          />
        ) : (
          <NumCell
            key={f}
            decimal
            done={done}
            label={t("active.distance")}
            value={set.distance_m?.toString() ?? ""}
            onCommit={(raw) => onChange({ distance_m: num(raw) })}
          />
        ),
      )}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={done}
        aria-label={done ? t("active.markUndone", { n: index + 1 }) : t("active.markDone", { n: index + 1 })}
        className={cn(
          "flex size-11 items-center justify-center rounded-xl border-2 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
          done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30 text-muted-foreground hover:border-primary",
        )}
      >
        <Check className="size-6" strokeWidth={3} aria-hidden />
      </button>
    </div>
  );
}
