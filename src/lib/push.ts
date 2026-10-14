import { isSyncEnabled } from "@/lib/db/session";
import { getSupabase } from "@/lib/supabase/client";

/**
 * Background rest alerts via Web Push. Browsers freeze backgrounded web apps,
 * so the server sends the "rest is over" notification instead of the page.
 * Everything here is best-effort: the in-app timer still works without it.
 */

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && !!VAPID;

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Subscribe this device (needs notification permission) and store it server-side. */
export async function ensurePushSubscription(): Promise<boolean> {
  if (!pushSupported() || !isSyncEnabled() || Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID!) }));
    const json = sub.toJSON();
    const { error } = await (await getSupabase())
      .from("push_subscriptions")
      .upsert({ endpoint: sub.endpoint, p256dh: json.keys!.p256dh, auth: json.keys!.auth }, { onConflict: "endpoint" });
    return !error;
  } catch {
    return false;
  }
}

export async function scheduleRestPush(endsAt: number, title: string, body: string) {
  if (!pushSupported() || !isSyncEnabled() || !navigator.onLine) return;
  try {
    await (await getSupabase()).rpc("schedule_rest_push", { p_send_at: new Date(endsAt).toISOString(), p_title: title, p_body: body });
  } catch {}
}

export async function cancelRestPush() {
  if (!pushSupported() || !isSyncEnabled() || !navigator.onLine) return;
  try {
    await (await getSupabase()).rpc("cancel_rest_push");
  } catch {}
}
