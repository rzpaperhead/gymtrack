"use client";

import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/common";

/** Placeholder legal copy (BRIEF §8). Replace with reviewed text before launch. */
export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const t = useTranslations("legal");
  return (
    <div className="mx-auto max-w-2xl px-4 pb-16">
      <PageHeader back="/" title={kind === "privacy" ? t("privacyTitle") : t("termsTitle")} />
      <p className="text-sm text-muted-foreground">{t("updated", { date: "2026-10-13" })}</p>
      <p className="mt-6 rounded-2xl border border-dashed p-4">{t("placeholder")}</p>
    </div>
  );
}
