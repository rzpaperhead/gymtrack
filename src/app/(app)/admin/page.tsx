"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Image as ImageIcon, KeyRound, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Card, EmptyState, Field, NativeSelect, PageHeader, Section, Segmented } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MANUAL_PRICING } from "@/lib/entitlements";
import {
  createPromoCode,
  listConfirmations,
  listPromoCodes,
  proofUrl,
  reviewPayment,
  setPromoActive,
  type PaymentConfirmation,
  type PromoCode,
} from "@/lib/data/premium";
import { useIsAdmin } from "@/lib/hooks";
import { cn } from "@/lib/utils";

type Tab = "payments" | "codes";

export default function AdminPage() {
  const t = useTranslations("admin");
  const admin = useIsAdmin();
  const [tab, setTab] = useState<Tab>("payments");
  if (!admin) return <EmptyState>{t("notAdmin")}</EmptyState>;
  return (
    <div className="space-y-4">
      <PageHeader back="/profile" title={t("title")} />
      <Segmented label={t("title")} value={tab} onChange={setTab} options={[{ value: "payments", label: t("payments") }, { value: "codes", label: t("codes") }]} />
      {tab === "payments" ? <Payments /> : <Codes />}
    </div>
  );
}

function Payments() {
  const t = useTranslations("admin");
  const f = useFormatter();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-payments"], queryFn: listConfirmations });
  const [open, setOpen] = useState<PaymentConfirmation | null>(null);
  const [days, setDays] = useState<string>(String(MANUAL_PRICING.premiumDays));
  const img = useQuery({ queryKey: ["proof", open?.proof_path], queryFn: () => proofUrl(open!.proof_path), enabled: !!open });
  const review = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => reviewPayment(id, approve, days === "permanent" ? null : Number(days)),
    onSuccess: (_, v) => {
      toast.success(v.approve ? t("approved") : t("rejected"));
      setOpen(null);
      void qc.invalidateQueries({ queryKey: ["admin-payments"] });
    },
    onError: () => toast.error(t("failed")),
  });

  if (list.isLoading) return null;
  if (!list.data?.length) return <EmptyState>{t("noPayments")}</EmptyState>;
  return (
    <>
      <ul className="space-y-2">
        {list.data.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setOpen(c)}
              className="flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{c.user_email ?? c.user_id}</span>
                <span className="block text-xs text-muted-foreground">
                  {f.dateTime(new Date(c.created_at), { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                  {f.number(c.amount_idr, { style: "currency", currency: "IDR", maximumFractionDigits: 0 })}
                </span>
              </span>
              <StatusBadge status={c.status} />
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{open?.user_email}</DialogTitle>
          </DialogHeader>
          {open && (
            <div className="space-y-3">
              <p className="num text-2xl">{f.number(open.amount_idr, { style: "currency", currency: "IDR", maximumFractionDigits: 0 })}</p>
              {open.note && <p className="rounded-lg bg-muted p-2 text-sm">{open.note}</p>}
              {img.data ? (
                <a href={img.data} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed private URL */}
                  <img src={img.data} alt={t("proof")} className="max-h-[50dvh] w-full rounded-xl object-contain" />
                </a>
              ) : (
                <div className="h-48 animate-pulse rounded-xl bg-muted" />
              )}
              {open.status === "pending" && (
                <NativeSelect label={t("grantDuration")} value={days} onChange={setDays}>
                  {[30, 90, 180, 365].map((d) => (
                    <option key={d} value={d}>
                      {t("days", { count: d })}
                    </option>
                  ))}
                  <option value="permanent">{t("permanent")}</option>
                </NativeSelect>
              )}
            </div>
          )}
          {open?.status === "pending" && (
            <DialogFooter className="flex-row gap-2">
              <Button variant="destructive" className="flex-1" disabled={review.isPending} onClick={() => review.mutate({ id: open.id, approve: false })}>
                <X aria-hidden /> {t("reject")}
              </Button>
              <Button className="flex-1" disabled={review.isPending} onClick={() => review.mutate({ id: open.id, approve: true })}>
                <Check aria-hidden /> {t("approve")}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusBadge({ status }: { status: PaymentConfirmation["status"] }) {
  const t = useTranslations("admin.status");
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
        status === "pending" && "bg-chart-3/20 text-chart-3",
        status === "approved" && "bg-primary text-primary-foreground",
        status === "rejected" && "bg-destructive/20 text-destructive",
      )}
    >
      {t(status)}
    </span>
  );
}

function Codes() {
  const t = useTranslations("admin");
  const f = useFormatter();
  const qc = useQueryClient();
  const [kind, setKind] = useState<PromoCode["kind"]>("temporary");
  const [days, setDays] = useState("30");
  const [maxUses, setMaxUses] = useState("1");
  const [note, setNote] = useState("");
  const list = useQuery({ queryKey: ["admin-codes"], queryFn: listPromoCodes });
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t("copied", { code }));
    } catch {}
  };
  const create = useMutation({
    mutationFn: () => createPromoCode({ kind, days: Number(days), maxUses: Math.max(1, Number(maxUses) || 1), note }),
    onSuccess: (code) => {
      void copy(code);
      setNote("");
      void qc.invalidateQueries({ queryKey: ["admin-codes"] });
    },
    onError: () => toast.error(t("failed")),
  });
  const toggle = useMutation({
    mutationFn: (c: PromoCode) => setPromoActive(c.code, !c.active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-codes"] }),
  });

  return (
    <div className="space-y-5">
      <Card className="space-y-3">
        <h2 className="flex items-center gap-2 font-bold uppercase">
          <KeyRound className="size-5 text-primary" aria-hidden /> {t("newCode")}
        </h2>
        <Segmented
          label={t("kind")}
          value={kind}
          onChange={setKind}
          options={[
            { value: "temporary", label: t("temporary") },
            { value: "permanent", label: t("permanent") },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          {kind === "temporary" && (
            <Field label={t("durationDays")} htmlFor="c-days">
              <Input id="c-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />
            </Field>
          )}
          <Field label={t("maxUses")} htmlFor="c-uses">
            <Input id="c-uses" inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ""))} />
          </Field>
        </div>
        <Field label={`${t("noteLabel")}`} htmlFor="c-note">
          <Input id="c-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} />
        </Field>
        <Button
          size="lg"
          className="w-full"
          disabled={create.isPending || (kind === "temporary" && !(Number(days) >= 1))}
          onClick={() => create.mutate()}
        >
          {t("generate")}
        </Button>
      </Card>

      <Section title={t("codes")}>
        {!list.data?.length ? (
          <EmptyState>{t("noCodes")}</EmptyState>
        ) : (
          <ul className="space-y-2">
            {list.data.map((c) => (
              <li key={c.code} className={cn("rounded-2xl border bg-card p-3", !c.active && "opacity-60")}>
                <div className="flex items-center gap-2">
                  <span className="num flex-1 text-xl tracking-wider">{c.code}</span>
                  <Button variant="ghost" size="icon" aria-label={t("copy")} onClick={() => copy(c.code)}>
                    <Copy />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {c.kind === "permanent" ? t("permanent") : t("days", { count: c.duration_days ?? 0 })} · {t("used", { used: c.used_count, max: c.max_uses })} ·{" "}
                  {f.dateTime(new Date(c.created_at), { dateStyle: "medium" })}
                  {c.note ? ` · ${c.note}` : ""}
                </p>
                <Button variant="ghost" size="sm" className="mt-1" onClick={() => toggle.mutate(c)}>
                  {c.active ? t("deactivate") : t("activate")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
