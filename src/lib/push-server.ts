import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PushMessage {
  title: string;
  body: string;
  tag: string;
  url: string;
}

let configured = false;

export function pushConfigured(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!configured) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", pub, priv);
    configured = true;
  }
  return true;
}

/** Send to every device of the given users; prunes expired subscriptions. */
export async function sendPush(db: SupabaseClient, messages: Map<string, PushMessage>): Promise<number> {
  if (!pushConfigured() || !messages.size) return 0;
  const { data: subs } = await db.from("push_subscriptions").select("*").in("user_id", [...messages.keys()]);
  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    (subs ?? []).map(async (s) => {
      const m = messages.get(s.user_id)!;
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(m), {
          TTL: 3600,
          urgency: "high",
        });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.endpoint);
      }
    }),
  );
  if (dead.length) await db.from("push_subscriptions").delete().in("endpoint", dead);
  return sent;
}

/** Transactional email via Brevo. No-op when not configured. */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return false;
  const sender = process.env.BREVO_SENDER_EMAIL ?? process.env.ADMIN_NOTIFY_EMAIL ?? "rzpaperhead@gmail.com";
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender: { name: "GymTrack", email: sender }, to: [{ email: to }], subject, htmlContent: html }),
  });
  return res.ok;
}

export const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}
