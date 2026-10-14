"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { useAuth, useProfile } from "@/components/providers/auth-provider";
import { alive, db } from "@/lib/db/local";
import { entitlementsFor, tierOf, type Entitlements } from "@/lib/entitlements";
import type { Unit, Workout } from "@/lib/types";

export function useUnit(): Unit {
  return useProfile()?.unit ?? "kg";
}

/** Cached result of the server's is_admin() check (refreshed on sign-in). */
export function useIsAdmin(): boolean {
  const { userId } = useAuth();
  return useLiveQuery(async () => (userId ? (await db.meta.get("isAdmin"))?.value === true : false), [userId]) ?? false;
}

export function useEntitlements(): Entitlements {
  const { userId } = useAuth();
  const admin = useIsAdmin();
  const sub = useLiveQuery(async () => (userId ? db.subscriptions.get(userId) : undefined), [userId]);
  return entitlementsFor(admin ? "premium" : tierOf(sub));
}

/** Re-renders every `ms` (for timers). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function useActiveWorkout(): Workout | null | undefined {
  const { ready } = useAuth();
  return useLiveQuery(async () => {
    if (!ready) return undefined;
    const list = (await db.workouts.where("status").equals("in_progress").toArray()).filter(alive);
    return list.sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null;
  }, [ready]);
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}
