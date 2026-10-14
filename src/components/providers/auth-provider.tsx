"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useTheme } from "next-themes";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSetLocale } from "@/components/providers/i18n-provider";
import { identify } from "@/lib/analytics";
import { defaultProfile } from "@/lib/data/profile";
import { uploadPendingPhotos } from "@/lib/data/photos";
import { fetchIsAdmin } from "@/lib/data/premium";
import { clearLocalData, db, getMeta, setMeta } from "@/lib/db/local";
import { migrateGuestData } from "@/lib/db/migrate-guest";
import { DEMO_USER_ID, newId, setSessionUser } from "@/lib/db/session";
import { startSync, stopSync, syncNow } from "@/lib/db/sync-manager";
import { supabaseRemote } from "@/lib/db/sync";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

type Status = "loading" | "signed_out" | "signed_in";

interface AuthValue {
  status: Status;
  mode: "demo" | "supabase";
  userId: string | null;
  email: string | null;
  /** True once local data for this user is ready to read (first pull done or skipped). */
  ready: boolean;
  /** Trying the app without an account (Supabase configured, data local only). */
  guest: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

/** The signed-in user's profile (undefined while loading, null if missing). */
export function useProfile(): Profile | null | undefined {
  const { userId, ready } = useAuth();
  return useLiveQuery(async () => (userId && ready ? ((await db.profiles.get(userId)) ?? null) : undefined), [userId, ready]);
}

const DEMO_FLAG = "gt-demo";
const GUEST_KEY = "gt-guest";

function readGuestId(): string | null {
  try {
    return localStorage.getItem(GUEST_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const mode = supabaseConfigured ? "supabase" : "demo";
  const [status, setStatus] = useState<Status>("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [guest, setGuest] = useState(false);
  const activeUser = useRef<string | null>(null);

  const activate = useCallback(async (id: string, mail: string | null, sync: boolean) => {
    if (activeUser.current === id) return;
    activeUser.current = id;
    const previous = await getMeta<string>("userId");
    const guestId = readGuestId();
    setSessionUser(id, { sync });
    if (previous && previous !== id) {
      if (sync && guestId && previous === guestId) {
        // A guest just signed in / up: keep everything they logged.
        await migrateGuestData(guestId, id);
        try {
          localStorage.removeItem(GUEST_KEY);
        } catch {}
      } else {
        // Another account used this device before: never mix their data in.
        await clearLocalData();
      }
    }
    await setMeta("userId", id);
    setGuest(!sync && id === guestId);
    setUserId(id);
    setEmail(mail);
    setStatus("signed_in");
    identify(id);
    if (sync) {
      startSync(supabaseRemote(await getSupabase()));
      const hasProfile = !!(await db.profiles.get(id));
      if (!hasProfile && navigator.onLine) {
        // First sign-in on this device: wait (briefly) for the initial pull.
        await Promise.race([syncNow(), new Promise((r) => setTimeout(r, 8000))]);
      }
      void uploadPendingPhotos();
    } else if (!(await db.profiles.get(id))) {
      await db.profiles.put(defaultProfile(id));
    }
    setReady(true);
  }, []);

  // Re-check admin status whenever the app starts or comes back to the front,
  // so a role granted on the server shows up without signing out.
  useEffect(() => {
    if (mode !== "supabase" || status !== "signed_in" || !ready || guest) return;
    const check = () => {
      if (navigator.onLine && document.visibilityState === "visible") void fetchIsAdmin().catch(() => {});
    };
    check();
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", check);
    };
  }, [mode, status, ready, userId, guest]);

  const deactivate = useCallback(() => {
    activeUser.current = null;
    stopSync();
    setSessionUser(null, { sync: false });
    setUserId(null);
    setEmail(null);
    setReady(false);
    setStatus("signed_out");
  }, []);

  useEffect(() => {
    if (mode === "demo") {
      let demo = false;
      try {
        demo = localStorage.getItem(DEMO_FLAG) === "1";
      } catch {}
      if (demo) void activate(DEMO_USER_ID, null, false);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- auth state is only knowable on the client
      else setStatus("signed_out");
      const onDemo = () => void activate(DEMO_USER_ID, null, false);
      window.addEventListener("gt-demo-start", onDemo);
      return () => window.removeEventListener("gt-demo-start", onDemo);
    }
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void getSupabase().then((sb) => {
      if (cancelled) return;
      sb.auth.getSession().then(({ data }) => {
        const guestId = readGuestId();
        if (data.session) void activate(data.session.user.id, data.session.user.email ?? null, true);
        else if (guestId) void activate(guestId, null, false);
        else setStatus("signed_out");
      });
      const onGuest = () => {
        const id = readGuestId();
        if (id) void activate(id, null, false);
      };
      window.addEventListener("gt-guest-start", onGuest);
      const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
        if (session?.user) void activate(session.user.id, session.user.email ?? null, true);
        else if (event === "SIGNED_OUT" && !readGuestId()) deactivate();
      });
      unsubscribe = () => {
        sub.subscription.unsubscribe();
        window.removeEventListener("gt-guest-start", onGuest);
      };
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [mode, activate, deactivate]);

  const signOut = useCallback(async () => {
    if (guest) {
      try {
        localStorage.removeItem(GUEST_KEY);
      } catch {}
    } else if (mode === "supabase") {
      stopSync();
      await (await getSupabase()).auth.signOut();
    } else {
      try {
        localStorage.removeItem(DEMO_FLAG);
      } catch {}
    }
    await clearLocalData();
    deactivate();
  }, [mode, guest, deactivate]);

  const value = useMemo(() => ({ status, mode, userId, email, ready, guest, signOut }) as AuthValue, [status, mode, userId, email, ready, guest, signOut]);

  return (
    <AuthContext.Provider value={value}>
      <ProfilePreferences />
      {children}
    </AuthContext.Provider>
  );
}

/** Try the app without an account; data migrates on sign-up. */
export function startGuest() {
  try {
    if (!localStorage.getItem(GUEST_KEY)) localStorage.setItem(GUEST_KEY, newId());
  } catch {}
  window.dispatchEvent(new Event("gt-guest-start"));
}

/** Start demo mode (no Supabase configured). */
export function startDemo() {
  try {
    localStorage.setItem(DEMO_FLAG, "1");
  } catch {}
  window.dispatchEvent(new Event("gt-demo-start"));
}

/** Keep theme and language in step with the (synced) profile. */
function ProfilePreferences() {
  const ctx = useContext(AuthContext)!;
  const profile = useLiveQuery(async () => (ctx.userId ? db.profiles.get(ctx.userId) : undefined), [ctx.userId]);
  const { setTheme } = useTheme();
  const { locale, setLocale } = useSetLocale();
  useEffect(() => {
    if (!profile) return;
    setTheme(profile.theme);
    if (profile.locale !== locale) setLocale(profile.locale);
    // Only react to profile changes; a local language switch writes the profile too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.theme, profile?.locale]);
  return null;
}
