"use client";

import { useMutation } from "@tanstack/react-query";
import { Check, Crown } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, Segmented } from "@/components/common";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { PRICING, type Plan } from "@/lib/entitlements";
import { db } from "@/lib/db/local";
import { useEntitlements } from "@/lib/hooks";
import { authHeader } from "@/lib/supabase/client";

const FEATURES = ["templates", "programs", "charts", "photos", "export", "exercises"] as const;

declare global {
  interface Window {
    snap?: { pay: (token: string, opts: Record<string, (r?: unknown) => void>) => void };
  }
}

function loadSnap(clientKey: string, sandbox: boolean): Promise<void> {
  if (window.snap) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = sandbox ? "https://app.sandbox.midtrans.com/snap/snap.js" : "https://app.midtrans.com/snap/snap.js";
    s.dataset.clientKey = clientKey;
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export default function PremiumPage() {
  const t = useTranslations();
  const f = useFormatter();
  const ent = useEntitlements();
  const { mode, userId } = useAuth();
  const [plan, setPlan] = useState<Plan>("yearly");

  useEffect(() => {
    track("paywall_viewed", { reason: "premium_page" });
  }, []);

  const price = (n: number) => f.number(n, { style: "currency", currency: PRICING.currency, maximumFractionDigits: 0 });
  const savePct = Math.round((1 - PRICING.yearly / (PRICING.monthly * 12)) * 100);

  const checkout = useMutation({
    mutationFn: async () => {
      track("upgrade_started", { plan });
      if (mode === "demo") {
        // Demo mode has no payment provider: flip the local subscription so the UI can be tested.
        const premium = ent.tier !== "premium";
        await db.subscriptions.put({
          user_id: userId!,
          tier: premium ? "premium" : "free",
          status: "active",
          provider: "demo",
          provider_ref: null,
          current_period_end: null,
          updated_at: new Date().toISOString(),
        });
        if (premium) track("upgrade", { plan, provider: "demo" });
        return;
      }
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ plan }),
      });
      if (res.status === 503) throw new Error("not_configured");
      if (!res.ok) throw new Error("failed");
      const { token, clientKey, sandbox } = (await res.json()) as { token: string; clientKey: string; sandbox: boolean };
      await loadSnap(clientKey, sandbox);
      window.snap!.pay(token, {
        onSuccess: () => toast.success(t("premium.success")),
        onPending: () => toast.success(t("premium.success")),
        onError: () => toast.error(t("common.error")),
        onClose: () => {},
      });
    },
    onError: (e) => toast.error(e.message === "not_configured" ? t("premium.notConfigured") : t("common.error")),
  });

  return (
    <div className="space-y-6">
      <PageHeader back title={t("premium.title")} />
      <div className="rounded-3xl border border-primary/50 bg-gradient-to-b from-accent/60 to-card p-6 text-center">
        <Crown className="mx-auto size-12 text-primary" aria-hidden />
        <p className="mt-2 text-lg">{t("premium.subtitle")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("premium.current", { plan: ent.tier === "premium" ? t("common.premium") : t("common.free") })}</p>
      </div>

      <ul className="space-y-3">
        {FEATURES.map((k) => (
          <li key={k} className="flex items-start gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="size-4" strokeWidth={3} aria-hidden />
            </span>
            <span>{t(`premium.features.${k}`)}</span>
          </li>
        ))}
      </ul>

      {ent.tier !== "premium" || mode === "demo" ? (
        <div className="space-y-4">
          {ent.tier !== "premium" && (
            <>
              <Segmented
                label={t("premium.title")}
                value={plan}
                onChange={setPlan}
                options={[
                  { value: "monthly", label: t("premium.monthly") },
                  { value: "yearly", label: `${t("premium.yearly")} · ${t("premium.save", { pct: savePct })}` },
                ]}
              />
              <p className="text-center">
                <span className="num text-5xl">{price(plan === "monthly" ? PRICING.monthly : PRICING.yearly)}</span>
                <span className="text-muted-foreground">{plan === "monthly" ? t("premium.perMonth") : t("premium.perYear")}</span>
              </p>
              {PRICING.trialDays > 0 && <p className="text-center text-sm font-semibold text-primary">{t("premium.trial", { days: PRICING.trialDays })}</p>}
            </>
          )}
          <Button size="xl" className="w-full" disabled={checkout.isPending} onClick={() => checkout.mutate()}>
            {mode === "demo"
              ? ent.tier === "premium"
                ? t("premium.demoDowngrade")
                : t("premium.demoUpgrade")
              : checkout.isPending
                ? t("premium.processing")
                : t("premium.cta")}
          </Button>
        </div>
      ) : null}
      <p className="text-center text-sm text-muted-foreground">{t("premium.keepData")}</p>
    </div>
  );
}
