"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { listBlocked, unblockUser } from "@/lib/data/friends";
import { useOnline } from "@/lib/hooks";

export function BlockedUsers() {
  const t = useTranslations("privacy");
  const online = useOnline();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["blocked"], queryFn: listBlocked, enabled: online });
  const unblock = useMutation({ mutationFn: unblockUser, onSuccess: () => qc.invalidateQueries({ queryKey: ["blocked"] }) });
  if (!q.data?.length) return null;
  return (
    <details className="border-t pt-2">
      <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">{t("blockedUsers", { count: q.data.length })}</summary>
      <ul className="space-y-1">
        {q.data.map((b) => (
          <li key={b.user_id} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{b.display_name}</span>
            <Button size="sm" variant="ghost" onClick={() => unblock.mutate(b.user_id)}>
              {t("unblock")}
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}
