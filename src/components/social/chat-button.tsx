"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useInbox } from "@/lib/chat-hooks";

/** Chat shortcut with unread badge (accounts only). */
export function ChatButton() {
  const t = useTranslations("chat");
  const { enabled, unread } = useInbox();
  if (!enabled) return null;
  return (
    <Link href="/chat" className="relative flex size-12 items-center justify-center rounded-full border bg-card" aria-label={unread ? t("titleUnread", { count: unread }) : t("title")}>
      <MessageCircle className="size-6" aria-hidden />
      {unread > 0 && (
        <span className="num absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs text-primary-foreground" aria-hidden>
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
