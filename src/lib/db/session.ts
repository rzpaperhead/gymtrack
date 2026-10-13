/**
 * Who is using the device right now. Kept outside React so data helpers can
 * stamp user_id on rows without threading it through every call.
 */
export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000000";

let currentUserId: string | null = null;
let syncEnabled = false;

export function setSessionUser(userId: string | null, opts: { sync: boolean }) {
  currentUserId = userId;
  syncEnabled = opts.sync && !!userId;
}

export function requireUserId(): string {
  if (!currentUserId) throw new Error("No signed-in user");
  return currentUserId;
}

export function getUserId(): string | null {
  return currentUserId;
}

export function isSyncEnabled() {
  return syncEnabled;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
