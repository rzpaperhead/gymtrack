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
  recent?: {
    id: string;
    name: string | null;
    started_at: string;
    duration_sec: number | null;
    volume_kg: number;
    sets: number;
    kudos: number;
    my_kudos: Kudos | null;
  }[];
  share_streak?: boolean;
  share_workouts?: boolean;
  share_lifts?: boolean;
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

// --- social v2 ---------------------------------------------------------------

export const KUDOS = ["💪", "🔥", "👏", "🏆"] as const;
export type Kudos = (typeof KUDOS)[number];

export async function giveKudos(workoutId: string, emoji: Kudos): Promise<boolean> {
  const { data, error } = await (await getSupabase()).rpc("give_kudos", { p_workout: workoutId, p_emoji: emoji });
  if (error) throw error;
  return data === true;
}

export async function kudosForWorkout(workoutId: string): Promise<{ from_name: string; emoji: string; created_at: string }[]> {
  const { data, error } = await (await getSupabase()).rpc("kudos_for_workout", { p_workout: workoutId });
  if (error) throw error;
  return data ?? [];
}

export type LeaderMetric = "sessions" | "volume";
export interface LeaderRow {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  value: number;
  is_me: boolean;
}

export async function leaderboard(metric: LeaderMetric): Promise<LeaderRow[]> {
  const { data, error } = await (await getSupabase()).rpc("friends_leaderboard", { p_metric: metric });
  if (error) throw error;
  return (data as LeaderRow[]).map((r) => ({ ...r, value: Number(r.value) }));
}

export interface Challenge {
  id: string;
  creator: string;
  title: string;
  metric: LeaderMetric;
  target: number;
  start_date: string;
  end_date: string;
}
export interface ChallengeMember {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  status: "invited" | "joined";
  value: number;
  is_me: boolean;
}

export async function listChallenges(): Promise<Challenge[]> {
  const { data, error } = await (await getSupabase()).from("challenges").select("*").order("end_date", { ascending: false }).limit(50);
  if (error) throw error;
  return (data as Challenge[]).map((c) => ({ ...c, target: Number(c.target) }));
}

export async function createChallenge(input: { title: string; metric: LeaderMetric; target: number; days: number; friends: string[] }) {
  const { data, error } = await (await getSupabase()).rpc("create_challenge", {
    p_title: input.title,
    p_metric: input.metric,
    p_target: input.target,
    p_days: input.days,
    p_friends: input.friends,
  });
  if (error) throw error;
  return data as string;
}

export async function challengeProgress(id: string): Promise<ChallengeMember[]> {
  const { data, error } = await (await getSupabase()).rpc("challenge_progress", { p_challenge: id });
  if (error) throw error;
  return (data as ChallengeMember[]).map((m) => ({ ...m, value: Number(m.value) }));
}

export async function joinChallenge(id: string) {
  const { error } = await (await getSupabase()).rpc("join_challenge", { p_challenge: id });
  if (error) throw error;
}

export async function leaveChallenge(id: string, userId: string) {
  const { error } = await (await getSupabase()).from("challenge_members").delete().eq("challenge_id", id).eq("user_id", userId);
  if (error) throw error;
}

export async function deleteChallenge(id: string) {
  const { error } = await (await getSupabase()).from("challenges").delete().eq("id", id);
  if (error) throw error;
}

export async function blockUser(userId: string) {
  const { error } = await (await getSupabase()).rpc("block_user", { p_user: userId });
  if (error) throw error;
}

export async function listBlocked(): Promise<{ user_id: string; display_name: string; created_at: string }[]> {
  const { data, error } = await (await getSupabase()).rpc("list_blocked");
  if (error) throw error;
  return data ?? [];
}

export async function unblockUser(userId: string) {
  const { error } = await (await getSupabase()).from("blocks").delete().eq("blocked", userId);
  if (error) throw error;
}

/** Tell friends about new PRs (server checks ownership & privacy). Best-effort. */
export async function announcePRs(workoutId: string, prs: { exercise_id: string; record_type: string; value: number }[]) {
  const items = prs.filter((p) => p.record_type === "max_e1rm" || p.record_type === "max_weight");
  if (!items.length) return;
  try {
    await (await getSupabase()).rpc("announce_prs", { p_workout: workoutId, p_items: items });
  } catch {}
}
