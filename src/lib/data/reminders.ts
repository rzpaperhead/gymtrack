import { getSupabase } from "@/lib/supabase/client";

export interface ReminderSettings {
  enabled: boolean;
  time_local: string; // HH:MM
  timezone: string;
  weekdays: number[]; // 0 = Sun
}

export async function getReminder(): Promise<ReminderSettings | null> {
  const { data, error } = await (await getSupabase()).from("workout_reminders").select("enabled, time_local, timezone, weekdays").maybeSingle();
  if (error) throw error;
  return data as ReminderSettings | null;
}

export async function saveReminder(s: Omit<ReminderSettings, "timezone">) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jakarta";
  const { error } = await (await getSupabase())
    .from("workout_reminders")
    .upsert({ ...s, timezone, last_sent_date: null }, { onConflict: "user_id" });
  if (error) throw error;
}
