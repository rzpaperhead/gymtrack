"use client";

import { Check, Plus, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { exerciseName, useExerciseCatalog } from "@/lib/catalog";
import { EQUIPMENT, MUSCLES, type Equipment, type Exercise, type Muscle } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Case/diacritic-insensitive match against both language names. */
export function matchesQuery(e: Exercise, q: string): boolean {
  if (!q) return true;
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const needle = norm(q.trim());
  return norm(`${e.name_id} ${e.name_en}`).includes(needle);
}

export function useFilteredExercises(query: string, muscle: Muscle | "", equipment: Equipment | "") {
  const catalog = useExerciseCatalog();
  const locale = useLocale();
  return useMemo(
    () =>
      (catalog?.list ?? [])
        .filter(
          (e) =>
            matchesQuery(e, query) &&
            (!muscle || e.primary_muscle === muscle || e.secondary_muscles.includes(muscle)) &&
            (!equipment || e.equipment === equipment),
        )
        .sort((a, b) => exerciseName(a, locale).localeCompare(exerciseName(b, locale), locale)),
    [catalog, query, muscle, equipment, locale],
  );
}

export function ExerciseFilters({
  query,
  setQuery,
  muscle,
  setMuscle,
  equipment,
  setEquipment,
}: {
  query: string;
  setQuery: (v: string) => void;
  muscle: Muscle | "";
  setMuscle: (v: Muscle | "") => void;
  equipment: Equipment | "";
  setEquipment: (v: Equipment | "") => void;
}) {
  const t = useTranslations();
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("exercises.searchPlaceholder")}
          aria-label={t("common.search")}
          className="pl-10"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label={t("exercises.muscle")}
          value={muscle}
          onChange={(e) => setMuscle(e.target.value as Muscle | "")}
          className="h-11 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30 [&>option]:bg-popover"
        >
          <option value="">
            {t("exercises.muscle")}: {t("common.all")}
          </option>
          {MUSCLES.map((m) => (
            <option key={m} value={m}>
              {t(`muscles.${m}`)}
            </option>
          ))}
        </select>
        <select
          aria-label={t("exercises.equipment")}
          value={equipment}
          onChange={(e) => setEquipment(e.target.value as Equipment | "")}
          className="h-11 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30 [&>option]:bg-popover"
        >
          <option value="">
            {t("exercises.equipment")}: {t("common.all")}
          </option>
          {EQUIPMENT.map((m) => (
            <option key={m} value={m}>
              {t(`equipment.${m}`)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Bottom sheet to pick one or more exercises. */
export function ExercisePicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (ids: string[]) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<Muscle | "">("");
  const [equipment, setEquipment] = useState<Equipment | "">("");
  const [selected, setSelected] = useState<string[]>([]);
  const list = useFilteredExercises(query, muscle, equipment);

  const close = (o: boolean) => {
    if (!o) setSelected([]);
    onOpenChange(o);
  };

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent side="bottom" className="h-[92dvh] rounded-t-3xl p-0" closeLabel={t("common.close")}>
        <SheetHeader className="px-4 pt-4 pb-0">
          <SheetTitle className="text-xl font-bold uppercase">{t("active.addExercise")}</SheetTitle>
        </SheetHeader>
        <div className="px-4">
          <ExerciseFilters {...{ query, setQuery, muscle, setMuscle, equipment, setEquipment }} />
        </div>
        <ul className="flex-1 overflow-y-auto px-2" aria-label={t("exercises.title")}>
          {list.map((e) => {
            const on = selected.includes(e.id);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSelected(on ? selected.filter((x) => x !== e.id) : [...selected, e.id])}
                  className={cn(
                    "flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    on && "bg-accent/50",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full border-2",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                    )}
                    aria-hidden
                  >
                    {on && <Check className="size-4" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{exerciseName(e, locale)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {t(`muscles.${e.primary_muscle}`)} · {t(`equipment.${e.equipment}`)}
                      {e.owner_id && ` · ${t("exercises.custom")}`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {!list.length && <li className="p-6 text-center text-muted-foreground">{t("exercises.noResults")}</li>}
        </ul>
        <div className="pb-safe border-t p-3">
          <Button
            size="xl"
            className="w-full"
            disabled={!selected.length}
            onClick={() => {
              onPick(selected);
              close(false);
            }}
          >
            <Plus aria-hidden /> {selected.length ? t("exercises.addSelected", { count: selected.length }) : t("active.addExercise")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
