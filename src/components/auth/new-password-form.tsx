"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Field } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabase } from "@/lib/supabase/client";

/** Set a new password for the signed-in user (reset link or profile). */
export function NewPasswordForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("auth");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooShort = pw.length > 0 && pw.length < 8;
  const mismatch = confirm.length > 0 && confirm !== pw;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8 || pw !== confirm) return;
    setBusy(true);
    setError(null);
    const { error } = await (await getSupabase()).auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setError(error.code === "same_password" ? t("samePassword") : t("passwordChangeFailed"));
    setPw("");
    setConfirm("");
    onDone();
  };

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <Field label={t("newPassword")} htmlFor="new-pw" hint={t("passwordHint")} error={tooShort && t("passwordHint")}>
        <Input id="new-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} aria-invalid={tooShort} />
      </Field>
      <Field label={t("confirmPassword")} htmlFor="confirm-pw" error={mismatch && t("passwordMismatch")}>
        <Input id="confirm-pw" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="xl" className="w-full" disabled={busy || pw.length < 8 || pw !== confirm}>
        {t("savePassword")}
      </Button>
    </form>
  );
}
