import { db, type RowMap, type SyncedTable } from "@/lib/db/local";
import { isSyncEnabled, nowIso } from "@/lib/db/session";

type Listener = () => void;
const listeners = new Set<Listener>();

/** The sync engine subscribes here to push soon after local writes. */
export function onLocalWrite(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const l of listeners) l();
}

/**
 * Write rows locally and queue them for sync, atomically. This is the only way
 * app code should mutate synced tables: IndexedDB is the source of truth on the
 * device, Supabase catches up when online.
 */
export async function saveRows<T extends SyncedTable>(table: T, rows: RowMap[T][]) {
  if (!rows.length) return;
  const ts = nowIso();
  const stamped = rows.map((r) => ({ ...r, updated_at: ts }));
  const sync = isSyncEnabled();
  const t = db.table(table);
  await db.transaction("rw", [t, db.outbox], async () => {
    await t.bulkPut(stamped);
    if (sync) {
      const now = Date.now();
      await db.outbox.bulkPut(
        stamped.map((r) => {
          const id = (table === "profiles" ? (r as RowMap["profiles"]).id : (r as { id: string }).id) as string;
          return { key: `${table}:${id}`, table, id, queued_at: now };
        }),
      );
    }
  });
  if (sync) notify();
}

export async function saveRow<T extends SyncedTable>(table: T, row: RowMap[T]) {
  await saveRows(table, [row]);
}

/** Partial update of one row; no-op if it doesn't exist. */
export async function patchRow<T extends SyncedTable>(table: T, id: string, patch: Partial<RowMap[T]>) {
  const cur = (await db.table(table).get(id)) as RowMap[T] | undefined;
  if (!cur) return;
  await saveRow(table, { ...cur, ...patch });
}

/** Soft delete so the deletion syncs to other devices. */
export async function softDelete<T extends Exclude<SyncedTable, "profiles">>(table: T, ids: string[]) {
  if (!ids.length) return;
  const rows = (await db.table(table).bulkGet(ids)).filter(Boolean) as RowMap[T][];
  const ts = nowIso();
  await saveRows(
    table,
    rows.map((r) => ({ ...r, deleted_at: ts })),
  );
}
