import { alive, db } from "@/lib/db/local";
import { newId, nowIso, requireUserId } from "@/lib/db/session";
import { saveRow, saveRows, softDelete } from "@/lib/db/write";
import { BUILTIN_PROGRAMS } from "@/lib/templates/builtin";
import type { Program, ProgramDay } from "@/lib/types";

async function deactivateAll(exceptId?: string) {
  const active = (await db.programs.toArray()).filter((p) => alive(p) && p.is_active && p.id !== exceptId);
  await saveRows(
    "programs",
    active.map((p) => ({ ...p, is_active: false })),
  );
}

async function replaceDays(programId: string, schedule: Record<number, string>) {
  const userId = requireUserId();
  const old = (await db.program_days.where("program_id").equals(programId).toArray()).filter(alive);
  await softDelete("program_days", old.map((d) => d.id));
  const days: ProgramDay[] = Object.entries(schedule)
    .filter(([, t]) => !!t)
    .map(([weekday, template_id]) => ({
      id: newId(),
      user_id: userId,
      program_id: programId,
      weekday: Number(weekday),
      template_id,
      updated_at: nowIso(),
      deleted_at: null,
    }));
  await saveRows("program_days", days);
}

/** Activate a built-in program (allowed on the free tier). Reuses an earlier copy if present. */
export async function activateBuiltinProgram(key: string, locale: string) {
  const def = BUILTIN_PROGRAMS.find((p) => p.key === key);
  if (!def) throw new Error("Unknown program");
  const existing = (await db.programs.toArray()).find((p) => alive(p) && p.builtin_key === key);
  const program: Program = existing
    ? { ...existing, is_active: true }
    : {
        id: newId(),
        user_id: requireUserId(),
        name: locale === "en" ? def.name_en : def.name_id,
        is_active: true,
        builtin_key: key,
        updated_at: nowIso(),
        deleted_at: null,
      };
  await deactivateAll(program.id);
  await saveRow("programs", program);
  if (!existing) await replaceDays(program.id, def.schedule);
  return program.id;
}

/** Create or update a custom (premium) program. */
export async function saveCustomProgram(input: { id?: string; name: string; schedule: Record<number, string>; activate: boolean }) {
  const existing = input.id ? await db.programs.get(input.id) : undefined;
  const program: Program = {
    id: existing?.id ?? newId(),
    user_id: requireUserId(),
    name: input.name.trim(),
    is_active: input.activate || !!existing?.is_active,
    builtin_key: null,
    updated_at: nowIso(),
    deleted_at: null,
  };
  if (program.is_active) await deactivateAll(program.id);
  await saveRow("programs", program);
  await replaceDays(program.id, input.schedule);
  return program.id;
}

export async function setProgramActive(id: string, active: boolean) {
  const p = await db.programs.get(id);
  if (!p) return;
  if (active) await deactivateAll(id);
  await saveRow("programs", { ...p, is_active: active });
}

export async function deleteProgram(id: string) {
  const days = await db.program_days.where("program_id").equals(id).toArray();
  await softDelete("program_days", days.map((d) => d.id));
  await softDelete("programs", [id]);
}

export async function getActiveProgram() {
  const program = (await db.programs.toArray()).find((p) => alive(p) && p.is_active);
  if (!program) return undefined;
  const days = (await db.program_days.where("program_id").equals(program.id).toArray()).filter(alive);
  return { program, days };
}
