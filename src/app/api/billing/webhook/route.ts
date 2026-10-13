import { addMonths, addYears } from "date-fns";
import { NextResponse } from "next/server";
import { z } from "zod";
import { billingConfigured, fetchStatus, isPaid, planAmount, verifySignature } from "@/lib/billing/midtrans";
import { adminClient } from "@/lib/supabase/server";

const notification = z.object({
  order_id: z.string().min(1).max(64),
  status_code: z.string(),
  gross_amount: z.string(),
  signature_key: z.string(),
  transaction_status: z.string(),
});

const custom = z.object({
  custom_field1: z.uuid(),
  custom_field2: z.enum(["monthly", "yearly"]),
});

/** Midtrans HTTP notification. Idempotent: replays extend nothing twice (see provider_ref). */
export async function POST(req: Request) {
  if (!billingConfigured) return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });
  const parsed = notification.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  if (!verifySignature(parsed.data)) return NextResponse.json({ error: "bad_signature" }, { status: 401 });

  const status = await fetchStatus(parsed.data.order_id);
  if (!isPaid(status)) return NextResponse.json({ ok: true, ignored: status.transaction_status });

  const meta = custom.safeParse(status);
  if (!meta.success) return NextResponse.json({ error: "missing_metadata" }, { status: 400 });
  const { custom_field1: userId, custom_field2: plan } = meta.data;
  if (Number(status.gross_amount) < planAmount(plan)) return NextResponse.json({ error: "amount_mismatch" }, { status: 400 });

  const db = adminClient();
  const { data: current } = await db.from("subscriptions").select("*").eq("user_id", userId).maybeSingle();
  if (current?.provider_ref === parsed.data.order_id) return NextResponse.json({ ok: true, duplicate: true });

  const base = current?.current_period_end && new Date(current.current_period_end) > new Date() ? new Date(current.current_period_end) : new Date();
  const end = plan === "monthly" ? addMonths(base, 1) : addYears(base, 1);
  const { error } = await db.from("subscriptions").upsert({
    user_id: userId,
    tier: "premium",
    status: "active",
    provider: "midtrans",
    provider_ref: parsed.data.order_id,
    current_period_end: end.toISOString(),
  });
  if (error) return NextResponse.json({ error: "db_error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
