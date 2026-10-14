"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { listConversations, subscribeInbox } from "@/lib/data/chat";
import { useOnline } from "@/lib/hooks";

/** Inbox query kept fresh by realtime; also gives the total unread count. */
export function useInbox() {
  const { mode, guest, status } = useAuth();
  const online = useOnline();
  const enabled = mode === "supabase" && !guest && status === "signed_in" && online;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["inbox"], queryFn: listConversations, enabled, refetchInterval: 120_000 });
  useEffect(() => {
    if (!enabled) return;
    let off: (() => void) | undefined;
    let cancelled = false;
    void subscribeInbox(() => void qc.invalidateQueries({ queryKey: ["inbox"] })).then((fn) => {
      if (cancelled) fn();
      else off = fn;
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, [enabled, qc]);
  return { ...q, enabled, unread: q.data?.reduce((a, c) => a + c.unread, 0) ?? 0 };
}
