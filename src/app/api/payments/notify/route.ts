import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient, userFromRequest } from "@/lib/supabase/server";

const body = z.object({ id: z.uuid() });

/** Emails the admin when a user submits a transfer proof (via Brevo, if configured). */
export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return NextResponse.json({ skipped: "email_not_configured" });

  const db = adminClient();
  const { data: pc } = await db.from("payment_confirmations").select("*").eq("id", parsed.data.id).maybeSingle();
  // Only the owner may trigger it, and only for a fresh pending proof (no spam relays).
  if (!pc || pc.user_id !== user.id || pc.status !== "pending" || Date.now() - Date.parse(pc.created_at) > 10 * 60_000) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const to = process.env.ADMIN_NOTIFY_EMAIL ?? "rzpaperhead@gmail.com";
  const amount = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(pc.amount_idr);
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "GymTrack", email: process.env.BREVO_SENDER_EMAIL ?? to },
      to: [{ email: to }],
      subject: `Konfirmasi pembayaran baru: ${amount} dari ${pc.user_email ?? "user"}`,
      htmlContent: `<p>Ada konfirmasi pembayaran baru.</p>
        <p><b>User:</b> ${esc(pc.user_email ?? pc.user_id)}<br><b>Nominal:</b> ${amount}<br>
        <b>Catatan:</b> ${esc(pc.note ?? "-")}</p>
        <p><a href="${site}/admin">Buka halaman Admin untuk mengecek bukti transfer</a></p>`,
    }),
  });
  return NextResponse.json({ sent: res.ok });
}
