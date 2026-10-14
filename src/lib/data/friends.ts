import { getSupabase } from "@/lib/supabase/client";

/** Online-only social features; all access is mediated by SQL functions. */

export interface FriendRow {
  id: string; // friendship id
  friend_id: string;
  display_name: string | null;
  avatar_url: string | null;
  status: "pending" | "accepted";
  incoming: boolean;
  can_view: boolean;
  created_at: string;
}

export interface FriendProgress {
  hidden: boolean;
  weekly_target?: number;
  workout_dates?: string[];
  total_workouts?: number;
  recent?: { id: string; name: string | null; started_at: string; duration_sec: number | null; volume_kg: number; sets: number }[];
  best?: { exercise_id: string; e1rm: number }[];
}

export type RequestResult = "sent" | "accepted" | "already_sent" | "already_friends" | "not_found" | "self";

export async function listFriends(): Promise<FriendRow[]> {
  const { data, error } = await (await getSupabase()).rpc("list_friends");
  if (error) throw error;
  return data as FriendRow[];
}

export async function sendFriendRequest(code: string): Promise<RequestResult> {
  const { data, error } = await (await getSupabase()).rpc("send_friend_request", { p_code: code });
  if (error) throw error;
  return data as RequestResult;
}

export async function respondFriendRequest(id: string, accept: boolean) {
  const { error } = await (await getSupabase()).rpc("respond_friend_request", { p_id: id, p_accept: accept });
  if (error) throw error;
}

export async function removeFriend(id: string) {
  const { error } = await (await getSupabase()).from("friendships").delete().eq("id", id);
  if (error) throw error;
}

export async function friendProgress(friendId: string): Promise<FriendProgress | null> {
  const { data, error } = await (await getSupabase()).rpc("friend_progress", { p_friend: friendId });
  if (error) throw error;
  return data as FriendProgress | null;
}
