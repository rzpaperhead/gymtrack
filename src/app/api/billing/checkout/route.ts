import { NextResponse } from "next/server";
import { z } from "zod";
import { billingConfigured, createCheckout } from "@/lib/billing/midtrans";
import { userFromRequest } from "@/lib/supabase/server";

const body = z.object({ plan: z.enum(["monthly", "yearly"]) });

export async function POST(req: Request) {
  if (!billingConfigured) return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  try {
    const { token, clientKey, sandbox } = await createCheckout({ userId: user.id, email: user.email, plan: parsed.data.plan });
    return NextResponse.json({ token, clientKey, sandbox });
  } catch {
    return NextResponse.json({ error: "provider_error" }, { status: 502 });
  }
}
