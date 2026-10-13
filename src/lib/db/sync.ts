import type { SupabaseClient } from "@supabase/supabase-js";
import { db, getMeta, setMeta, SYNCED_TABLES, type OutboxItem, type SyncedTable } from "@/lib/db/local";
import type { Subscription } from "@/lib/types";

export interface RemoteError {
  code?: string;
  message: string;
}

/** The slice of Supabase the sync engine needs; faked in tests. */
export interface Remote {
  upsert(table: SyncedTable, rows: Record<string, unknown>[]): Promise<{ error: RemoteError | null }>;
  pullSince(table: SyncedTable, since: string | null, limit: number): Promise<{ rows: Record<string, unknown>[]; error: RemoteError | null }>;
  subscription(): Promise<Subscription | null>;
}

const PULL_PAGE = 500;

/** Built-in rows are bundled with the app, so only user-owned rows are pulled. */
const OWNER_FILTER: Partial<Record<SyncedTable, string>> = {
  exercises: "owner_id",
  templates: "user_id",
  template_exercises: "user_id",
};

export function supabaseRemote(sb: SupabaseClient): Remote {
  return {
    async upsert(table, rows) {
      const { error } = await sb.from(table).upsert(rows, { onConflict: "id" });
      return { error: error ? { code: error.code, message: error.message } : null };
    },
    async pullSince(table, since, limit) {
      let q = sb.from(table).select("*").order("updated_at", { ascending: true }).limit(limit);
      if (since) q = q.gte("updated_at", since);
      const owner = OWNER_FILTER[table];
      if (owner) q = q.not(owner, "is", null);
      const { data, error } = await q;
      return { rows: (data ?? []) as Record<string, unknown>[], error: error ? { code: error.code, message: error.message } : null };
    },
    async subscription() {
      const { data } = await sb.from("subscriptions").select("*").maybeSingle();
      return (data as Subscription | null) ?? null;
    },
  };
}

/**
 * Errors that will never succeed on retry (RLS, constraint, freemium limit).
 * Those rows are parked with an error instead of blocking the queue forever.
 */
export function isPermanent(e: RemoteError): boolean {
  if (!e.code) return false;
  return (
    e.code === "P0001" || // raised by our triggers (tier limits)
    e.code === "42501" || // RLS / ownership
    e.code.startsWith("23") || // integrity constraint violations
    e.code === "22P02" // invalid input syntax
  );
}

function stripLocal(row: Record<string, unknown>) {
  // Server owns updated_at; everything else maps 1:1 to columns.
  const rest = { ...row };
  delete rest.updated_at;
  return rest;
}

export interface PushResult {
  pushed: number;
  failed: number;
  networkError: boolean;
}

/** Push queued rows, parents before children. */
export async function push(remote: Remote): Promise<PushResult> {
  const items = (await db.outbox.toArray()).filter((i) => !i.error);
  const res: PushResult = { pushed: 0, failed: 0, networkError: false };
  for (const table of SYNCED_TABLES) {
    const batch = items.filter((i) => i.table === table);
    if (!batch.length) continue;
    const rows = (await db.table(table).bulkGet(batch.map((i) => i.id))) as (Record<string, unknown> | undefined)[];
    const present = batch.map((item, i) => ({ item, row: rows[i] })).filter((x) => x.row);
    // Rows that vanished locally have nothing to send.
    await db.outbox.bulkDelete(batch.filter((_, i) => !rows[i]).map((i) => i.key));

    for (let i = 0; i < present.length; i += 200) {
      const chunk = present.slice(i, i + 200);
      const { error } = await remote.upsert(table, chunk.map((x) => stripLocal(x.row!)));
      if (!error) {
        await clearIfUnchanged(chunk.map((x) => x.item));
        res.pushed += chunk.length;
        continue;
      }
      if (!isPermanent(error)) {
        res.networkError = true;
        return res;
      }
      // Retry one by one so a single bad row doesn't block its neighbours.
      for (const x of chunk) {
        const single = await remote.upsert(table, [stripLocal(x.row!)]);
        if (!single.error) {
          await clearIfUnchanged([x.item]);
          res.pushed++;
        } else if (isPermanent(single.error)) {
          await db.outbox.update(x.item.key, { error: `${single.error.code}: ${single.error.message}` });
          res.failed++;
        } else {
          res.networkError = true;
          return res;
        }
      }
    }
  }
  return res;
}

/** Remove outbox entries unless the row was edited again while we were pushing. */
async function clearIfUnchanged(items: OutboxItem[]) {
  await db.transaction("rw", db.outbox, async () => {
    for (const it of items) {
      const cur = await db.outbox.get(it.key);
      if (cur && cur.queued_at === it.queued_at) await db.outbox.delete(it.key);
    }
  });
}

const cursorKey = (t: SyncedTable) => `pull:${t}`;

/**
 * Pull rows changed since the last cursor. Rows with local unsynced edits are
 * skipped (local wins until pushed); the cursor uses `>=` so rows sharing the
 * boundary timestamp aren't lost.
 */
export async function pull(remote: Remote): Promise<{ pulled: number; error: RemoteError | null }> {
  let pulled = 0;
  for (const table of SYNCED_TABLES) {
    let since = (await getMeta<string>(cursorKey(table))) ?? null;
    for (;;) {
      const { rows, error } = await remote.pullSince(table, since, PULL_PAGE);
      if (error) return { pulled, error };
      if (!rows.length) break;
      const pending = new Set((await db.outbox.where("table").equals(table).toArray()).map((i) => i.id));
      const apply = rows.filter((r) => !pending.has(r.id as string)).map(normalize);
      await db.table(table).bulkPut(apply);
      pulled += apply.length;
      const last = rows[rows.length - 1].updated_at as string;
      const advanced = last !== since;
      since = last;
      await setMeta(cursorKey(table), since);
      if (rows.length < PULL_PAGE || !advanced) break;
    }
  }
  const sub = await remote.subscription();
  if (sub) await db.subscriptions.put(sub);
  return { pulled, error: null };
}

/** Postgres numeric can come back as strings depending on the driver. */
function normalize(row: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...row };
  for (const k of ["weight_kg", "rpe", "distance_m", "body_fat_pct", "bodyweight_start_kg"]) {
    if (typeof out[k] === "string") out[k] = Number(out[k]);
  }
  return out;
}

export async function pendingCount(): Promise<number> {
  return db.outbox.count();
}
