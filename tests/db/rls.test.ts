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
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
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
  await db.exec(`insert into auth.users (id, email) values ('${A}', 'a@test.dev'), ('${B}', 'b@test.dev');`);
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
    expect(p).toHaveLength(2);
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
