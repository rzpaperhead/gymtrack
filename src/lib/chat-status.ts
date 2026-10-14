/** Message ticks, WhatsApp-style. In groups a tick needs every other member. */

export type MessageStatus = "pending" | "sent" | "delivered" | "read";

export interface Receipt {
  user_id: string;
  last_delivered_at: string;
  last_read_at: string;
}

export function messageStatus(createdAt: string | null, receipts: Receipt[] | undefined, pending = false): MessageStatus {
  if (pending || !createdAt) return "pending";
  if (!receipts?.length) return "sent";
  const t = Date.parse(createdAt);
  if (receipts.every((r) => Date.parse(r.last_read_at) >= t)) return "read";
  if (receipts.every((r) => Date.parse(r.last_delivered_at) >= t)) return "delivered";
  return "sent";
}
