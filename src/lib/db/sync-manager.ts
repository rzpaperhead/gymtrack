"use client";

import { useSyncExternalStore } from "react";
import { db } from "@/lib/db/local";
import { isSyncEnabled } from "@/lib/db/session";
import { pull, push, type Remote } from "@/lib/db/sync";
import { onLocalWrite } from "@/lib/db/write";

export type SyncState = "idle" | "syncing" | "offline" | "error" | "disabled";

interface Status {
  state: SyncState;
  pending: number;
  failed: number;
  lastSyncedAt: number | null;
}

let status: Status = { state: "disabled", pending: 0, failed: 0, lastSyncedAt: null };
const subs = new Set<() => void>();

function set(patch: Partial<Status>) {
  status = { ...status, ...patch };
  subs.forEach((s) => s());
}

export function useSyncStatus(): Status {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => status,
    () => status,
  );
}

let remote: Remote | null = null;
let running: Promise<void> | null = null;
let again = false;
let debounce: ReturnType<typeof setTimeout> | null = null;
let teardown: (() => void) | null = null;

async function refreshCounts() {
  const all = await db.outbox.toArray();
  set({ pending: all.filter((i) => !i.error).length, failed: all.filter((i) => i.error).length });
}

/** Run one push+pull cycle; concurrent calls coalesce into one follow-up run. */
export function syncNow(): Promise<void> {
  if (!remote || !isSyncEnabled()) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        set({ state: "offline" });
        break;
      }
      set({ state: "syncing" });
      try {
        const p = await push(remote!);
        if (p.networkError) {
          set({ state: navigator.onLine ? "error" : "offline" });
          break;
        }
        const r = await pull(remote!);
        set({ state: r.error ? "error" : "idle", lastSyncedAt: r.error ? status.lastSyncedAt : Date.now() });
      } catch {
        set({ state: navigator.onLine ? "error" : "offline" });
        break;
      } finally {
        await refreshCounts();
      }
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Start background sync for a signed-in user. Returns a stop function. */
export function startSync(r: Remote): () => void {
  stopSync();
  remote = r;
  const schedule = () => {
    refreshCounts();
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => void syncNow(), 1500);
  };
  const offWrite = onLocalWrite(schedule);
  const onOnline = () => void syncNow();
  const onOffline = () => set({ state: "offline" });
  const onVisible = () => {
    if (document.visibilityState === "visible") void syncNow();
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  const interval = setInterval(() => void syncNow(), 60_000);
  set({ state: "idle" });
  void syncNow();
  teardown = () => {
    offWrite();
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
    clearInterval(interval);
    if (debounce) clearTimeout(debounce);
  };
  return stopSync;
}

export function stopSync() {
  teardown?.();
  teardown = null;
  remote = null;
  set({ state: "disabled" });
}
