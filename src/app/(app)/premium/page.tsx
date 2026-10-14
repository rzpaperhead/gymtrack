"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Crown, ImageUp, Ticket } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, Field, LinkButton, PageHeader, Section } from "@/components/common";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { track } from "@/lib/analytics";
import { MANUAL_PRICING, uniqueTransferCode, usdToIdr } from "@/lib/entitlements";
import { myConfirmations, redeemPromoCode, submitPaymentProof } from "@/lib/data/premium";
import { db } from "@/lib/db/local";
import { useEntitlements, useIsAdmin, useOnline } from "@/lib/hooks";
import { useLiveQuery } from "dexie-react-hooks";

const FEATURES = ["templates", "programs", "charts", "photos", "export", "exercises"] as const;

export default function PremiumPage() {
  const t = useTranslations();
  const f = useFormatter();
  const ent = useEntitlements();
  const admin = useIsAdmin();
  const { mode, userId, guest } = useAuth();
  const online = useOnline();
  const sub = useLiveQuery(async () => (userId ? db.subscriptions.get(userId) : undefined), [userId]);

  useEffect(() => {
    track("paywall_viewed", { reason: "premium_page" });
  }, []);

  const fx = useQuery({
    queryKey: ["fx"],
    queryFn: async () => (await (await fetch("/api/fx")).json()) as { rate: number; source: string },
    staleTime: 6 * 3600_000,
  });
  const rate = fx.data?.rate ?? MANUAL_PRICING.fallbackUsdIdr;
  const unique = userId ? uniqueTransferCode(userId) : 0;
  const idr = usdToIdr(MANUAL_PRICING.usd, rate) + unique;
  const idrOriginal = usdToIdr(MANUAL_PRICING.usdOriginal, rate);
  const rupiah = (n: number) => f.number(n, { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
  const usd = (n: number) => f.number(n, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  const discount = Math.round((1 - MANUAL_PRICING.usd / MANUAL_PRICING.usdOriginal) * 100);

  return (
    <div className="space-y-6">
      <PageHeader back title={t("premium.title")} />
      <div className="rounded-3xl border border-primary/50 bg-gradient-to-b from-accent/60 to-card p-6 text-center">
        <Crown className="mx-auto size-12 text-primary" aria-hidden />
        <p className="mt-2 text-lg">{t("premium.subtitle")}</p>
        <p className="mt-1 text-sm font-semibold">
          {admin ? t("admin.youAreAdmin") : t("premium.current", { plan: ent.tier === "premium" ? t("common.premium") : t("common.free") })}
        </p>
        {ent.tier === "premium" && !admin && (
          <p className="text-sm text-muted-foreground">
            {sub?.current_period_end
              ? t("premium.until", { date: f.dateTime(new Date(sub.current_period_end), { dateStyle: "medium" }) })
              : t("premium.permanent")}
          </p>
        )}
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

      {guest ? (
        <div className="space-y-3 rounded-2xl border border-dashed p-4 text-center">
          <p className="text-muted-foreground">{t("premium.signUpFirst")}</p>
          <LinkButton href="/login" className="w-full">
            {t("auth.signUp")}
          </LinkButton>
        </div>
      ) : mode === "demo" ? (
        <DemoToggle />
      ) : !online ? (
        <p className="rounded-2xl border border-dashed p-4 text-center text-muted-foreground">{t("premium.needOnline")}</p>
      ) : (
        !admin && (
          <>
            <Section title={t("premium.payTitle")}>
              <Card className="space-y-4">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    <span className="line-through">{usd(MANUAL_PRICING.usdOriginal)}</span>{" "}
                    <span className="rounded bg-primary px-1.5 py-0.5 text-xs font-bold text-primary-foreground">-{discount}%</span>
                  </p>
                  <p className="num text-5xl">{rupiah(idr)}</p>
                  <p className="text-sm text-muted-foreground">
                    {usd(MANUAL_PRICING.usd)} · {t("premium.oneTime")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("premium.rateNote", { rate: f.number(Math.round(rate)), original: rupiah(idrOriginal) })}
                  </p>
                </div>
                <ol className="list-decimal space-y-2 pl-5 text-sm">
                  <li>{t("premium.step1", { amount: rupiah(idr) })}</li>
                  <li className="text-muted-foreground">{t("premium.uniqueNote", { code: unique })}</li>
                  <li>{t("premium.step2")}</li>
                  <li>{t("premium.step3")}</li>
                </ol>
                <BankBox />
              </Card>
            </Section>
            <ConfirmPayment amountIdr={idr} />
          </>
        )
      )}

      {mode === "supabase" && !guest && online && !admin && <RedeemCode />}
      <p className="text-center text-sm text-muted-foreground">{t("premium.keepData")}</p>
    </div>
  );
}

function BankBox() {
  const t = useTranslations("premium");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(MANUAL_PRICING.accountNumber);
      toast.success(t("copied"));
    } catch {}
  };
  return (
    <div className="rounded-2xl bg-muted p-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{MANUAL_PRICING.bankName}</p>
      <div className="flex items-center justify-between gap-2">
        <p className="num text-3xl tracking-wider">{MANUAL_PRICING.accountNumber}</p>
        <Button variant="secondary" size="icon" aria-label={t("copyAccount")} onClick={copy}>
          <Copy />
        </Button>
      </div>
      {MANUAL_PRICING.accountHolder && (
        <p className="text-sm">
          {t("accountHolder")}: <span className="font-semibold">{MANUAL_PRICING.accountHolder}</span>
        </p>
      )}
    </div>
  );
}

function ConfirmPayment({ amountIdr }: { amountIdr: number }) {
  const t = useTranslations();
  const f = useFormatter();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const history = useQuery({ queryKey: ["my-confirmations"], queryFn: myConfirmations });
  const pending = history.data?.find((c) => c.status === "pending");

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preview follows the chosen file
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const send = useMutation({
    mutationFn: () => submitPaymentProof(file!, amountIdr, note),
    onSuccess: () => {
      toast.success(t("premium.proofSent"));
      track("upgrade_started", { method: "bank_transfer" });
      setFile(null);
      setPreview(null);
      setNote("");
      void qc.invalidateQueries({ queryKey: ["my-confirmations"] });
    },
    onError: () => toast.error(t("common.error")),
  });

  return (
    <Section title={t("premium.confirmTitle")}>
      <Card className="space-y-4">
        {pending ? (
          <p role="status" className="rounded-xl bg-accent/50 p-3 text-sm">
            {t("premium.pendingReview", { date: f.dateTime(new Date(pending.created_at), { dateStyle: "medium", timeStyle: "short" }) })}
          </p>
        ) : (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label={t("premium.uploadProof")}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local preview
              <img src={preview} alt={t("premium.proofPreview")} className="max-h-80 w-full rounded-xl object-contain" />
            ) : null}
            <Button variant="secondary" className="w-full" onClick={() => fileRef.current?.click()}>
              <ImageUp aria-hidden /> {file ? t("premium.changeProof") : t("premium.uploadProof")}
            </Button>
            <Field label={`${t("common.notes")} (${t("common.optional")})`} htmlFor="pay-note">
              <Textarea id="pay-note" rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder={t("premium.notePlaceholder")} />
            </Field>
            <Button size="xl" className="w-full" disabled={!file || send.isPending} onClick={() => send.mutate()}>
              {send.isPending ? t("premium.sending") : t("premium.sendProof")}
            </Button>
          </>
        )}
        {history.data && history.data.some((c) => c.status !== "pending") && (
          <ul className="space-y-1 text-sm">
            {history.data
              .filter((c) => c.status !== "pending")
              .map((c) => (
                <li key={c.id} className="flex justify-between text-muted-foreground">
                  <span>{f.dateTime(new Date(c.created_at), { dateStyle: "medium" })}</span>
                  <span className={c.status === "approved" ? "font-semibold text-primary" : "text-destructive"}>{t(`admin.status.${c.status}`)}</span>
                </li>
              ))}
          </ul>
        )}
      </Card>
    </Section>
  );
}

function RedeemCode() {
  const t = useTranslations("premium");
  const [code, setCode] = useState("");
  const redeem = useMutation({
    mutationFn: () => redeemPromoCode(code),
    onSuccess: (r) => {
      if (r === "ok") {
        toast.success(t("redeemOk"));
        track("upgrade", { method: "promo" });
        setCode("");
      } else toast.error(t(`redeem_${r}`));
    },
    onError: () => toast.error(t("redeem_invalid")),
  });
  return (
    <Section title={t("haveCode")}>
      <Card className="flex items-end gap-2">
        <div className="flex-1">
          <Field label={t("codeLabel")} htmlFor="promo">
            <Input id="promo" value={code} autoCapitalize="characters" onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="GT-XXXX-XXXX" className="num tracking-wider" />
          </Field>
        </div>
        <Button disabled={code.trim().length < 4 || redeem.isPending} onClick={() => redeem.mutate()}>
          <Ticket aria-hidden /> {t("redeem")}
        </Button>
      </Card>
    </Section>
  );
}

function DemoToggle() {
  const t = useTranslations("premium");
  const ent = useEntitlements();
  const { userId } = useAuth();
  return (
    <Button
      size="xl"
      className="w-full"
      onClick={() =>
        db.subscriptions.put({
          user_id: userId!,
          tier: ent.tier === "premium" ? "free" : "premium",
          status: "active",
          provider: "demo",
          provider_ref: null,
          current_period_end: null,
          updated_at: new Date().toISOString(),
        })
      }
    >
      {ent.tier === "premium" ? t("demoDowngrade") : t("demoUpgrade")}
    </Button>
  );
}
