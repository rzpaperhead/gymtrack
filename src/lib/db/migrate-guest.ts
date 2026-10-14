import { db, SYNCED_TABLES, type SyncedTable } from "@/lib/db/local";

/**
 * Hand a guest's local data over to the account they just signed into: every
 * row is re-stamped with the real user id and queued for upload. Called with
 * sync already enabled for `userId`.
 */
export async function migrateGuestData(guestId: string, userId: string) {
  const now = Date.now();
  await db.transaction("rw", [...SYNCED_TABLES.map((t) => db.table(t)), db.outbox, db.photo_blobs], async () => {
    for (const table of SYNCED_TABLES) {
      const t = db.table(table);
      const rows = (await t.toArray()) as Record<string, unknown>[];
      const moved: Record<string, unknown>[] = [];
      for (const r of rows) {
        if (table === "profiles") {
          if (r.id !== guestId) continue;
          await t.delete(guestId);
          moved.push({ ...r, id: userId });
        } else if (table === "exercises") {
          if (r.owner_id !== guestId) continue;
          moved.push({ ...r, owner_id: userId });
        } else {
          if (r.user_id !== guestId) continue;
          const row: Record<string, unknown> = { ...r, user_id: userId };
          if (table === "progress_photos") row.storage_path = String(r.storage_path).replace(guestId, userId);
          moved.push(row);
        }
      }
      if (!moved.length) continue;
      await t.bulkPut(moved);
      await db.outbox.bulkPut(
        moved.map((r) => ({ key: `${table}:${r.id}`, table: table as SyncedTable, id: r.id as string, queued_at: now })),
      );
    }
    // Local-only photo files now need uploading under the new owner.
    await db.photo_blobs.toCollection().modify({ pending_upload: true });
  });
}
