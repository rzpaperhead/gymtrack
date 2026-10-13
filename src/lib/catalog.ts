"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { BUILTIN_EXERCISES } from "@/lib/exercises/seed-data";
import { alive, db } from "@/lib/db/local";
import { BUILTIN_TEMPLATE_EXERCISES, BUILTIN_TEMPLATES } from "@/lib/templates/builtin";
import type { Exercise, Locale, Template, TemplateExercise } from "@/lib/types";

const BUILTIN_EX_BY_ID = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]));

export function exerciseName(e: Pick<Exercise, "name_id" | "name_en"> | undefined, locale: string): string {
  if (!e) return "—";
  return (locale as Locale) === "en" ? e.name_en : e.name_id;
}

export function templateName(t: Pick<Template, "name" | "name_en"> | undefined, locale: string): string {
  if (!t) return "—";
  return locale === "en" && t.name_en ? t.name_en : t.name;
}

export async function loadExercises(): Promise<Exercise[]> {
  const custom = (await db.exercises.toArray()).filter(alive);
  return [...BUILTIN_EXERCISES, ...custom];
}

export async function getExercise(id: string): Promise<Exercise | undefined> {
  return BUILTIN_EX_BY_ID.get(id) ?? (await db.exercises.get(id));
}

export interface Catalog {
  list: Exercise[];
  byId: Map<string, Exercise>;
  customCount: number;
}

/** Built-in + the user's custom exercises (deleted ones still resolvable by id for history). */
export function useExerciseCatalog(): Catalog | undefined {
  const custom = useLiveQuery(() => db.exercises.toArray(), []);
  return useMemo(() => {
    if (!custom) return undefined;
    const live = custom.filter(alive);
    const byId = new Map<string, Exercise>(BUILTIN_EX_BY_ID);
    for (const c of custom) byId.set(c.id, c);
    return { list: [...BUILTIN_EXERCISES, ...live], byId, customCount: live.length };
  }, [custom]);
}

export interface TemplateWithItems {
  template: Template;
  items: TemplateExercise[];
  builtin: boolean;
}

export async function getTemplate(id: string): Promise<TemplateWithItems | undefined> {
  const b = BUILTIN_TEMPLATES.find((t) => t.id === id);
  if (b) {
    return { template: b, items: BUILTIN_TEMPLATE_EXERCISES.filter((i) => i.template_id === id), builtin: true };
  }
  const t = await db.templates.get(id);
  if (!alive(t)) return undefined;
  const items = (await db.template_exercises.where("template_id").equals(id).toArray())
    .filter(alive)
    .sort((a, b) => a.position - b.position);
  return { template: t, items, builtin: false };
}

export function useTemplates(): { builtin: TemplateWithItems[]; mine: TemplateWithItems[] } | undefined {
  const data = useLiveQuery(async () => {
    const [ts, items] = await Promise.all([db.templates.toArray(), db.template_exercises.toArray()]);
    return { ts: ts.filter(alive), items: items.filter(alive) };
  }, []);
  return useMemo(() => {
    if (!data) return undefined;
    const builtin = BUILTIN_TEMPLATES.map((t) => ({
      template: t,
      items: BUILTIN_TEMPLATE_EXERCISES.filter((i) => i.template_id === t.id),
      builtin: true,
    }));
    const mine = data.ts
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => ({
        template: t,
        items: data.items.filter((i) => i.template_id === t.id).sort((a, b) => a.position - b.position),
        builtin: false,
      }));
    return { builtin, mine };
  }, [data]);
}

export function findTemplateSync(id: string | null | undefined, mine: Template[] = []): Template | undefined {
  if (!id) return undefined;
  return BUILTIN_TEMPLATES.find((t) => t.id === id) ?? mine.find((t) => t.id === id);
}
