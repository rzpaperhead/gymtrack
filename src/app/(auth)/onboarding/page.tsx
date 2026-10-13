"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Field, Segmented } from "@/components/common";
import { useAuth, useProfile } from "@/components/providers/auth-provider";
import { useSetLocale } from "@/components/providers/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LOCALE_LABELS } from "@/i18n/messages";
import { track } from "@/lib/analytics";
import { parseWeightInput } from "@/lib/calc/units";
import { dateKey } from "@/lib/calc/stats";
import { saveBodyMetric } from "@/lib/data/body";
import { updateProfile } from "@/lib/data/profile";
import { nowIso } from "@/lib/db/session";
import type { Goal, Locale, Unit } from "@/lib/types";

const schema = z.object({
  display_name: z.string().trim().max(60),
  locale: z.enum(["id", "en"]),
  unit: z.enum(["kg", "lb"]),
  goal: z.enum(["strength", "hypertrophy", "general"]),
  weekly_target: z.number().int().min(1).max(7),
  bodyweight: z.string().refine((v) => v.trim() === "" || parseWeightInput(v, "kg") != null),
});
type Values = z.infer<typeof schema>;

const TOTAL = 4;

export default function OnboardingPage() {
  const t = useTranslations();
  const router = useRouter();
  const { status, ready } = useAuth();
  const profile = useProfile();
  const { locale, setLocale } = useSetLocale();
  const [step, setStep] = useState(1);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { display_name: "", locale, unit: "kg", goal: "general", weekly_target: 3, bodyweight: "" },
  });
  const unit = useWatch({ control: form.control, name: "unit" });

  useEffect(() => {
    if (status === "signed_out") router.replace("/login");
    if (profile?.onboarded_at) router.replace("/home");
  }, [status, profile, router]);

  useEffect(() => {
    if (ready && profile && !profile.onboarded_at) {
      track("signup");
      if (profile.display_name) form.setValue("display_name", profile.display_name);
    }
    // Run once when the fresh profile first loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, !!profile]);

  const finish = form.handleSubmit(async (v) => {
    const kg = v.bodyweight.trim() ? parseWeightInput(v.bodyweight, v.unit) : null;
    await updateProfile({
      display_name: v.display_name,
      locale: v.locale,
      unit: v.unit,
      goal: v.goal,
      weekly_target: v.weekly_target,
      bodyweight_start_kg: kg,
      onboarded_at: nowIso(),
    });
    if (kg) await saveBodyMetric(dateKey(new Date()), { weight_kg: kg });
    track("onboarding_completed", { goal: v.goal, unit: v.unit, weekly_target: v.weekly_target });
    router.replace("/home");
  });

  if (!ready || !profile) return null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-8">
      <p className="text-sm font-semibold text-muted-foreground" aria-live="polite">
        {t("onboarding.step", { current: step, total: TOTAL })}
      </p>
      <div className="mt-2 flex gap-1" aria-hidden>
        {Array.from({ length: TOTAL }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>

      <form onSubmit={(e) => e.preventDefault()} className="mt-8 flex flex-1 flex-col gap-6">
        {step === 1 && (
          <>
            <h1 className="text-4xl font-extrabold uppercase">{t("onboarding.welcome")}</h1>
            <Field label={t("common.name")} htmlFor="name">
              <Input id="name" autoComplete="nickname" placeholder={t("onboarding.namePlaceholder")} {...form.register("display_name")} />
            </Field>
            <Controller
              control={form.control}
              name="locale"
              render={({ field }) => (
                <div className="grid gap-1.5">
                  <span className="text-sm font-medium">{t("onboarding.language")}</span>
                  <Segmented<Locale>
                    label={t("onboarding.language")}
                    value={field.value}
                    onChange={(v) => {
                      field.onChange(v);
                      setLocale(v);
                    }}
                    options={(["id", "en"] as const).map((l) => ({ value: l, label: LOCALE_LABELS[l] }))}
                  />
                </div>
              )}
            />
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-4xl font-extrabold uppercase">{t("onboarding.unitGoal")}</h1>
            <Controller
              control={form.control}
              name="unit"
              render={({ field }) => (
                <div className="grid gap-1.5">
                  <span className="text-sm font-medium">{t("onboarding.unit")}</span>
                  <Segmented<Unit>
                    label={t("onboarding.unit")}
                    value={field.value}
                    onChange={field.onChange}
                    options={[
                      { value: "kg", label: "kg" },
                      { value: "lb", label: "lb" },
                    ]}
                  />
                </div>
              )}
            />
            <Controller
              control={form.control}
              name="goal"
              render={({ field }) => (
                <fieldset className="grid gap-2">
                  <legend className="mb-1.5 text-sm font-medium">{t("onboarding.goal")}</legend>
                  {(["strength", "hypertrophy", "general"] as Goal[]).map((g) => (
                    <label
                      key={g}
                      className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 has-checked:border-primary has-checked:bg-accent/40"
                    >
                      <input type="radio" className="size-5 accent-[var(--primary)]" checked={field.value === g} onChange={() => field.onChange(g)} />
                      <span className="font-semibold">{t(`goals.${g}`)}</span>
                    </label>
                  ))}
                </fieldset>
              )}
            />
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="text-4xl font-extrabold uppercase">{t("onboarding.frequency")}</h1>
            <p className="text-muted-foreground">{t("onboarding.frequencyHint")}</p>
            <Controller
              control={form.control}
              name="weekly_target"
              render={({ field }) => (
                <div role="radiogroup" aria-label={t("onboarding.frequency")} className="grid grid-cols-7 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={field.value === n}
                      onClick={() => field.onChange(n)}
                      className={`num aspect-square min-h-11 rounded-xl border text-2xl ${field.value === n ? "border-primary bg-primary text-primary-foreground" : ""}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
            />
          </>
        )}

        {step === 4 && (
          <>
            <h1 className="text-4xl font-extrabold uppercase">{t("onboarding.bodyweight")}</h1>
            <Field label={`${t("onboarding.bodyweight")} (${unit})`} hint={t("onboarding.bodyweightHint")} htmlFor="bw">
              <Input id="bw" inputMode="decimal" className="num h-16 text-3xl" {...form.register("bodyweight")} />
            </Field>
          </>
        )}

        <div className="mt-auto flex gap-3">
          {step > 1 && (
            <Button type="button" variant="outline" size="xl" className="flex-1" onClick={() => setStep(step - 1)}>
              {t("common.back")}
            </Button>
          )}
          {step < TOTAL ? (
            <Button type="button" size="xl" className="flex-1" onClick={() => setStep(step + 1)}>
              {t("common.continue")}
            </Button>
          ) : (
            <Button type="button" size="xl" className="flex-1" onClick={finish} disabled={form.formState.isSubmitting}>
              {t("onboarding.finish")}
            </Button>
          )}
        </div>
      </form>
    </main>
  );
}
