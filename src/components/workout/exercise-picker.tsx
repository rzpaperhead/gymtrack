"use client";

import { Check, Plus, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { exerciseName, useExerciseCatalog } from "@/lib/catalog";
import { groupExercises, MUSCLE_GROUPS, type GroupKey } from "@/lib/exercises/groups";
import { EQUIPMENT, type Equipment, type Exercise } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Case/diacritic-insensitive match against both language names. */
export function matchesQuery(e: Exercise, q: string): boolean {
  if (!q) return true;
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return norm(`${e.name_id} ${e.name_en}`).includes(norm(q.trim()));
}

export function useFilteredExercises(query: string, equipment: Equipment | "") {
  const catalog = useExerciseCatalog();
  const locale = useLocale();
  return useMemo(
    () =>
      (catalog?.list ?? [])
        .filter((e) => matchesQuery(e, query) && (!equipment || e.equipment === equipment))
        .sort((a, b) => exerciseName(a, locale).localeCompare(exerciseName(b, locale), locale)),
    [catalog, query, equipment, locale],
  );
}

export interface FilterState {
  query: string;
  setQuery: (v: string) => void;
  group: GroupKey | "";
  setGroup: (v: GroupKey | "") => void;
  equipment: Equipment | "";
  setEquipment: (v: Equipment | "") => void;
}

export function useExerciseFilters(): FilterState {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<GroupKey | "">("");
  const [equipment, setEquipment] = useState<Equipment | "">("");
  return { query, setQuery, group, setGroup, equipment, setEquipment };
}

export function ExerciseFilters({ query, setQuery, group, setGroup, equipment, setEquipment }: FilterState) {
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
      <div role="radiogroup" aria-label={t("exercises.muscle")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {(["", ...MUSCLE_GROUPS.map((g) => g.key)] as const).map((k) => (
          <button
            key={k || "all"}
            type="button"
            role="radio"
            aria-checked={group === k}
            onClick={() => setGroup(k)}
            className={cn(
              "min-h-10 shrink-0 rounded-full border px-4 text-sm font-semibold",
              group === k ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            {k ? t(`groups.${k}`) : t("common.all")}
          </button>
        ))}
      </div>
      <select
        aria-label={t("exercises.equipment")}
        value={equipment}
        onChange={(e) => setEquipment(e.target.value as Equipment | "")}
        className="h-11 w-full rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30 [&>option]:bg-popover"
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
  );
}

/** Exercises split into muscle-group sections with sticky headings. */
export function GroupedExerciseList({
  list,
  group,
  renderItem,
}: {
  list: Exercise[];
  group: GroupKey | "";
  renderItem: (e: Exercise) => ReactNode;
}) {
  const t = useTranslations();
  const sections = groupExercises(list, group);
  if (!sections.length) return <p className="p-6 text-center text-muted-foreground">{t("exercises.noResults")}</p>;
  return (
    <div>
      {sections.map((s, i) => {
        const showGroup = !s.isSub || sections.findIndex((x) => x.group === s.group) === i;
        return (
          <section key={`${s.group}-${s.part}`} aria-label={s.isSub ? `${t(`groups.${s.group}`)} · ${t(`groups.${s.part}`)}` : t(`groups.${s.group}`)}>
            <h3 className="sticky top-0 z-10 bg-popover px-3 py-2 text-sm font-bold uppercase tracking-wide text-primary backdrop-blur">
              {showGroup && t(`groups.${s.group}`)}
              {s.isSub && (
                <span className={cn("text-muted-foreground", showGroup && "ml-2")}>
                  {showGroup ? "· " : ""}
                  {t(`groups.${s.part}`)}
                </span>
              )}
            </h3>
            <ul>{s.items.map((e) => <li key={e.id}>{renderItem(e)}</li>)}</ul>
          </section>
        );
      })}
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
  const filters = useExerciseFilters();
  const [selected, setSelected] = useState<string[]>([]);
  const list = useFilteredExercises(filters.query, filters.equipment);

  const close = (o: boolean) => {
    if (!o) setSelected([]);
    onOpenChange(o);
  };

  return (
    <Sheet open={open} onOpenChange={close}>
      {/* min-h-0 + overflow on the list is what makes the long list scroll inside the sheet */}
      <SheetContent side="bottom" className="flex h-[92dvh] max-h-[92dvh] flex-col gap-3 overflow-hidden rounded-t-3xl p-0 data-[side=bottom]:h-[92dvh]" closeLabel={t("common.close")}>
        <SheetHeader className="shrink-0 px-4 pt-4 pb-0">
          <SheetTitle className="text-xl font-bold uppercase">{t("active.addExercise")}</SheetTitle>
        </SheetHeader>
        <div className="shrink-0 px-4">
          <ExerciseFilters {...filters} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2" aria-label={t("exercises.title")}>
          <GroupedExerciseList
            list={list}
            group={filters.group}
            renderItem={(e) => {
              const on = selected.includes(e.id);
              return (
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
              );
            }}
          />
        </div>
        <div className="pb-safe shrink-0 border-t p-3">
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
