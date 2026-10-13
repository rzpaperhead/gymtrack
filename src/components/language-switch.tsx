"use client";

import { Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSetLocale } from "@/components/providers/i18n-provider";
import { Button } from "@/components/ui/button";

/** Compact ID/EN toggle for screens before the profile exists. */
export function LanguageSwitch() {
  const { locale, setLocale } = useSetLocale();
  const t = useTranslations("profile");
  const next = locale === "id" ? "en" : "id";
  return (
    <Button variant="ghost" size="sm" className="h-11" onClick={() => setLocale(next)} aria-label={`${t("language")}: ${next.toUpperCase()}`}>
      <Languages className="size-4" aria-hidden />
      {locale.toUpperCase()}
    </Button>
  );
}
