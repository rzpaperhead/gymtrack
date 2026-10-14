"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { MessageSquarePlus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/avatar";
import { EmptyState, Field, LinkButton, PageHeader } from "@/components/common";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useInbox } from "@/lib/chat-hooks";
import { createGroup, openDirect } from "@/lib/data/chat";
import { listFriends } from "@/lib/data/friends";
import { useOnline } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export default function ChatInboxPage() {
  const t = useTranslations("chat");
  const f = useFormatter();
  const { mode, guest } = useAuth();
  const online = useOnline();
  const inbox = useInbox();
  const [picker, setPicker] = useState<"direct" | "group" | null>(null);

  if (mode !== "supabase" || guest) {
    return (
      <div className="space-y-4">
        <PageHeader back="/home" title={t("title")} />
        <EmptyState action={<LinkButton href="/login">{t("signUp")}</LinkButton>}>{t("needAccount")}</EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        back="/home"
        title={t("title")}
        actions={
          <>
            <Button size="icon" variant="ghost" aria-label={t("newGroup")} onClick={() => setPicker("group")} disabled={!online}>
              <Users />
            </Button>
            <Button size="icon" aria-label={t("newChat")} onClick={() => setPicker("direct")} disabled={!online}>
              <MessageSquarePlus />
            </Button>
          </>
        }
      />
      {!online && <EmptyState>{t("needOnline")}</EmptyState>}
      {inbox.isSuccess && !inbox.data.length && <EmptyState>{t("empty")}</EmptyState>}
      <ul className="divide-y rounded-2xl border bg-card">
        {inbox.data?.map((c) => (
          <li key={c.id}>
            <Link href={`/chat/view?id=${c.id}`} className="flex items-center gap-3 p-3 outline-none focus-visible:bg-muted">
              {c.kind === "group" ? (
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary" aria-hidden>
                  <Users className="size-5" />
                </span>
              ) : (
                <Avatar url={c.avatar_url} name={c.title ?? "?"} className="size-12 text-lg" />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={cn("min-w-0 flex-1 truncate", c.unread ? "font-bold" : "font-semibold")}>
                    {c.title ?? "—"}
                    {c.kind === "group" && <span className="ml-1 text-xs font-normal text-muted-foreground">· {c.member_count}</span>}
                  </span>
                  <time className="shrink-0 text-xs text-muted-foreground" dateTime={c.last_message_at}>
                    {f.relativeTime(new Date(c.last_message_at))}
                  </time>
                </span>
                <span className={cn("block truncate text-sm", c.unread ? "text-foreground" : "text-muted-foreground")}>
                  {c.last_body ? `${c.last_sender ? `${c.last_sender}: ` : `${t("you")}: `}${c.last_body}` : t("noMessages")}
                </span>
              </span>
              {c.unread > 0 && (
                <span className="num flex min-w-6 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-sm text-primary-foreground">
                  {c.unread > 99 ? "99+" : c.unread}
                  <span className="sr-only"> {t("unread")}</span>
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {picker && <NewChatDialog kind={picker} onClose={() => setPicker(null)} />}
    </div>
  );
}

function NewChatDialog({ kind, onClose }: { kind: "direct" | "group"; onClose: () => void }) {
  const t = useTranslations("chat");
  const tc = useTranslations("common");
  const router = useRouter();
  const friends = useQuery({ queryKey: ["friends"], queryFn: listFriends });
  const accepted = friends.data?.filter((f) => f.status === "accepted") ?? [];
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const go = useMutation({
    mutationFn: async (friendId?: string) => (kind === "direct" ? openDirect(friendId!) : createGroup(title, picked)),
    onSuccess: (id) => router.push(`/chat/view?id=${id}`),
    onError: () => toast.error(tc("error")),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" closeLabel={tc("close")}>
        <DialogHeader>
          <DialogTitle>{kind === "direct" ? t("newChat") : t("newGroup")}</DialogTitle>
        </DialogHeader>
        {kind === "group" && (
          <Field label={t("groupName")} htmlFor="group-title">
            <Input id="group-title" value={title} maxLength={60} placeholder={t("groupNamePlaceholder")} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        )}
        {!accepted.length ? (
          <EmptyState action={<LinkButton href="/friends">{t("addFriends")}</LinkButton>}>{t("noFriends")}</EmptyState>
        ) : (
          <ul className="space-y-1">
            {accepted.map((f) => {
              const on = picked.includes(f.friend_id);
              return (
                <li key={f.friend_id}>
                  <button
                    type="button"
                    aria-pressed={kind === "group" ? on : undefined}
                    disabled={go.isPending}
                    onClick={() => (kind === "direct" ? go.mutate(f.friend_id) : setPicked(on ? picked.filter((x) => x !== f.friend_id) : [...picked, f.friend_id]))}
                    className={cn("flex min-h-14 w-full items-center gap-3 rounded-xl px-2 text-left", on && "bg-accent/50")}
                  >
                    <Avatar url={f.avatar_url} name={f.display_name ?? "?"} className="size-10 text-base" />
                    <span className="flex-1 truncate font-semibold">{f.display_name ?? "—"}</span>
                    {kind === "group" && (
                      <span className={cn("size-6 rounded-full border-2", on ? "border-primary bg-primary" : "border-muted-foreground/40")} aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {kind === "group" && (
          <DialogFooter>
            <Button size="lg" disabled={!title.trim() || !picked.length || go.isPending} onClick={() => go.mutate(undefined)}>
              {t("createGroup", { count: picked.length })}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
