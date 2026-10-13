import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import id from "@/messages/id.json";

function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "ui" ? [] : sourceFiles(p);
    return /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("translations", () => {
  it("Indonesian and English have exactly the same keys", () => {
    expect(keys(en).sort()).toEqual(keys(id).sort());
  });

  it("no message is left empty", () => {
    for (const m of [id, en]) for (const k of keys(m)) expect(k.split(".").reduce((o: never, p) => o[p], m as never), k).not.toBe("");
  });

  it("every literal t('namespace.key') used in components exists", () => {
    const all = new Set(keys(id));
    const missing: string[] = [];
    for (const file of sourceFiles(join(__dirname, "..", "..", "src"))) {
      const src = readFileSync(file, "utf8");
      // useTranslations("ns") scopes plain t("key") calls; a file may use several namespaces.
      const namespaces = [...src.matchAll(/useTranslations\("([a-zA-Z]+)"\)/g)].map((m) => m[1]);
      for (const m of src.matchAll(/\bt\("([a-zA-Z0-9_.]+)"/g)) {
        const key = m[1];
        if (!all.has(key) && !namespaces.some((ns) => all.has(`${ns}.${key}`))) missing.push(`${file.split("src")[1]}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
