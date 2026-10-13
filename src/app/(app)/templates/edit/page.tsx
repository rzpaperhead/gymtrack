"use client";

import { ArrowDown, ArrowUp, Link2, Plus, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { Field, PageHeader, PaywallCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ExercisePicker } from "@/components/workout/exercise-picker";
import { exerciseName, getExercise, getTemplate, useExerciseCatalog } from "@/lib/catalog";
import { canCreate } from "@/lib/entitlements";
import { countCustomTemplates, saveTemplate, type TemplateItemInput } from "@/lib/data/templates";
import { useEntitlements } from "@/lib/hooks";
import { cn } from "@/lib/utils";

function NumBox({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="grid gap-1 text-center text-[0.7rem] font-semibold uppercase text-muted-foreground">
      {label}
      <input
        inputMode="numeric"
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "");
          onChange(v === "" ? null : Number(v));
        }}
        className="num h-11 w-full rounded-lg bg-muted text-center text-xl text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </label>
  );
}

function Editor() {
  const id = useSearchParams().get("id");
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const catalog = useExerciseCatalog();
  const [loaded, setLoaded] = useState(!id);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<TemplateItemInput[]>([]);
  const [picker, setPicker] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; items?: string }>({});
  const [limitHit, setLimitHit] = useState(false);
  const ent = useEntitlements();

  useEffect(() => {
    if (!id) return;
    void getTemplate(id).then((tpl) => {
      if (!tpl || tpl.builtin) return router.replace("/templates");
      setName(tpl.template.name);
      setNotes(tpl.template.notes ?? "");
      setItems(tpl.items.map(({ id, exercise_id, target_sets, target_reps_min, target_reps_max, rest_sec, superset_group }) => ({ id, exercise_id, target_sets, target_reps_min, target_reps_max, rest_sec, superset_group })));
      setLoaded(true);
    });
  }, [id, router]);

  const update = (i: number, patch: Partial<TemplateItemInput>) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setItems(next);
  };
  const toggleSuperset = (i: number) => {
    const a = items[i];
    const b = items[i + 1];
    if (!b) return;
    if (a.superset_group && a.superset_group === b.superset_group) return update(i + 1, { superset_group: null });
    const used = new Set(items.map((x) => x.superset_group));
    const group = a.superset_group ?? [..."abcdefghij"].find((c) => !used.has(c)) ?? "z";
    setItems(items.map((it, j) => (j === i || j === i + 1 ? { ...it, superset_group: group } : it)));
  };

  const save = async () => {
    const e: typeof errors = {};
    if (!name.trim()) e.name = t("templates.nameRequired");
    if (!items.length) e.items = t("templates.needExercise");
    setErrors(e);
    if (Object.keys(e).length) return;
    if (!id && !canCreate(ent, "templates", await countCustomTemplates())) return setLimitHit(true);
    await saveTemplate({ id: id ?? undefined, name, notes: notes.trim() || null, items });
    toast.success(t("common.saved"));
    router.replace("/templates");
  };

  if (!loaded) return null;

  return (
    <div className="space-y-4">
      <PageHeader back="/templates" title={id ? t("templates.edit") : t("templates.create")} />
      <Field label={t("templates.name")} htmlFor="tpl-name" error={errors.name}>
        <Input id="tpl-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
      </Field>
      <Field label={t("common.notes")} htmlFor="tpl-notes">
        <Textarea id="tpl-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <ol className="space-y-3">
        {items.map((it, i) => {
          const linked = !!it.superset_group && items[i + 1]?.superset_group === it.superset_group;
          return (
            <li key={it.id ?? `${it.exercise_id}-${i}`} className={cn("rounded-2xl border bg-card p-3", it.superset_group && "border-l-4 border-l-chart-2")}>
              <div className="flex items-center gap-1">
                <p className="min-w-0 flex-1 truncate font-bold">{exerciseName(catalog?.byId.get(it.exercise_id), locale)}</p>
                <Button variant="ghost" size="icon" disabled={i === 0} aria-label={t("active.moveUp")} onClick={() => move(i, -1)}>
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon" disabled={i === items.length - 1} aria-label={t("active.moveDown")} onClick={() => move(i, 1)}>
                  <ArrowDown />
                </Button>
                <Button variant="ghost" size="icon" aria-label={t("active.removeExercise")} onClick={() => setItems(items.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2">
                <NumBox label={t("templates.targetSets")} value={it.target_sets} onChange={(v) => update(i, { target_sets: Math.min(20, Math.max(1, v ?? 1)) })} />
                <NumBox label={t("templates.repsMin")} value={it.target_reps_min} onChange={(v) => update(i, { target_reps_min: v })} />
                <NumBox label={t("templates.repsMax")} value={it.target_reps_max} onChange={(v) => update(i, { target_reps_max: v })} />
                <NumBox label={t("templates.restSec")} value={it.rest_sec} onChange={(v) => update(i, { rest_sec: v == null ? null : Math.min(900, v) })} />
              </div>
              {i < items.length - 1 && (
                <Button variant="ghost" size="sm" className="mt-2" aria-pressed={linked} onClick={() => toggleSuperset(i)}>
                  <Link2 aria-hidden /> {linked ? t("active.unlinkSuperset") : t("active.supersetWithNext")}
                </Button>
              )}
            </li>
          );
        })}
      </ol>
      {errors.items && (
        <p role="alert" className="text-sm text-destructive">
          {errors.items}
        </p>
      )}
      <Button variant="secondary" size="lg" className="w-full" onClick={() => setPicker(true)}>
        <Plus aria-hidden /> {t("active.addExercise")}
      </Button>
      {limitHit && <PaywallCard reason={t("templates.limitReached", { max: ent.maxCustomTemplates })} />}
      <Button size="xl" className="w-full" onClick={save}>
        {t("common.save")}
      </Button>
      <ExercisePicker
        open={picker}
        onOpenChange={setPicker}
        onPick={async (ids) => {
          const added = await Promise.all(
            ids.map(async (exercise_id) => ({
              exercise_id,
              target_sets: 3,
              target_reps_min: 8,
              target_reps_max: 12,
              rest_sec: (await getExercise(exercise_id))?.default_rest_sec ?? null,
              superset_group: null,
            })),
          );
          setItems((cur) => [...cur, ...added]);
        }}
      />
    </div>
  );
}

export default function TemplateEditPage() {
  return (
    <Suspense>
      <Editor />
    </Suspense>
  );
}
