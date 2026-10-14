import { db, getMeta, setMeta } from "@/lib/db/local";
import { cancelRestPush, scheduleRestPush } from "@/lib/push";

/** Persisted in IndexedDB so a reload or app switch doesn't lose the countdown. */
export interface RestTimer {
  endsAt: number; // epoch ms
  durationSec: number;
  label: string;
  /** Localised text for the background push alert. */
  push?: { title: string; body: string };
}

const KEY = "restTimer";

export async function startRest(durationSec: number, label: string, push?: RestTimer["push"]) {
  if (durationSec <= 0) return stopRest();
  const endsAt = Date.now() + durationSec * 1000;
  await setMeta(KEY, { endsAt, durationSec, label, push } satisfies RestTimer);
  if (push) void scheduleRestPush(endsAt, push.title, push.body);
}

export async function adjustRest(deltaSec: number) {
  const cur = await getMeta<RestTimer | null>(KEY);
  if (!cur) return;
  const endsAt = Math.max(Date.now(), cur.endsAt + deltaSec * 1000);
  await setMeta(KEY, { ...cur, endsAt, durationSec: Math.max(0, cur.durationSec + deltaSec) });
  if (cur.push) void scheduleRestPush(endsAt, cur.push.title, cur.push.body);
}

export async function stopRest() {
  const cur = await getMeta<RestTimer | null>(KEY);
  await db.meta.delete(KEY);
  if (cur?.push && cur.endsAt > Date.now()) void cancelRestPush();
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
