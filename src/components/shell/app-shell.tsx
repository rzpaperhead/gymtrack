"use client";

import { Dumbbell, House, LineChart, Scale, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { useAuth, useProfile } from "@/components/providers/auth-provider";
import { ActiveWorkoutBar } from "@/components/shell/active-workout-bar";
import { RestTimerBar } from "@/components/shell/rest-timer-bar";
import { useOnline } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/home", key: "home", icon: House },
  { href: "/workout", key: "workout", icon: Dumbbell },
  { href: "/progress", key: "progress", icon: LineChart },
  { href: "/body", key: "body", icon: Scale },
  { href: "/profile", key: "profile", icon: User },
] as const;

/** Redirects to login/onboarding and renders nothing until the user's data is ready. */
function useGate(): boolean {
  const { status, ready } = useAuth();
  const profile = useProfile();
  const router = useRouter();
  const needsOnboarding = ready && profile !== undefined && !profile?.onboarded_at;
  useEffect(() => {
    if (status === "signed_out") router.replace("/login");
    else if (needsOnboarding) router.replace("/onboarding");
  }, [status, needsOnboarding, router]);
  return status === "signed_in" && ready && !!profile?.onboarded_at;
}

export function AppShell({ children }: { children: ReactNode }) {
  const ok = useGate();
  const pathname = usePathname();
  const t = useTranslations();
  const online = useOnline();
  const { mode } = useAuth();
  const inSession = pathname.startsWith("/workout/active");

  if (!ok) {
    return (
      <div className="flex min-h-dvh items-center justify-center" aria-busy="true">
        <Dumbbell className="size-10 animate-pulse text-primary" aria-label={t("common.loading")} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        {t("common.skipToContent")}
      </a>
      {!online && (
        <div role="status" className="pt-safe bg-secondary px-4 py-1.5 text-center text-xs text-secondary-foreground">
          {t("common.offline")}
        </div>
      )}
      {mode === "demo" && online && (
        <div role="note" className="pt-safe bg-accent px-4 py-1 text-center text-xs text-accent-foreground">
          {t("common.demoMode")}
        </div>
      )}
      <main id="main" className="flex-1 px-4 pb-44">
        {children}
      </main>
      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl">
        <RestTimerBar />
        {!inSession && <ActiveWorkoutBar />}
        <nav aria-label={t("nav.main")} className="border-t bg-background/95 backdrop-blur">
          <ul className="grid grid-cols-5">
            {NAV.map(({ href, key, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`) || (href === "/workout" && pathname.startsWith("/exercises"));
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold outline-none focus-visible:bg-muted",
                      active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-6" aria-hidden strokeWidth={active ? 2.5 : 2} />
                    {t(`nav.${key}`)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
