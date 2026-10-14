import { compressImage } from "@/lib/data/photos";
import { setMeta } from "@/lib/db/local";
import { newId, requireUserId } from "@/lib/db/session";
import { syncNow } from "@/lib/db/sync-manager";
import { authHeader, getSupabase } from "@/lib/supabase/client";

/** Online-only premium flows: promo codes, bank-transfer confirmations, admin review. */

export const PROOF_BUCKET = "payment-proofs";

export interface PaymentConfirmation {
  id: string;
  user_id: string;
  user_email: string | null;
  amount_idr: number;
  proof_path: string;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_at: string | null;
}

export interface PromoCode {
  code: string;
  kind: "temporary" | "permanent";
  duration_days: number | null;
  max_uses: number;
  used_count: number;
  note: string | null;
  active: boolean;
  created_at: string;
}

export async function fetchIsAdmin(): Promise<boolean> {
  const { data, error } = await (await getSupabase()).rpc("is_admin");
  const admin = !error && data === true;
  await setMeta("isAdmin", admin);
  return admin;
}

export type RedeemResult = "ok" | "invalid" | "used_up" | "already";

export async function redeemPromoCode(code: string): Promise<RedeemResult> {
  const { data, error } = await (await getSupabase()).rpc("redeem_promo_code", { p_code: code });
  if (error) throw error;
  if (data === "ok") await syncNow();
  return data as RedeemResult;
}

export async function submitPaymentProof(file: File, amountIdr: number, note: string) {
  const sb = await getSupabase();
  const uid = requireUserId();
  const path = `${uid}/${newId()}.jpg`;
  const blob = await compressImage(file);
  const up = await sb.storage.from(PROOF_BUCKET).upload(path, blob, { contentType: "image/jpeg" });
  if (up.error) throw up.error;
  const { data, error } = await sb
    .from("payment_confirmations")
    .insert({ amount_idr: amountIdr, proof_path: path, note: note.trim() || null })
    .select("id")
    .single();
  if (error) throw error;
  // Email the admin; never block the user on it.
  void fetch("/api/payments/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ id: data.id }),
  }).catch(() => {});
}

export async function myConfirmations(): Promise<PaymentConfirmation[]> {
  const { data, error } = await (await getSupabase())
    .from("payment_confirmations")
    .select("*")
    .eq("user_id", requireUserId())
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw error;
  return data as PaymentConfirmation[];
}

// --- admin ---------------------------------------------------------------

export async function listConfirmations(): Promise<PaymentConfirmation[]> {
  const { data, error } = await (await getSupabase())
    .from("payment_confirmations")
    .select("*")
    .order("status", { ascending: false }) // pending first
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data as PaymentConfirmation[];
}

export async function proofUrl(path: string): Promise<string | null> {
  const { data } = await (await getSupabase()).storage.from(PROOF_BUCKET).createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}

export async function reviewPayment(id: string, approve: boolean, days: number | null) {
  const { error } = await (await getSupabase()).rpc("review_payment", { p_id: id, p_approve: approve, p_days: days });
  if (error) throw error;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return `GT-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

export async function createPromoCode(input: { kind: PromoCode["kind"]; days: number | null; maxUses: number; note: string }) {
  const row = {
    code: randomCode(),
    kind: input.kind,
    duration_days: input.kind === "temporary" ? input.days : null,
    max_uses: input.maxUses,
    note: input.note.trim() || null,
  };
  const { error } = await (await getSupabase()).from("promo_codes").insert(row);
  if (error) throw error;
  return row.code;
}

export async function listPromoCodes(): Promise<PromoCode[]> {
  const { data, error } = await (await getSupabase()).from("promo_codes").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return data as PromoCode[];
}

export async function setPromoActive(code: string, active: boolean) {
  const { error } = await (await getSupabase()).from("promo_codes").update({ active }).eq("code", code);
  if (error) throw error;
}
