import { NextResponse } from "next/server";
import { z } from "zod";
import { escapeHtml, sendEmail } from "@/lib/push-server";
import { adminClient, userFromRequest } from "@/lib/supabase/server";

const body = z.object({ id: z.uuid() });

/** Emails the admin when a user submits a transfer proof (via Brevo, if configured). */
export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  if (!process.env.BREVO_API_KEY) return NextResponse.json({ skipped: "email_not_configured" });

  const db = adminClient();
  const { data: pc } = await db.from("payment_confirmations").select("*").eq("id", parsed.data.id).maybeSingle();
  // Only the owner may trigger it, and only for a fresh pending proof (no spam relays).
  if (!pc || pc.user_id !== user.id || pc.status !== "pending" || Date.now() - Date.parse(pc.created_at) > 10 * 60_000) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const to = process.env.ADMIN_NOTIFY_EMAIL ?? "rzpaperhead@gmail.com";
  const amount = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(pc.amount_idr);
  const sent = await sendEmail(
    to,
    `Konfirmasi pembayaran baru: ${amount} dari ${pc.user_email ?? "user"}`,
    `<p>Ada konfirmasi pembayaran baru.</p>
     <p><b>User:</b> ${escapeHtml(pc.user_email ?? pc.user_id)}<br><b>Nominal:</b> ${amount}<br>
     <b>Catatan:</b> ${escapeHtml(pc.note ?? "-")}</p>
     <p><a href="${site}/admin">Buka halaman Admin untuk mengecek bukti transfer</a></p>`,
  );
  return NextResponse.json({ sent });
}
