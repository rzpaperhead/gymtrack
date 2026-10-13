import en from "@/messages/en.json";
import id from "@/messages/id.json";
import type { Locale } from "@/lib/types";

export const LOCALES: Locale[] = ["id", "en"];
export const DEFAULT_LOCALE: Locale = "id";
export const LOCALE_LABELS: Record<Locale, string> = { id: "Bahasa Indonesia", en: "English" };
/** BCP-47 tags used for number/date formatting. */
export const INTL_LOCALE: Record<Locale, string> = { id: "id-ID", en: "en-US" };

export type Messages = typeof id;

export function messagesFor(locale: Locale): Messages {
  return locale === "en" ? en : id;
}

export function isLocale(v: unknown): v is Locale {
  return v === "id" || v === "en";
}
