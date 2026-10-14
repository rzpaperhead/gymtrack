import { NextResponse } from "next/server";
import webpush from "web-push";
import { adminClient } from "@/lib/supabase/server";

/**
 * Sends rest-timer alerts that are due. Called every few seconds by a Supabase
 * cron job (see supabase/setup/push-cron.sql), authenticated with CRON_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return NextResponse.json({ error: "push_not_configured" }, { status: 503 });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", pub, priv);

  const db = adminClient();
  const { data: due, error } = await db
    .from("scheduled_pushes")
    .select("*")
    .lte("send_at", new Date(Date.now() + 3000).toISOString())
    .limit(200);
  if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });
  if (!due?.length) return NextResponse.json({ sent: 0 });

  // Claim them first so an overlapping run can't send twice.
  await db.from("scheduled_pushes").delete().in("user_id", due.map((d) => d.user_id));
  const { data: subs } = await db.from("push_subscriptions").select("*").in("user_id", due.map((d) => d.user_id));

  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    (subs ?? []).map(async (s) => {
      const p = due.find((d) => d.user_id === s.user_id)!;
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: p.title, body: p.body, tag: "rest-timer", url: "/workout/active" }),
          { TTL: 120, urgency: "high" },
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.endpoint);
      }
    }),
  );
  if (dead.length) await db.from("push_subscriptions").delete().in("endpoint", dead);
  return NextResponse.json({ sent, removed: dead.length });
}
