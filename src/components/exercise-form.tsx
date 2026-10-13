"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Field, NativeSelect } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { customExerciseSchema, saveCustomExercise, type CustomExerciseInput } from "@/lib/data/exercises";
import { EQUIPMENT, EXERCISE_TYPES, MUSCLES, type Exercise } from "@/lib/types";
import { cn } from "@/lib/utils";

const DEFAULTS: CustomExerciseInput = {
  name: "",
  primary_muscle: "chest",
  secondary_muscles: [],
  equipment: "barbell",
  type: "weight_reps",
  default_rest_sec: 90,
};

export function ExerciseFormDialog({
  open,
  onOpenChange,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing?: Exercise;
  onSaved?: (id: string) => void;
}) {
  const t = useTranslations();
  const form = useForm<CustomExerciseInput>({ resolver: zodResolver(customExerciseSchema), defaultValues: DEFAULTS });
  const primary = useWatch({ control: form.control, name: "primary_muscle" });

  useEffect(() => {
    if (!open) return;
    form.reset(
      existing
        ? {
            name: existing.name_id,
            primary_muscle: existing.primary_muscle,
            secondary_muscles: existing.secondary_muscles,
            equipment: existing.equipment,
            type: existing.type,
            default_rest_sec: existing.default_rest_sec,
          }
        : DEFAULTS,
    );
  }, [open, existing, form]);

  const submit = form.handleSubmit(async (v) => {
    const id = await saveCustomExercise(v, existing?.id);
    onOpenChange(false);
    onSaved?.(id);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{existing ? t("exercises.editCustom") : t("exercises.create")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label={t("exercises.name")} htmlFor="ex-name" error={form.formState.errors.name && t("templates.nameRequired")}>
            <Input id="ex-name" maxLength={80} {...form.register("name")} aria-invalid={!!form.formState.errors.name} />
          </Field>
          <Controller
            control={form.control}
            name="type"
            render={({ field }) => (
              <NativeSelect label={t("exercises.type")} value={field.value} onChange={field.onChange}>
                {EXERCISE_TYPES.map((x) => (
                  <option key={x} value={x}>
                    {t(`exerciseTypes.${x}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          />
          <Controller
            control={form.control}
            name="equipment"
            render={({ field }) => (
              <NativeSelect label={t("exercises.equipment")} value={field.value} onChange={field.onChange}>
                {EQUIPMENT.map((x) => (
                  <option key={x} value={x}>
                    {t(`equipment.${x}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          />
          <Controller
            control={form.control}
            name="primary_muscle"
            render={({ field }) => (
              <NativeSelect label={t("exercises.primaryMuscle")} value={field.value} onChange={field.onChange}>
                {MUSCLES.map((x) => (
                  <option key={x} value={x}>
                    {t(`muscles.${x}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          />
          <Controller
            control={form.control}
            name="secondary_muscles"
            render={({ field }) => (
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium">
                  {t("exercises.secondaryMuscles")} <span className="text-muted-foreground">({t("exercises.secondaryHint")})</span>
                </legend>
                <div className="flex flex-wrap gap-2">
                  {MUSCLES.filter((m) => m !== primary).map((m) => {
                    const on = field.value.includes(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={on}
                        onClick={() => field.onChange(on ? field.value.filter((x) => x !== m) : [...field.value, m])}
                        className={cn("min-h-9 rounded-full border px-3 text-sm", on && "border-primary bg-primary text-primary-foreground")}
                      >
                        {t(`muscles.${m}`)}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}
          />
          <Field label={t("exercises.defaultRest")} htmlFor="ex-rest">
            <Input id="ex-rest" type="number" inputMode="numeric" min={0} max={900} {...form.register("default_rest_sec", { valueAsNumber: true })} />
          </Field>
          <DialogFooter>
            <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
