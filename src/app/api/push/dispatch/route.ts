import { NextResponse } from "next/server";
import { cronAuthorized, pushConfigured, sendPushList, type PushMessage } from "@/lib/push-server";
import { socialMessage, type SocialKind } from "@/lib/social-messages";
import { adminClient } from "@/lib/supabase/server";

/**
 * Sends due rest-timer alerts and queued social notifications. Called every
 * few seconds by a Supabase cron job (supabase/setup/push-cron.sql).
 */
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: "push_not_configured" }, { status: 503 });

  const db = adminClient();
  const items: { user_id: string; message: PushMessage }[] = [];

  // Rest timers
  const { data: due } = await db
    .from("scheduled_pushes")
    .select("*")
    .lte("send_at", new Date(Date.now() + 3000).toISOString())
    .limit(200);
  if (due?.length) {
    // Claim first so an overlapping run can't send twice.
    await db.from("scheduled_pushes").delete().in("user_id", due.map((d) => d.user_id));
    for (const d of due) items.push({ user_id: d.user_id, message: { title: d.title, body: d.body, tag: "rest-timer", url: "/workout/active" } });
  }

  // Social notifications
  const { data: queued } = await db.from("notifications_outbox").select("*").is("sent_at", null).order("created_at").limit(200);
  if (queued?.length) {
    await db.from("notifications_outbox").update({ sent_at: new Date().toISOString() }).in("id", queued.map((q) => q.id));
    const { data: profiles } = await db.from("profiles").select("id, locale").in("id", [...new Set(queued.map((q) => q.user_id))]);
    for (const q of queued) {
      const locale = profiles?.find((p) => p.id === q.user_id)?.locale;
      items.push({ user_id: q.user_id, message: socialMessage(q.kind as SocialKind, q.payload ?? {}, locale) });
    }
  }

  return NextResponse.json({ sent: await sendPushList(db, items) });
}
