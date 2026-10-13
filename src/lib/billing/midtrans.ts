import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { PRICING, type Plan } from "@/lib/entitlements";

/**
 * Midtrans Snap adapter (BRIEF §12 leaves Midtrans vs Xendit open; this is
 * isolated so a Xendit adapter can implement the same functions).
 */

const serverKey = process.env.MIDTRANS_SERVER_KEY;
const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY;
const sandbox = process.env.MIDTRANS_ENV !== "production";

export const billingConfigured = Boolean(serverKey && clientKey);

const snapBase = sandbox ? "https://app.sandbox.midtrans.com" : "https://app.midtrans.com";
const apiBase = sandbox ? "https://api.sandbox.midtrans.com" : "https://api.midtrans.com";
const auth = () => `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`;

export function planAmount(plan: Plan): number {
  return plan === "monthly" ? PRICING.monthly : PRICING.yearly;
}

export async function createCheckout(opts: { userId: string; email: string | undefined; plan: Plan }) {
  const orderId = `gt-${opts.userId.slice(0, 8)}-${Date.now()}`;
  const amount = planAmount(opts.plan);
  const res = await fetch(`${snapBase}/snap/v1/transactions`, {
    method: "POST",
    headers: { Authorization: auth(), "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      transaction_details: { order_id: orderId, gross_amount: amount },
      item_details: [{ id: `premium-${opts.plan}`, price: amount, quantity: 1, name: `GymTrack Premium (${opts.plan})` }],
      customer_details: opts.email ? { email: opts.email } : undefined,
      // Echoed back in the notification so the webhook knows who paid for what.
      custom_field1: opts.userId,
      custom_field2: opts.plan,
    }),
  });
  if (!res.ok) throw new Error(`Midtrans ${res.status}`);
  const data = (await res.json()) as { token: string };
  return { token: data.token, clientKey: clientKey!, sandbox, orderId };
}

/** signature_key = SHA512(order_id + status_code + gross_amount + server_key) */
export function verifySignature(n: { order_id: string; status_code: string; gross_amount: string; signature_key: string }): boolean {
  if (!serverKey) return false;
  const expected = createHash("sha512").update(n.order_id + n.status_code + n.gross_amount + serverKey).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(n.signature_key);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Ask Midtrans directly rather than trusting the notification body alone. */
export async function fetchStatus(orderId: string) {
  const res = await fetch(`${apiBase}/v2/${encodeURIComponent(orderId)}/status`, {
    headers: { Authorization: auth(), Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Midtrans status ${res.status}`);
  return (await res.json()) as {
    transaction_status: string;
    fraud_status?: string;
    gross_amount: string;
    custom_field1?: string;
    custom_field2?: string;
  };
}

export function isPaid(s: { transaction_status: string; fraud_status?: string }) {
  return s.transaction_status === "settlement" || (s.transaction_status === "capture" && s.fraud_status !== "challenge" && s.fraud_status !== "deny");
}
