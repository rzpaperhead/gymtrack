"use client";

import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader, PaywallCard } from "@/components/common";
import { ExerciseFormDialog } from "@/components/exercise-form";
import { Button } from "@/components/ui/button";
import { ExerciseFilters, useFilteredExercises } from "@/components/workout/exercise-picker";
import { exerciseName, useExerciseCatalog } from "@/lib/catalog";
import { canCreate } from "@/lib/entitlements";
import { useEntitlements } from "@/lib/hooks";
import type { Equipment, Muscle } from "@/lib/types";

export default function ExercisesPage() {
  const t = useTranslations();
  const locale = useLocale();
  const ent = useEntitlements();
  const catalog = useExerciseCatalog();
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<Muscle | "">("");
  const [equipment, setEquipment] = useState<Equipment | "">("");
  const [creating, setCreating] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const list = useFilteredExercises(query, muscle, equipment);

  return (
    <div className="space-y-4">
      <PageHeader
        back="/workout"
        title={t("exercises.title")}
        actions={
          <Button
            size="icon"
            aria-label={t("exercises.create")}
            onClick={() => (catalog && canCreate(ent, "exercises", catalog.customCount) ? setCreating(true) : setShowPaywall(true))}
          >
            <Plus />
          </Button>
        }
      />
      {showPaywall && <PaywallCard reason={t("exercises.limitReached", { max: ent.maxCustomExercises })} />}
      <ExerciseFilters {...{ query, setQuery, muscle, setMuscle, equipment, setEquipment }} />
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("common.exercisesCount", { count: list.length })}
      </p>
      <ul className="divide-y rounded-2xl border bg-card">
        {list.map((e) => (
          <li key={e.id}>
            <Link href={`/exercises/view?id=${e.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2 outline-none focus-visible:bg-muted">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{exerciseName(e, locale)}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {t(`muscles.${e.primary_muscle}`)} · {t(`equipment.${e.equipment}`)}
                  {e.owner_id && <span className="ml-1 rounded bg-accent px-1.5 py-0.5 font-semibold text-accent-foreground">{t("exercises.custom")}</span>}
                </span>
              </span>
              <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <ExerciseFormDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
