"use client";

import { Dumbbell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LinkButton } from "@/components/common";
import { useAuth } from "@/components/providers/auth-provider";

/**
 * OAuth / magic-link landing. supabase-js exchanges the PKCE `code` from the
 * URL on its own (detectSessionInUrl); we just wait for the session.
 */
export default function AuthCallbackPage() {
  const t = useTranslations("auth");
  const { status } = useAuth();
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search + window.location.hash.replace("#", "&"));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the URL once on mount
    if (params.get("error") || params.get("error_description")) setFailed(true);
  }, []);

  useEffect(() => {
    if (status === "signed_in") router.replace("/home");
    if (status !== "signed_out") return;
    // Give the code exchange a moment before declaring failure.
    const id = setTimeout(() => setFailed(true), 6000);
    return () => clearTimeout(id);
  }, [status, router]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <Dumbbell className="size-10 text-primary" aria-hidden />
      {failed ? (
        <>
          <p role="alert">{t("callbackError")}</p>
          <LinkButton href="/login">{t("signIn")}</LinkButton>
        </>
      ) : (
        <p role="status">{t("processing")}</p>
      )}
    </main>
  );
}
