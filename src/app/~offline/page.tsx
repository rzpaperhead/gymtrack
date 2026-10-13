"use client";

import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { LinkButton } from "@/components/link-button";

export default function OfflinePage() {
  const t = useTranslations("offline");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <WifiOff className="size-12 text-primary" aria-hidden />
      <h1 className="text-3xl font-extrabold uppercase">{t("title")}</h1>
      <p className="max-w-sm text-muted-foreground">{t("body")}</p>
      <LinkButton href="/workout/active" size="lg">
        {t("openWorkout")}
      </LinkButton>
    </main>
  );
}
