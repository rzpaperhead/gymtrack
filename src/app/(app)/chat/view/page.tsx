"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Pencil, SendHorizontal, UserPlus, Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/avatar";
import { ConfirmDialog, EmptyState, Field, PageHeader } from "@/components/common";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addGroupMembers,
  leaveConversation,
  loadMessages,
  markRead,
  members as loadMembers,
  renameGroup,
  sendMessage,
  subscribeMessages,
  type Message,
} from "@/lib/data/chat";
import { listFriends } from "@/lib/data/friends";
import { useInbox } from "@/lib/chat-hooks";
import { useOnline } from "@/lib/hooks";
import { cn } from "@/lib/utils";

function Thread() {
  const id = useSearchParams().get("id") ?? "";
  const t = useTranslations("chat");
  const tc = useTranslations("common");
  const f = useFormatter();
  const router = useRouter();
  const qc = useQueryClient();
  const online = useOnline();
  const { userId } = useAuth();
  const inbox = useInbox();
  const conv = inbox.data?.find((c) => c.id === id);
  const memberList = useQuery({ queryKey: ["chat-members", id], queryFn: () => loadMembers(id), enabled: !!id && online });
  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState("");
  const [membersOpen, setMembersOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const nameOf = (uid: string) => memberList.data?.find((m) => m.user_id === uid)?.display_name ?? "—";
  const avatarOf = (uid: string) => memberList.data?.find((m) => m.user_id === uid)?.avatar_url ?? null;

  // Initial page + realtime.
  useEffect(() => {
    if (!id || !online) return;
    let off: (() => void) | undefined;
    let cancelled = false;
    void loadMessages(id).then((page) => {
      if (cancelled) return;
      setMessages(page);
      setHasMore(page.length === 50);
      setLoaded(true);
      void markRead(id).then(() => qc.invalidateQueries({ queryKey: ["inbox"] }));
    });
    void subscribeMessages(id, (m) => {
      setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
      if (document.visibilityState === "visible") void markRead(id);
    }).then((fn) => {
      if (cancelled) fn();
      else off = fn;
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, [id, online, qc]);

  useLayoutEffect(() => {
    if (stickToBottom.current) bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: (body: string) => sendMessage(id, body),
    onSuccess: (m) => setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m])),
    onError: () => toast.error(t("sendFailed")),
  });

  const submit = () => {
    const body = text.trim();
    if (!body || send.isPending) return;
    stickToBottom.current = true;
    setText("");
    send.mutate(body);
  };

  const older = async () => {
    stickToBottom.current = false;
    const page = await loadMessages(id, messages[0]?.created_at);
    setHasMore(page.length === 50);
    setMessages((cur) => [...page, ...cur]);
  };

  if (!online) return <EmptyState>{t("needOnline")}</EmptyState>;
  if (inbox.isSuccess && !conv) return <EmptyState>{t("notFound")}</EmptyState>;
  const isGroup = conv?.kind === "group";

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col">
      <PageHeader
        back="/chat"
        title={conv?.title ?? ""}
        actions={
          isGroup ? (
            <Button variant="ghost" size="icon" aria-label={t("members")} onClick={() => setMembersOpen(true)}>
              <Users />
            </Button>
          ) : null
        }
      />
      <div className="flex-1 space-y-2 pb-2" aria-live="polite" aria-label={t("messages")}>
        {hasMore && (
          <Button variant="ghost" size="sm" className="w-full" onClick={older}>
            {t("loadOlder")}
          </Button>
        )}
        {loaded && !messages.length && <p className="py-10 text-center text-sm text-muted-foreground">{t("startConversation")}</p>}
        {messages.map((m, i) => {
          const mine = m.sender_id === userId;
          const prev = messages[i - 1];
          const firstOfRun = !prev || prev.sender_id !== m.sender_id || Date.parse(m.created_at) - Date.parse(prev.created_at) > 5 * 60_000;
          return (
            <div key={m.id} className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
              {!mine && isGroup && (
                <span className="w-8 shrink-0">{firstOfRun && <Avatar url={avatarOf(m.sender_id)} name={nameOf(m.sender_id)} className="size-8 text-xs" />}</span>
              )}
              <div className={cn("max-w-[78%] rounded-2xl px-3 py-2", mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-card border")}>
                {!mine && isGroup && firstOfRun && <p className="text-xs font-semibold text-chart-2">{nameOf(m.sender_id)}</p>}
                <p className="text-[0.95rem] break-words whitespace-pre-wrap">{m.body}</p>
                <time className={cn("block text-right text-[0.65rem]", mine ? "text-primary-foreground/70" : "text-muted-foreground")} dateTime={m.created_at}>
                  {f.dateTime(new Date(m.created_at), { hour: "2-digit", minute: "2-digit" })}
                </time>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      <form
        className="pb-safe sticky bottom-24 z-10 -mx-4 flex items-end gap-2 border-t bg-background/95 px-4 py-2 backdrop-blur"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Textarea
          aria-label={t("typeMessage")}
          placeholder={t("typeMessage")}
          value={text}
          maxLength={2000}
          rows={1}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-32 min-h-11 flex-1 resize-none"
        />
        <Button type="submit" size="icon" aria-label={t("send")} disabled={!text.trim() || send.isPending}>
          <SendHorizontal />
        </Button>
      </form>

      {isGroup && (
        <GroupMembersDialog
          open={membersOpen}
          onOpenChange={setMembersOpen}
          conversationId={id}
          title={conv?.title ?? ""}
          onLeave={() => {
            setMembersOpen(false);
            setLeaveOpen(true);
          }}
        />
      )}
      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title={t("leaveGroup")}
        description={t("leaveConfirm")}
        confirmLabel={t("leaveGroup")}
        destructive
        onConfirm={async () => {
          await leaveConversation(id, userId!);
          void qc.invalidateQueries({ queryKey: ["inbox"] });
          router.replace("/chat");
        }}
      />
      <span className="sr-only">{tc("loading")}</span>
    </div>
  );
}

function GroupMembersDialog({
  open,
  onOpenChange,
  conversationId,
  title,
  onLeave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  conversationId: string;
  title: string;
  onLeave: () => void;
}) {
  const t = useTranslations("chat");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const memberList = useQuery({ queryKey: ["chat-members", conversationId], queryFn: () => loadMembers(conversationId) });
  const friends = useQuery({ queryKey: ["friends"], queryFn: listFriends, enabled: open });
  const [name, setName] = useState(title);
  const [adding, setAdding] = useState(false);
  const inGroup = new Set(memberList.data?.map((m) => m.user_id));
  const candidates = friends.data?.filter((f) => f.status === "accepted" && !inGroup.has(f.friend_id)) ?? [];
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["chat-members", conversationId] });
    void qc.invalidateQueries({ queryKey: ["inbox"] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" closeLabel={tc("close")}>
        <DialogHeader>
          <DialogTitle>{t("members")}</DialogTitle>
        </DialogHeader>
        <form
          className="flex items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            await renameGroup(conversationId, name);
            refresh();
            toast.success(tc("saved"));
          }}
        >
          <div className="flex-1">
            <Field label={t("groupName")} htmlFor="rename">
              <Input id="rename" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <Button type="submit" variant="secondary" size="icon" aria-label={t("rename")}>
            <Pencil />
          </Button>
        </form>
        <ul className="space-y-1">
          {memberList.data?.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3">
              <Avatar url={m.avatar_url} name={m.display_name} className="size-9 text-sm" />
              <span className="flex-1 truncate">{m.display_name}</span>
              {m.role === "owner" && <span className="text-xs text-muted-foreground">{t("owner")}</span>}
            </li>
          ))}
        </ul>
        {adding ? (
          <ul className="space-y-1 border-t pt-2">
            {!candidates.length && <li className="text-sm text-muted-foreground">{t("noMoreFriends")}</li>}
            {candidates.map((f) => (
              <li key={f.friend_id}>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-1 text-left hover:bg-muted"
                  onClick={async () => {
                    await addGroupMembers(conversationId, [f.friend_id]);
                    refresh();
                  }}
                >
                  <Avatar url={f.avatar_url} name={f.display_name ?? "?"} className="size-9 text-sm" />
                  <span className="flex-1 truncate">{f.display_name ?? "—"}</span>
                  <UserPlus className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <UserPlus aria-hidden /> {t("addMembers")}
          </Button>
        )}
        <DialogFooter>
          <Button variant="ghost" className="text-destructive" onClick={onLeave}>
            <LogOut aria-hidden /> {t("leaveGroup")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ChatThreadPage() {
  return (
    <Suspense>
      <Thread />
    </Suspense>
  );
}
