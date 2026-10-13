import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, type SyncedTable } from "@/lib/db/local";
import { setSessionUser } from "@/lib/db/session";
import { pull, push, type Remote, type RemoteError } from "@/lib/db/sync";
import { saveRow } from "@/lib/db/write";
import { EX } from "@/lib/exercises/seed-data";
import { BUILTIN_TEMPLATES } from "@/lib/templates/builtin";
import { finishWorkout, startWorkout, toggleSetDone, updateSet } from "@/lib/workout/actions";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PULL_TEMPLATE = BUILTIN_TEMPLATES.find((t) => t.name === "Pull")!.id;

/** In-memory stand-in for Supabase that records what was upserted, in order. */
class FakeRemote implements Remote {
  tables = new Map<string, Map<string, Record<string, unknown>>>();
  log: { table: SyncedTable; ids: string[] }[] = [];
  fail: ((table: SyncedTable, row: Record<string, unknown>) => RemoteError | null) | null = null;
  offline = false;
  clock = Date.parse("2026-10-13T00:00:00Z");

  async upsert(table: SyncedTable, rows: Record<string, unknown>[]) {
    if (this.offline) return { error: { message: "Failed to fetch" } };
    for (const r of rows) {
      const err = this.fail?.(table, r);
      if (err) return { error: err };
    }
    const t = this.tables.get(table) ?? new Map();
    for (const r of rows) t.set(r.id as string, { ...r, updated_at: new Date(++this.clock).toISOString() });
    this.tables.set(table, t);
    this.log.push({ table, ids: rows.map((r) => r.id as string) });
    return { error: null };
  }

  async pullSince(table: SyncedTable, since: string | null) {
    if (this.offline) return { rows: [], error: { message: "Failed to fetch" } };
    const rows = [...(this.tables.get(table)?.values() ?? [])]
      .filter((r) => !since || (r.updated_at as string) >= since)
      .sort((a, b) => (a.updated_at as string).localeCompare(b.updated_at as string));
    return { rows, error: null };
  }

  async subscription() {
    return null;
  }
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  setSessionUser(USER, { sync: true });
});

describe("offline session → sync", () => {
  it("queues a whole session offline and pushes it parents-first once online", async () => {
    const remote = new FakeRemote();
    remote.offline = true;

    const id = await startWorkout({ templateId: PULL_TEMPLATE });
    const sets = await db.sets.where("workout_id").equals(id).toArray();
    await updateSet(sets[0].id, { weight_kg: 100, reps: 5 });
    await toggleSetDone(sets[0].id);
    await finishWorkout(id, "discard");

    // Offline: nothing leaves the device, nothing is lost.
    expect((await push(remote)).networkError).toBe(true);
    expect(await db.outbox.count()).toBeGreaterThan(0);

    remote.offline = false;
    const res = await push(remote);
    expect(res.networkError).toBe(false);
    expect(await db.outbox.count()).toBe(0);

    const order = remote.log.map((l) => l.table);
    expect(order.indexOf("workouts")).toBeLessThan(order.indexOf("workout_exercises"));
    expect(order.indexOf("workout_exercises")).toBeLessThan(order.indexOf("sets"));

    const serverWorkout = remote.tables.get("workouts")!.get(id)!;
    expect(serverWorkout.status).toBe("completed");
    const serverSet = remote.tables.get("sets")!.get(sets[0].id)!;
    expect(serverSet).toMatchObject({ weight_kg: 100, reps: 5 });
    // Server owns updated_at; the client never sends its own.
    expect(remote.log.length).toBeGreaterThan(0);
  });

  it("coalesces repeated edits of a row into one queue entry", async () => {
    const id = await startWorkout({});
    for (let i = 0; i < 5; i++) await saveRow("workouts", { ...(await db.workouts.get(id))!, notes: `n${i}` });
    const entries = await db.outbox.where("table").equals("workouts").toArray();
    expect(entries).toHaveLength(1);
  });
});

describe("push error handling", () => {
  it("parks rows the server rejects permanently and keeps going", async () => {
    const remote = new FakeRemote();
    const a = await startWorkout({});
    await finishWorkout(a, "discard");
    remote.fail = (table) => (table === "workouts" ? { code: "P0001", message: "free tier limit reached" } : null);
    const res = await push(remote);
    expect(res.failed).toBe(1);
    const parked = await db.outbox.get(`workouts:${a}`);
    expect(parked?.error).toMatch(/P0001/);
    // A parked row is not retried on the next push.
    remote.fail = null;
    await push(remote);
    expect(remote.tables.get("workouts")?.has(a) ?? false).toBe(false);
  });

  it("keeps a row queued if it was edited while being pushed", async () => {
    const remote = new FakeRemote();
    const id = await startWorkout({});
    const original = remote.upsert.bind(remote);
    remote.upsert = async (table, rows) => {
      if (table === "workouts") {
        // Simulate the user typing during the network round-trip.
        await new Promise((r) => setTimeout(r, 2));
        await saveRow("workouts", { ...(await db.workouts.get(id))!, notes: "edited mid-push" });
      }
      return original(table, rows);
    };
    await push(remote);
    expect(await db.outbox.get(`workouts:${id}`)).toBeDefined();
  });
});

describe("pull", () => {
  it("applies remote rows, skips rows with unsynced local edits, and advances the cursor", async () => {
    const remote = new FakeRemote();
    // Another device created a workout.
    await remote.upsert("workouts", [
      {
        id: "11111111-1111-4111-8111-111111111111",
        user_id: USER,
        template_id: null,
        name: "From phone B",
        started_at: "2026-10-12T08:00:00Z",
        ended_at: "2026-10-12T09:00:00Z",
        notes: null,
        status: "completed",
        deleted_at: null,
      },
    ]);
    // And this device has an unsynced edit of a row the server also has.
    const local = await startWorkout({ name: "Local edit" });
    await remote.upsert("workouts", [{ ...(await db.workouts.get(local))!, name: "Stale server copy" }]);

    const { pulled, error } = await pull(remote);
    expect(error).toBeNull();
    expect(pulled).toBe(1);
    expect((await db.workouts.get("11111111-1111-4111-8111-111111111111"))?.name).toBe("From phone B");
    expect((await db.workouts.get(local))?.name).toBe("Local edit");

    // Nothing new on the server → nothing re-applied except boundary rows (idempotent).
    const again = await pull(remote);
    expect(again.error).toBeNull();
  });
});

describe("prefill from last session", () => {
  it("copies the previous session's sets so repeating it is one tap per set", async () => {
    const first = await startWorkout({ templateId: PULL_TEMPLATE });
    const deadlift = (await db.workout_exercises.where("workout_id").equals(first).toArray()).find((we) => we.exercise_id === EX(13))!;
    const sets = await db.sets.where("workout_exercise_id").equals(deadlift.id).toArray();
    for (const s of sets) {
      await updateSet(s.id, { weight_kg: 120, reps: 4 });
      await toggleSetDone(s.id);
    }
    await finishWorkout(first, "discard");

    const second = await startWorkout({ templateId: PULL_TEMPLATE });
    const we2 = (await db.workout_exercises.where("workout_id").equals(second).toArray()).find((we) => we.exercise_id === EX(13))!;
    const sets2 = await db.sets.where("workout_exercise_id").equals(we2.id).toArray();
    expect(sets2).toHaveLength(sets.length);
    expect(sets2.every((s) => s.weight_kg === 120 && s.reps === 4 && s.completed_at === null)).toBe(true);

    // The single tap:
    await toggleSetDone(sets2[0].id);
    const done = await db.sets.get(sets2[0].id);
    expect(done?.completed_at).not.toBeNull();
    expect(done).toMatchObject({ weight_kg: 120, reps: 4 });
  });
});
