import { db, getMeta, setMeta } from "@/lib/db/local";

/** Persisted in IndexedDB so a reload or app switch doesn't lose the countdown. */
export interface RestTimer {
  endsAt: number; // epoch ms
  durationSec: number;
  label: string;
}

const KEY = "restTimer";

export async function startRest(durationSec: number, label: string) {
  if (durationSec <= 0) return stopRest();
  await setMeta(KEY, { endsAt: Date.now() + durationSec * 1000, durationSec, label } satisfies RestTimer);
}

export async function adjustRest(deltaSec: number) {
  const cur = await getMeta<RestTimer | null>(KEY);
  if (!cur) return;
  const endsAt = Math.max(Date.now(), cur.endsAt + deltaSec * 1000);
  await setMeta(KEY, { ...cur, endsAt, durationSec: Math.max(0, cur.durationSec + deltaSec) });
}

export async function stopRest() {
  await db.meta.delete(KEY);
}

export const REST_TIMER_KEY = KEY;

/** Short haptic + optional system notification; both are best-effort. */
export async function notifyRestDone(title: string, body: string) {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {}
  try {
    beep();
  } catch {}
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, tag: "rest-timer", icon: "/icons/192" });
    else new Notification(title, { body, tag: "rest-timer" });
  } catch {}
}

let ctx: AudioContext | null = null;
function beep() {
  ctx ??= new AudioContext();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = 880;
  g.gain.setValueAtTime(0.15, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + 0.4);
}
