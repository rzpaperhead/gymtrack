import { NextResponse } from "next/server";
import { cronAuthorized, pushConfigured, sendPush, type PushMessage } from "@/lib/push-server";
import { adminClient } from "@/lib/supabase/server";

/**
 * Sends rest-timer alerts that are due. Called every few seconds by a Supabase
 * cron job (see supabase/setup/push-cron.sql), authenticated with CRON_SECRET.
 */
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: "push_not_configured" }, { status: 503 });

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
  const messages = new Map<string, PushMessage>(
    due.map((d) => [d.user_id, { title: d.title, body: d.body, tag: "rest-timer", url: "/workout/active" }]),
  );
  return NextResponse.json({ sent: await sendPush(db, messages) });
}
