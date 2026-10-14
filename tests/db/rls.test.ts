/**
 * Runs the real migrations on an in-process Postgres (PGlite) with a minimal
 * stand-in for Supabase's auth/storage schemas, then checks that RLS keeps
 * users apart and that the freemium backstop triggers work.
 */
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const MIGRATIONS = join(__dirname, "..", "..", "supabase", "migrations");
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const EMAIL: Record<string, string> = { [A]: "a@test.dev", [B]: "b@test.dev", [ADMIN]: "rzpaperhead@gmail.com" };
const BENCH = "e0000000-0000-4000-8000-000000000001";

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $$;
  grant usage on schema auth to authenticated, anon;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant all on storage.objects to authenticated;
  alter default privileges in schema public grant all on tables to authenticated, service_role;
  alter default privileges in schema public grant all on functions to authenticated, service_role;
`;

let db: PGlite;

async function as<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);
     select set_config('request.jwt.claims', '{"email":"${EMAIL[uid] ?? ""}"}', false);`,
  );
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

async function rows(sql: string, params: unknown[] = []) {
  return (await db.query(sql, params)).rows as Record<string, unknown>[];
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  }
  await db.exec(
    `insert into auth.users (id, email) values ('${A}', 'a@test.dev'), ('${B}', 'b@test.dev'), ('${ADMIN}', 'rzpaperhead@gmail.com');`,
  );
  // User A logs a workout.
  await as(A, () =>
    db.exec(`
      insert into public.workouts (id, user_id, started_at, status)
        values ('11111111-1111-4111-8111-111111111111', '${A}', now(), 'completed');
      insert into public.workout_exercises (id, user_id, workout_id, exercise_id)
        values ('22222222-2222-4222-8222-222222222222', '${A}', '11111111-1111-4111-8111-111111111111', '${BENCH}');
      insert into public.sets (id, user_id, workout_id, workout_exercise_id, weight_kg, reps, completed_at)
        values ('33333333-3333-4333-8333-333333333333', '${A}', '11111111-1111-4111-8111-111111111111',
                '22222222-2222-4222-8222-222222222222', 100, 5, now());
      insert into public.body_metrics (user_id, date, weight_kg) values ('${A}', current_date, 80);
    `),
  );
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("schema bootstrap", () => {
  it("creates a profile and free subscription for new users", async () => {
    const p = await rows(`select id, locale, unit from public.profiles order by id`);
    expect(p).toHaveLength(3);
    expect(p[0]).toMatchObject({ locale: "id", unit: "kg" });
    const s = await rows(`select tier from public.subscriptions where user_id = $1`, [A]);
    expect(s[0].tier).toBe("free");
  });

  it("seeds ±80 built-in exercises and templates", async () => {
    const [{ n }] = await rows(`select count(*)::int as n from public.exercises where owner_id is null`);
    expect(n).toBeGreaterThanOrEqual(80);
    const [{ t }] = await rows(`select count(*)::int as t from public.templates where user_id is null`);
    expect(t).toBe(9);
  });
});

describe("RLS isolation", () => {
  it("user A sees their own data", async () => {
    const w = await as(A, () => rows(`select id from public.workouts`));
    expect(w).toHaveLength(1);
    const s = await as(A, () => rows(`select id from public.sets`));
    expect(s).toHaveLength(1);
  });

  it("user B cannot read user A's rows", async () => {
    for (const table of ["workouts", "workout_exercises", "sets", "body_metrics", "profiles", "subscriptions"]) {
      const r = await as(B, () =>
        rows(`select * from public.${table} where ${table === "profiles" ? "id" : "user_id"} = $1`, [A]),
      );
      expect(r, table).toHaveLength(0);
    }
  });

  it("user B cannot update or delete user A's rows", async () => {
    await as(B, () => db.exec(`update public.sets set reps = 99 where user_id = '${A}'`));
    await as(B, () => db.exec(`delete from public.workouts where user_id = '${A}'`));
    const s = await rows(`select reps from public.sets where user_id = $1`, [A]);
    expect(s[0].reps).toBe(5);
    const w = await rows(`select id from public.workouts where user_id = $1`, [A]);
    expect(w).toHaveLength(1);
  });

  it("user B cannot insert rows owned by user A", async () => {
    await expect(
      as(B, () => db.exec(`insert into public.workouts (user_id, started_at) values ('${A}', now())`)),
    ).rejects.toThrow(/row-level security/);
  });

  it("user B cannot attach a set to user A's workout", async () => {
    await expect(
      as(B, () =>
        db.exec(`
          insert into public.sets (user_id, workout_id, workout_exercise_id, weight_kg, reps)
          values ('${B}', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 1, 1)`),
      ),
    ).rejects.toThrow(/not owned/);
  });

  it("built-in exercises are visible to everyone but not editable", async () => {
    const r = await as(B, () => rows(`select id from public.exercises where id = $1`, [BENCH]));
    expect(r).toHaveLength(1);
    await as(B, () => db.exec(`update public.exercises set name_en = 'hacked' where id = '${BENCH}'`));
    const [e] = await rows(`select name_en from public.exercises where id = $1`, [BENCH]);
    expect(e.name_en).toBe("Bench Press (Barbell)");
  });

  it("users cannot grant themselves premium", async () => {
    await as(A, () => db.exec(`update public.subscriptions set tier = 'premium' where user_id = '${A}'`));
    const [s] = await rows(`select tier from public.subscriptions where user_id = $1`, [A]);
    expect(s.tier).toBe("free");
  });

  it("storage policies scope photos to the owner's folder", async () => {
    await expect(
      as(B, () => db.exec(`insert into storage.objects (bucket_id, name) values ('progress-photos', '${A}/x.jpg')`)),
    ).rejects.toThrow(/row-level security/);
    await as(B, () => db.exec(`insert into storage.objects (bucket_id, name) values ('progress-photos', '${B}/x.jpg')`));
    const seenByA = await as(A, () => rows(`select name from storage.objects`));
    expect(seenByA).toHaveLength(0);
  });
});

describe("freemium backstop", () => {
  it("blocks a 4th custom template on free, but allows re-sending an existing one", async () => {
    const ids = [1, 2, 3, 4].map((i) => `44444444-4444-4444-8444-00000000000${i}`);
    await as(A, async () => {
      for (const id of ids.slice(0, 3)) {
        await db.exec(`insert into public.templates (id, user_id, name) values ('${id}', '${A}', 'T')`);
      }
    });
    await expect(
      as(A, () => db.exec(`insert into public.templates (id, user_id, name) values ('${ids[3]}', '${A}', 'T4')`)),
    ).rejects.toThrow(/limit/);
    // Upsert of an existing row (sync retry / edit) still works.
    await as(A, () =>
      db.exec(
        `insert into public.templates (id, user_id, name) values ('${ids[0]}', '${A}', 'Renamed')
         on conflict (id) do update set name = excluded.name`,
      ),
    );
    const [t] = await rows(`select name from public.templates where id = $1`, [ids[0]]);
    expect(t.name).toBe("Renamed");
  });

  it("lifts limits for premium users", async () => {
    await db.exec(`update public.subscriptions set tier = 'premium', status = 'active' where user_id = '${B}'`);
    await as(B, async () => {
      for (let i = 0; i < 5; i++) {
        await db.exec(`insert into public.templates (user_id, name) values ('${B}', 'T${i}')`);
      }
      await db.exec(`insert into public.programs (user_id, name) values ('${B}', 'Custom')`);
    });
    const [{ n }] = await rows(`select count(*)::int as n from public.templates where user_id = $1`, [B]);
    expect(n).toBe(5);
  });

  it("free users can only create built-in programs", async () => {
    await expect(as(A, () => db.exec(`insert into public.programs (user_id, name) values ('${A}', 'Mine')`))).rejects.toThrow(
      /premium/,
    );
    await as(A, () =>
      db.exec(`insert into public.programs (user_id, name, builtin_key, is_active) values ('${A}', 'PPL', 'ppl_6', true)`),
    );
  });
});

describe("admin, promo codes and manual payments", () => {
  const rpc = async (uid: string, sql: string) => (await as(uid, () => rows(sql)))[0];

  it("only the admin email is admin, and admin counts as premium", async () => {
    expect((await rpc(ADMIN, "select public.is_admin() as v")).v).toBe(true);
    expect((await rpc(A, "select public.is_admin() as v")).v).toBe(false);
    const [{ v }] = await rows(`select public.is_premium('${ADMIN}') as v`);
    expect(v).toBe(true);
  });

  it("non-admins cannot create promo codes or grant premium directly", async () => {
    await expect(as(A, () => db.exec(`insert into public.promo_codes (code, kind) values ('HACK-1234', 'permanent')`))).rejects.toThrow(
      /row-level security/,
    );
    await expect(as(A, () => db.exec(`select public.grant_premium('${A}', null, 'x', 'y')`))).rejects.toThrow(/permission denied/);
  });

  it("a temporary code grants premium for N days, once per user, up to max uses", async () => {
    await as(ADMIN, () => db.exec(`insert into public.promo_codes (code, kind, duration_days, max_uses) values ('GT-TEMP-0001', 'temporary', 7, 1)`));
    expect((await rpc(A, "select public.redeem_promo_code('gt-temp-0001') as r")).r).toBe("ok");
    expect((await rpc(A, "select public.redeem_promo_code('GT-TEMP-0001') as r")).r).toBe("already");
    expect((await rpc(B, "select public.redeem_promo_code('GT-TEMP-0001') as r")).r).toBe("used_up");
    expect((await rpc(B, "select public.redeem_promo_code('NOPE-0000') as r")).r).toBe("invalid");
    const [s] = await rows(`select tier, current_period_end > now() + interval '6 days' as ok from public.subscriptions where user_id = $1`, [A]);
    expect(s).toMatchObject({ tier: "premium", ok: true });
  });

  it("a permanent code grants premium with no end date", async () => {
    await as(ADMIN, () => db.exec(`insert into public.promo_codes (code, kind, max_uses) values ('GT-LIFE-0001', 'permanent', 5)`));
    expect((await rpc(B, "select public.redeem_promo_code('GT-LIFE-0001') as r")).r).toBe("ok");
    const [s] = await rows(`select tier, current_period_end from public.subscriptions where user_id = $1`, [B]);
    expect(s).toMatchObject({ tier: "premium", current_period_end: null });
  });

  it("users submit payment proofs; only the admin can review them", async () => {
    await as(A, () => db.exec(`insert into public.payment_confirmations (amount_idr, proof_path) values (15000, '${A}/proof.jpg')`));
    // Can't file a proof under someone else's folder, nor pre-approve it.
    await expect(
      as(A, () => db.exec(`insert into public.payment_confirmations (amount_idr, proof_path) values (1, '${B}/x.jpg')`)),
    ).rejects.toThrow();
    await expect(
      as(A, () => db.exec(`insert into public.payment_confirmations (amount_idr, proof_path, status) values (1, '${A}/y.jpg', 'approved')`)),
    ).rejects.toThrow(/row-level security/);
    expect(await as(B, () => rows(`select id from public.payment_confirmations`))).toHaveLength(0);
    const [pc] = await as(ADMIN, () => rows(`select id, user_email from public.payment_confirmations`));
    expect(pc.user_email).toBe("a@test.dev");
    await expect(as(A, () => db.exec(`select public.review_payment('${pc.id}', true, 30)`))).rejects.toThrow(/admin only/);
    await as(ADMIN, () => db.exec(`select public.review_payment('${pc.id}', true, 30)`));
    const [st] = await rows(`select status from public.payment_confirmations where id = $1`, [pc.id]);
    expect(st.status).toBe("approved");
  });
});

describe("friends & progress privacy", () => {
  const one = async (uid: string, sql: string) => (await as(uid, () => rows(sql)))[0];
  const codeOf = async (uid: string) => (await rows(`select friend_code from public.profiles where id = $1`, [uid]))[0].friend_code as string;

  it("every profile gets a friend code that clients can't change", async () => {
    const code = await codeOf(A);
    expect(code).toMatch(/^GT-[A-Z0-9]{6}$/);
    await as(A, () => db.exec(`update public.profiles set friend_code = 'GT-HACKED' where id = '${A}'`));
    expect(await codeOf(A)).toBe(code);
  });

  it("request → accept flow, and strangers see nothing", async () => {
    expect((await one(A, `select public.send_friend_request('${await codeOf(B)}') as r`)).r).toBe("sent");
    expect((await one(A, `select public.send_friend_request('${await codeOf(B)}') as r`)).r).toBe("already_sent");
    expect((await one(A, `select public.send_friend_request('${await codeOf(A)}') as r`)).r).toBe("self");
    expect((await one(A, `select public.send_friend_request('GT-NOPE00') as r`)).r).toBe("not_found");
    // Not friends yet → no progress.
    expect((await one(A, `select public.friend_progress('${B}') as p`)).p).toBeNull();
    const req = await one(B, `select id, incoming from public.list_friends()`);
    expect(req.incoming).toBe(true);
    // Only the addressee can accept.
    await as(A, () => db.exec(`select public.respond_friend_request('${req.id}', true)`));
    expect((await one(B, `select status from public.list_friends()`)).status).toBe("pending");
    await as(B, () => db.exec(`select public.respond_friend_request('${req.id}', true)`));
    expect((await one(A, `select status, can_view from public.list_friends()`))).toMatchObject({ status: "accepted", can_view: true });
    // The admin (a stranger to both) can't see their progress.
    expect((await one(ADMIN, `select public.friend_progress('${A}') as p`)).p).toBeNull();
  });

  it("friends see a progress summary, never raw rows", async () => {
    const p = (await one(B, `select public.friend_progress('${A}') as p`)).p as { hidden: boolean; total_workouts: number; recent: unknown[] };
    expect(p.hidden).toBe(false);
    expect(p.total_workouts).toBe(1);
    expect(await as(B, () => rows(`select id from public.workouts where user_id = '${A}'`))).toHaveLength(0);
  });

  it("hiding progress is reciprocal", async () => {
    await as(A, () => db.exec(`update public.profiles set share_progress = false where id = '${A}'`));
    expect(((await one(B, `select public.friend_progress('${A}') as p`)).p as { hidden: boolean }).hidden).toBe(true);
    // A hides → A can't see B either, but they're still friends.
    expect(((await one(A, `select public.friend_progress('${B}') as p`)).p as { hidden: boolean }).hidden).toBe(true);
    expect((await one(A, `select status, can_view from public.list_friends()`))).toMatchObject({ status: "accepted", can_view: false });
    await as(A, () => db.exec(`update public.profiles set share_progress = true where id = '${A}'`));
  });

  it("either side can unfriend", async () => {
    const f = await one(A, `select id from public.list_friends()`);
    await as(A, () => db.exec(`delete from public.friendships where id = '${f.id}'`));
    expect(await as(B, () => rows(`select * from public.list_friends()`))).toHaveLength(0);
  });
});

describe("social v2: notifications, kudos, leaderboard, challenges, blocking, granular privacy", () => {
  const one = async (uid: string, sql: string) => (await as(uid, () => rows(sql)))[0];
  const code = async (uid: string) => (await rows(`select friend_code from public.profiles where id = $1`, [uid]))[0].friend_code as string;
  const WA = "11111111-1111-4111-8111-111111111111"; // A's completed workout

  it("friend request + accept queue notifications for the other side", async () => {
    await one(A, `select public.send_friend_request('${await code(B)}') as r`);
    const req = await one(B, `select id from public.list_friends()`);
    await as(B, () => db.exec(`select public.respond_friend_request('${req.id}', true)`));
    const kinds = await rows(`select user_id, kind from public.notifications_outbox order by created_at`);
    expect(kinds).toEqual(
      expect.arrayContaining([
        { user_id: B, kind: "friend_request" },
        { user_id: A, kind: "friend_accepted" },
      ]),
    );
    // Users can't read the queue directly.
    expect(await as(A, () => rows(`select * from public.notifications_outbox`))).toHaveLength(0);
  });

  it("kudos only between friends who can see each other, and notifies the owner", async () => {
    expect((await one(B, `select public.give_kudos('${WA}', '🔥') as ok`)).ok).toBe(true);
    expect((await one(ADMIN, `select public.give_kudos('${WA}', '🔥') as ok`)).ok).toBe(false);
    expect((await one(A, `select public.give_kudos('${WA}', '🔥') as ok`)).ok).toBe(false); // own workout
    const k = await as(A, () => rows(`select * from public.kudos_for_workout('${WA}')`));
    expect(k).toHaveLength(1);
    expect(k[0].emoji).toBe("🔥");
    const [n] = await rows(`select count(*)::int as n from public.notifications_outbox where user_id = $1 and kind = 'kudos'`, [A]);
    expect(n.n).toBe(1);
  });

  it("granular privacy hides only the chosen parts", async () => {
    await as(A, () => db.exec(`update public.profiles set share_lifts = false where id = '${A}'`));
    const p = (await one(B, `select public.friend_progress('${A}') as p`)).p as { best: unknown[]; recent: unknown[] };
    expect(p.best).toEqual([]);
    expect(p.recent.length).toBe(1);
    // PR announcements respect share_lifts.
    expect((await one(A, `select public.announce_prs('${WA}', '[{"exercise_id":"${BENCH}","value":100}]'::jsonb) as n`)).n).toBe(0);
    await as(A, () => db.exec(`update public.profiles set share_lifts = true where id = '${A}'`));
    expect((await one(A, `select public.announce_prs('${WA}', '[{"exercise_id":"${BENCH}","value":100}]'::jsonb) as n`)).n).toBe(1);
  });

  it("weekly leaderboard includes me and visible friends only", async () => {
    const lb = await as(A, () => rows(`select user_id, is_me from public.friends_leaderboard('sessions')`));
    expect(lb.map((r) => r.user_id).sort()).toEqual([A, B].sort());
    await as(B, () => db.exec(`update public.profiles set share_streak = false where id = '${B}'`));
    const lb2 = await as(A, () => rows(`select user_id from public.friends_leaderboard('sessions')`));
    expect(lb2.map((r) => r.user_id)).toEqual([A]);
    await as(B, () => db.exec(`update public.profiles set share_streak = true where id = '${B}'`));
  });

  it("challenges: invite friends, join, see progress; strangers can't see it", async () => {
    const { cid } = await one(A, `select public.create_challenge('12 sesi', 'sessions', 12, 30, array['${B}', '${ADMIN}']::uuid[]) as cid`);
    const members = await as(A, () => rows(`select user_id, status from public.challenge_progress('${cid}')`));
    expect(members.map((m) => m.user_id).sort()).toEqual([A, B].sort()); // ADMIN isn't A's friend
    await as(B, () => db.exec(`select public.join_challenge('${cid}')`));
    const b = (await as(B, () => rows(`select status from public.challenge_progress('${cid}') where user_id = '${B}'`)))[0];
    expect(b.status).toBe("joined");
    expect(await as(ADMIN, () => rows(`select * from public.challenge_progress('${cid}')`))).toHaveLength(0);
    expect(await as(ADMIN, () => rows(`select * from public.challenges`))).toHaveLength(0);
  });

  it("blocking removes the friendship and silently prevents new requests", async () => {
    await as(B, () => db.exec(`select public.block_user('${A}')`));
    expect(await as(A, () => rows(`select * from public.list_friends()`))).toHaveLength(0);
    expect((await one(A, `select public.send_friend_request('${await code(B)}') as r`)).r).toBe("not_found");
    expect((await as(B, () => rows(`select user_id from public.list_blocked()`))).map((r) => r.user_id)).toEqual([A]);
    await as(B, () => db.exec(`delete from public.blocks where blocked = '${A}'`));
    expect((await one(A, `select public.send_friend_request('${await code(B)}') as r`)).r).toBe("sent");
  });
});

describe("activity feed and chat", () => {
  const one = async (uid: string, sql: string) => (await as(uid, () => rows(sql)))[0];
  const befriend = async (x: string, y: string) => {
    const code = (await rows(`select friend_code from public.profiles where id = $1`, [y]))[0].friend_code;
    await one(x, `select public.send_friend_request('${code}') as r`);
    const f = await one(y, `select id from public.list_friends() where friend_id = '${x}'`);
    if (f) await as(y, () => db.exec(`select public.respond_friend_request('${f.id}', true)`));
  };

  it("feed shows friends' workouts only", async () => {
    await befriend(A, B); // re-friend (previous suite unfriended/blocked them)
    const feedB = await as(B, () => rows(`select user_id from public.friends_feed(30)`));
    expect(feedB.map((r) => r.user_id)).toContain(A);
    expect(await as(ADMIN, () => rows(`select * from public.friends_feed(30)`))).toHaveLength(0);
  });

  it("direct chat between friends; outsiders can't read or post", async () => {
    const { cid } = await one(A, `select public.get_or_create_direct('${B}') as cid`);
    const again = await one(B, `select public.get_or_create_direct('${A}') as cid`);
    expect(again.cid).toBe(cid);
    await as(A, () => db.exec(`insert into public.messages (conversation_id, body) values ('${cid}', 'Halo!')`));
    const inbox = await one(B, `select title, unread, last_body from public.list_conversations()`);
    expect(inbox).toMatchObject({ unread: 1, last_body: "Halo!" });
    await as(B, () => db.exec(`select public.mark_conversation_read('${cid}')`));
    expect((await one(B, `select unread from public.list_conversations()`)).unread).toBe(0);
    expect(await as(ADMIN, () => rows(`select * from public.messages`))).toHaveLength(0);
    await expect(as(ADMIN, () => db.exec(`insert into public.messages (conversation_id, body) values ('${cid}', 'spam')`))).rejects.toThrow(
      /row-level security/,
    );
    await expect(as(ADMIN, () => db.exec(`select public.get_or_create_direct('${A}')`))).rejects.toThrow(/not friends/);
    // Push queued for the recipient.
    const [n] = await rows(`select count(*)::int as n from public.notifications_outbox where user_id = $1 and kind = 'message'`, [B]);
    expect(n.n).toBe(1);
  });

  it("blocking stops direct messages", async () => {
    const { cid } = await one(A, `select public.get_or_create_direct('${B}') as cid`);
    await as(B, () => db.exec(`select public.block_user('${A}')`));
    await expect(as(A, () => db.exec(`insert into public.messages (conversation_id, body) values ('${cid}', 'hey')`))).rejects.toThrow(
      /row-level security/,
    );
    await as(B, () => db.exec(`delete from public.blocks where blocked = '${A}'`));
  });

  it("group chat: only the creator's friends get added; members can leave", async () => {
    await befriend(A, B);
    const { cid } = await one(A, `select public.create_group_chat('Gym Squad', array['${B}', '${ADMIN}']::uuid[]) as cid`);
    const members = await as(A, () => rows(`select user_id from public.conversation_members_info('${cid}')`));
    expect(members.map((m) => m.user_id).sort()).toEqual([A, B].sort());
    await as(B, () => db.exec(`insert into public.messages (conversation_id, body) values ('${cid}', 'Leg day?')`));
    expect(await as(A, () => rows(`select body from public.messages where conversation_id = '${cid}'`))).toHaveLength(1);
    await as(B, () => db.exec(`delete from public.conversation_members where conversation_id = '${cid}' and user_id = '${B}'`));
    expect(await as(B, () => rows(`select * from public.messages where conversation_id = '${cid}'`))).toHaveLength(0);
  });
});
