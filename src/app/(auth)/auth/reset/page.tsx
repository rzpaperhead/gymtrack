"use client";

import { Dumbbell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LinkButton } from "@/components/common";
import { NewPasswordForm } from "@/components/auth/new-password-form";
import { useAuth } from "@/components/providers/auth-provider";

/**
 * Landing page of the "reset password" email. supabase-js exchanges the code
 * in the URL for a short session, then the user picks a new password.
 */
export default function ResetPasswordPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const { status, guest } = useAuth();
  const [expired, setExpired] = useState(false);
  const signedIn = status === "signed_in" && !guest;

  useEffect(() => {
    if (signedIn) return;
    const params = new URLSearchParams(window.location.search + window.location.hash.replace("#", "&"));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the URL once on mount
    if (params.get("error") || params.get("error_description")) setExpired(true);
    const id = setTimeout(() => setExpired(true), 8000);
    return () => clearTimeout(id);
  }, [signedIn]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <Dumbbell className="size-10 text-primary" aria-hidden />
      <h1 className="text-4xl font-extrabold uppercase">{t("newPasswordTitle")}</h1>
      {signedIn ? (
        <NewPasswordForm
          onDone={() => {
            toast.success(t("passwordChanged"));
            router.replace("/home");
          }}
        />
      ) : expired ? (
        <div className="space-y-4">
          <p role="alert" className="text-muted-foreground">
            {t("resetLinkExpired")}
          </p>
          <LinkButton href="/login" size="lg" className="w-full">
            {t("backToSignIn")}
          </LinkButton>
        </div>
      ) : (
        <p role="status" className="text-muted-foreground">
          {t("processing")}
        </p>
      )}
    </main>
  );
}
