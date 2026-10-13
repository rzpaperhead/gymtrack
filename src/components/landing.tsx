"use client";

import { BarChart3, Dumbbell, LayoutList, Timer, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { LinkButton } from "@/components/link-button";
import { LanguageSwitch } from "@/components/language-switch";

const FEATURES = [
  { icon: Timer, title: "f1Title", body: "f1Body" },
  { icon: WifiOff, title: "f2Title", body: "f2Body" },
  { icon: BarChart3, title: "f3Title", body: "f3Body" },
  { icon: LayoutList, title: "f4Title", body: "f4Body" },
] as const;

export function Landing() {
  const t = useTranslations("landing");
  const router = useRouter();

  // Returning users skip the marketing page. Checked via storage keys so the
  // landing page doesn't have to load Supabase or IndexedDB code.
  useEffect(() => {
    try {
      const keys = Object.keys(localStorage);
      if (localStorage.getItem("gt-demo") === "1" || keys.some((k) => /^sb-.+-auth-token$/.test(k))) router.replace("/home");
    } catch {}
  }, [router]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4">
      <header className="pt-safe flex min-h-16 items-center justify-between">
        <span className="flex items-center gap-2 text-primary">
          <Dumbbell className="size-7" aria-hidden />
          <span className="font-[family-name:var(--font-display)] text-2xl font-extrabold uppercase text-foreground">GymTrack</span>
        </span>
        <div className="flex items-center gap-1">
          <LanguageSwitch />
          <LinkButton href="/login" variant="ghost">
            {t("login")}
          </LinkButton>
        </div>
      </header>

      <main className="flex-1">
        <section className="py-14 md:py-24">
          <h1 className="max-w-3xl text-5xl leading-[0.95] font-extrabold uppercase md:text-7xl">
            {t("tagline")}
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">{t("subtitle")}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <LinkButton href="/login" size="xl" className="sm:w-auto">
              {t("cta")}
            </LinkButton>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{t("install")}</p>
        </section>

        {/* A glanceable mock of a set row: the product's core interaction. */}
        <section aria-hidden className="mb-14 rounded-3xl border bg-card p-4 md:max-w-md">
          <p className="font-bold">Bench Press (Barbel)</p>
          {[
            ["1", "60 × 8", "62.5", "8", true],
            ["2", "60 × 8", "62.5", "8", true],
            ["3", "60 × 7", "62.5", "7", false],
          ].map(([n, prev, w, r, done]) => (
            <div key={String(n)} className={`mt-2 grid grid-cols-[2rem_1fr_4rem_3rem_2.75rem] items-center gap-2 rounded-xl p-1 ${done ? "bg-primary/15" : ""}`}>
              <span className="num text-center text-lg">{n}</span>
              <span className="text-center text-sm text-muted-foreground">{prev}</span>
              <span className="num rounded-lg bg-muted py-2 text-center text-xl">{w}</span>
              <span className="num rounded-lg bg-muted py-2 text-center text-xl">{r}</span>
              <span className={`flex size-11 items-center justify-center rounded-xl border-2 ${done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"}`}>✓</span>
            </div>
          ))}
        </section>

        <section className="grid gap-4 pb-16 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-2xl border bg-card p-5">
              <Icon className="size-7 text-primary" aria-hidden />
              <h2 className="mt-3 text-2xl font-bold uppercase">{t(title)}</h2>
              <p className="mt-1 text-muted-foreground">{t(body)}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="pb-safe flex flex-wrap items-center justify-between gap-2 border-t py-6 text-sm text-muted-foreground">
        <span>{t("footer", { year: new Date().getFullYear() })}</span>
        <span className="flex gap-4">
          <Link href="/privacy" className="underline-offset-4 hover:underline">
            {t("privacy")}
          </Link>
          <Link href="/terms" className="underline-offset-4 hover:underline">
            {t("terms")}
          </Link>
        </span>
      </footer>
    </div>
  );
}
