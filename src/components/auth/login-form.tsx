"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Dumbbell, MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Field } from "@/components/common";
import { LanguageSwitch } from "@/components/language-switch";
import { startDemo, startGuest, useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabase } from "@/lib/supabase/client";

const passwordSchema = z.object({ email: z.email(), password: z.string().min(8) });

/** Google sign-in stays hidden until the provider is enabled in Supabase. */
const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_AUTH_GOOGLE === "1";

function redirectTo() {
  return `${window.location.origin}/auth/callback`;
}

export function LoginForm() {
  const t = useTranslations("auth");
  const { status, mode, guest } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "signed_in" && !guest) router.replace("/home");
  }, [status, guest, router]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary">
          <Dumbbell className="size-8" aria-hidden />
          <span className="font-[family-name:var(--font-display)] text-2xl font-extrabold uppercase text-foreground">GymTrack</span>
        </div>
        <LanguageSwitch />
      </div>
      <div>
        <h1 className="text-4xl font-extrabold uppercase">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>

      {mode === "demo" ? (
        <div className="space-y-4">
          <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">{t("notConfigured")}</p>
          <Button size="xl" className="w-full" onClick={() => startDemo()}>
            {t("continueDemo")}
          </Button>
        </div>
      ) : (
        <>
          {GOOGLE_ENABLED && (
            <>
              <GoogleButton />
              <div className="flex items-center gap-3 text-xs uppercase text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                {t("or")}
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}
          <PasswordForm />
          {!guest && (
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                startGuest();
                router.push("/home");
              }}
            >
              {t("tryGuest")}
            </Button>
          )}
          {guest && <p className="text-center text-sm text-muted-foreground">{t("guestWillMove")}</p>}
        </>
      )}
    </main>
  );
}

function GoogleButton() {
  const t = useTranslations("auth");
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="lg"
      className="w-full"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const { error } = await (await getSupabase()).auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
        if (error) setBusy(false);
      }}
    >
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z" />
      </svg>
      {t("google")}
    </Button>
  );
}

function PasswordForm() {
  const t = useTranslations("auth");
  const [signUp, setSignUp] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = form.handleSubmit(async ({ email, password }) => {
    setMessage(null);
    const sb = await getSupabase();
    if (signUp) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
      if (error) return setMessage(error.message);
      if (!data.session) {
        setSentTo(email);
        return;
      }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.code === "email_not_confirmed" ? t("notConfirmed") : t("invalidCredentials"));
    }
  });

  if (sentTo) {
    return (
      <div role="status" className="space-y-4 rounded-2xl border bg-card p-5 text-center">
        <MailCheck className="mx-auto size-10 text-primary" aria-hidden />
        <p className="text-lg font-bold">{t("confirmSentTitle")}</p>
        <p className="text-sm text-muted-foreground">{t("confirmSentBody", { email: sentTo })}</p>
        <button
          type="button"
          className="min-h-11 font-semibold text-primary"
          onClick={() => {
            setSentTo(null);
            setSignUp(false);
          }}
        >
          {t("backToSignIn")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label={t("email")} htmlFor="email" error={form.formState.errors.email && " "}>
        <Input id="email" type="email" autoComplete="email" inputMode="email" {...form.register("email")} aria-invalid={!!form.formState.errors.email} />
      </Field>
      <Field label={t("password")} htmlFor="password" hint={t("passwordHint")} error={form.formState.errors.password && t("passwordHint")}>
        <Input
          id="password"
          type="password"
          autoComplete={signUp ? "new-password" : "current-password"}
          {...form.register("password")}
          aria-invalid={!!form.formState.errors.password}
        />
      </Field>
      {message && (
        <p role="alert" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
      <Button type="submit" size="xl" className="w-full" disabled={form.formState.isSubmitting}>
        {signUp ? t("signUp") : t("signIn")}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {signUp ? t("haveAccount") : t("noAccount")}{" "}
        <button type="button" className="min-h-11 font-semibold text-primary underline-offset-4 hover:underline" onClick={() => setSignUp(!signUp)}>
          {signUp ? t("signIn") : t("signUp")}
        </button>
      </p>
    </form>
  );
}
