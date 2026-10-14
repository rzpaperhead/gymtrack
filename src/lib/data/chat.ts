import { getSupabase } from "@/lib/supabase/client";

export interface Conversation {
  id: string;
  kind: "direct" | "group";
  title: string | null;
  avatar_url: string | null;
  other_user: string | null;
  member_count: number;
  last_body: string | null;
  last_sender: string | null;
  last_message_at: string;
  unread: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface Member {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  role: "owner" | "member";
}

export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await (await getSupabase()).rpc("list_conversations");
  if (error) throw error;
  return data as Conversation[];
}

export async function openDirect(friendId: string): Promise<string> {
  const { data, error } = await (await getSupabase()).rpc("get_or_create_direct", { p_friend: friendId });
  if (error) throw error;
  return data as string;
}

export async function createGroup(title: string, members: string[]): Promise<string> {
  const { data, error } = await (await getSupabase()).rpc("create_group_chat", { p_title: title, p_members: members });
  if (error) throw error;
  return data as string;
}

export async function addGroupMembers(conversationId: string, members: string[]) {
  const { error } = await (await getSupabase()).rpc("add_group_members", { p_conv: conversationId, p_members: members });
  if (error) throw error;
}

export async function renameGroup(conversationId: string, title: string) {
  const { error } = await (await getSupabase()).rpc("rename_group", { p_conv: conversationId, p_title: title });
  if (error) throw error;
}

export async function leaveConversation(conversationId: string, userId: string) {
  const { error } = await (await getSupabase()).from("conversation_members").delete().eq("conversation_id", conversationId).eq("user_id", userId);
  if (error) throw error;
}

export async function members(conversationId: string): Promise<Member[]> {
  const { data, error } = await (await getSupabase()).rpc("conversation_members_info", { p_conv: conversationId });
  if (error) throw error;
  return data as Member[];
}

/** Newest page first from the server, returned oldest→newest for rendering. */
export async function loadMessages(conversationId: string, before?: string, limit = 50): Promise<Message[]> {
  let q = (await getSupabase())
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  if (error) throw error;
  return (data as Message[]).reverse();
}

export async function sendMessage(conversationId: string, body: string): Promise<Message> {
  const { data, error } = await (await getSupabase())
    .from("messages")
    .insert({ conversation_id: conversationId, body: body.trim() })
    .select("*")
    .single();
  if (error) throw error;
  return data as Message;
}

export async function markRead(conversationId: string) {
  try {
    await (await getSupabase()).rpc("mark_conversation_read", { p_conv: conversationId });
  } catch {}
}

/** Live inserts for one conversation (RLS applies to realtime too). */
export async function subscribeMessages(conversationId: string, onMessage: (m: Message) => void): Promise<() => void> {
  const sb = await getSupabase();
  const channel = sb
    .channel(`messages:${conversationId}:${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (p) =>
      onMessage(p.new as Message),
    )
    .subscribe();
  return () => void sb.removeChannel(channel);
}

/** Any new message the user can see (for unread badges / inbox refresh). */
export async function subscribeInbox(onChange: () => void): Promise<() => void> {
  const sb = await getSupabase();
  const channel = sb
    .channel(`inbox:${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => onChange())
    .subscribe();
  return () => void sb.removeChannel(channel);
}

// --- receipts ---------------------------------------------------------------

/** Everything up to now reached this device (✓✓ for senders). Best-effort. */
export async function markAllDelivered() {
  try {
    await (await getSupabase()).rpc("mark_all_delivered");
  } catch {}
}

export async function loadReceipts(conversationId: string) {
  const { data, error } = await (await getSupabase()).rpc("conversation_receipts", { p_conv: conversationId });
  if (error) throw error;
  return data as import("@/lib/chat-status").Receipt[];
}

/** Fires when another member's delivered/read watermark moves. */
export async function subscribeReceipts(conversationId: string, onChange: () => void): Promise<() => void> {
  const sb = await getSupabase();
  const channel = sb
    .channel(`receipts:${conversationId}:${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_members", filter: `conversation_id=eq.${conversationId}` }, () =>
      onChange(),
    )
    .subscribe();
  return () => void sb.removeChannel(channel);
}
