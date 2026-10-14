import { NextResponse } from "next/server";
import { cronAuthorized, pushConfigured, sendPush, type PushMessage } from "@/lib/push-server";
import { adminClient } from "@/lib/supabase/server";

/** Local date, weekday (0 = Sun) and minutes-since-midnight in a time zone. */
function localNow(tz: string, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/**
 * Daily workout reminders. Called every minute by a Supabase cron job.
 * Sends once per local day, within 30 minutes after the chosen time.
 */
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: "push_not_configured" }, { status: 503 });
  const db = adminClient();
  const { data: reminders } = await db.from("workout_reminders").select("*").eq("enabled", true).limit(5000);

  const due: { user_id: string; date: string; weekday: number }[] = [];
  for (const r of reminders ?? []) {
    let local;
    try {
      local = localNow(r.timezone);
    } catch {
      local = localNow("Asia/Jakarta");
    }
    const [h, m] = (r.time_local as string).split(":").map(Number);
    const target = h * 60 + m;
    if (!r.weekdays.includes(local.weekday)) continue;
    if (r.last_sent_date === local.date) continue;
    if (local.minutes < target || local.minutes > target + 30) continue;
    due.push({ user_id: r.user_id, date: local.date, weekday: local.weekday });
  }
  if (!due.length) return NextResponse.json({ sent: 0 });

  const ids = due.map((d) => d.user_id);
  // Mark first so an overlapping run can't double-send.
  for (const d of due) await db.from("workout_reminders").update({ last_sent_date: d.date }).eq("user_id", d.user_id);

  const [{ data: profiles }, { data: programs }] = await Promise.all([
    db.from("profiles").select("id, locale, display_name").in("id", ids),
    db.from("programs").select("id, user_id").in("user_id", ids).eq("is_active", true).is("deleted_at", null),
  ]);
  const programIds = (programs ?? []).map((p) => p.id);
  const { data: days } = programIds.length
    ? await db.from("program_days").select("program_id, weekday, template_id").in("program_id", programIds).is("deleted_at", null)
    : { data: [] };
  const templateIds = [...new Set((days ?? []).map((d) => d.template_id))];
  const { data: templates } = templateIds.length
    ? await db.from("templates").select("id, name, name_en").in("id", templateIds)
    : { data: [] };

  const messages = new Map<string, PushMessage>();
  for (const d of due) {
    const p = profiles?.find((x) => x.id === d.user_id);
    const en = p?.locale === "en";
    const prog = programs?.find((x) => x.user_id === d.user_id);
    const day = prog && days?.find((x) => x.program_id === prog.id && x.weekday === d.weekday);
    const tpl = day && templates?.find((x) => x.id === day.template_id);
    const tplName = tpl ? (en && tpl.name_en ? tpl.name_en : tpl.name) : null;
    const name = p?.display_name ? (en ? `, ${p.display_name}` : ` ${p.display_name}`) : "";
    messages.set(d.user_id, {
      title: en ? `Time to train${name}! 💪` : `Waktunya latihan${name}! 💪`,
      body: tplName
        ? en
          ? `Today's plan: ${tplName}. Tap to start.`
          : `Jadwal hari ini: ${tplName}. Tap untuk mulai.`
        : en
          ? "Keep your streak going — tap to start a workout."
          : "Jaga streak-mu — tap untuk mulai latihan.",
      tag: "reminder",
      url: "/home",
    });
  }
  return NextResponse.json({ sent: await sendPush(db, messages) });
}
