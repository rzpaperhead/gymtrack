import { NextResponse } from "next/server";
import { z } from "zod";
import { escapeHtml, sendEmail, sendPush } from "@/lib/push-server";
import { adminClient, userFromRequest } from "@/lib/supabase/server";

const body = z.object({ id: z.uuid() });

const TEXT = {
  id: {
    approved: { title: "Premium aktif! 🎉", body: "Pembayaranmu sudah dikonfirmasi. Semua fitur Premium sekarang terbuka." },
    rejected: { title: "Pembayaran belum bisa dikonfirmasi", body: "Bukti transfermu belum sesuai. Cek nominal & kirim ulang dari halaman Premium." },
  },
  en: {
    approved: { title: "Premium is active! 🎉", body: "Your payment is confirmed. Every Premium feature is now unlocked." },
    rejected: { title: "We couldn't confirm your payment", body: "Your transfer proof didn't match. Check the amount and resend it from the Premium page." },
  },
} as const;

/** Tell a user their payment was approved/rejected (push + email). Admin only. */
export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const db = adminClient();
  const { data: admin } = await db.from("app_admins").select("email").ilike("email", user.email).maybeSingle();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data: pc } = await db.from("payment_confirmations").select("*").eq("id", parsed.data.id).maybeSingle();
  if (!pc || pc.status === "pending" || !pc.reviewed_at || Date.now() - Date.parse(pc.reviewed_at) > 10 * 60_000) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { data: profile } = await db.from("profiles").select("locale").eq("id", pc.user_id).maybeSingle();
  const lang = profile?.locale === "en" ? "en" : "id";
  const msg = TEXT[lang][pc.status as "approved" | "rejected"];

  const pushed = await sendPush(db, new Map([[pc.user_id, { ...msg, tag: "payment", url: "/premium" }]]));
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const emailed = pc.user_email
    ? await sendEmail(pc.user_email, msg.title, `<p>${escapeHtml(msg.body)}</p><p><a href="${site}/premium">GymTrack</a></p>`)
    : false;
  return NextResponse.json({ pushed, emailed });
}
