"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Copy, EyeOff, Share2, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/avatar";
import { Card, EmptyState, Field, LinkButton, PageHeader, Section } from "@/components/common";
import { useAuth, useProfile } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listFriends, respondFriendRequest, sendFriendRequest, type FriendRow } from "@/lib/data/friends";
import { useOnline } from "@/lib/hooks";

export default function FriendsPage() {
  const t = useTranslations("friends");
  const { mode, guest } = useAuth();
  const online = useOnline();
  if (mode !== "supabase" || guest) {
    return (
      <div className="space-y-4">
        <PageHeader back="/profile" title={t("title")} />
        <EmptyState action={<LinkButton href="/login">{t("signUp")}</LinkButton>}>{t("needAccount")}</EmptyState>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader back="/profile" title={t("title")} />
      {!online ? <EmptyState>{t("needOnline")}</EmptyState> : <FriendsContent />}
    </div>
  );
}

function FriendsContent() {
  const t = useTranslations("friends");
  const qc = useQueryClient();
  const profile = useProfile();
  const list = useQuery({ queryKey: ["friends"], queryFn: listFriends });
  const [code, setCode] = useState("");

  // Invite links look like /friends?add=GT-XXXXXX
  useEffect(() => {
    const add = new URLSearchParams(window.location.search).get("add");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill from the invite link once
    if (add) setCode(add.toUpperCase());
  }, []);

  const send = useMutation({
    mutationFn: () => sendFriendRequest(code),
    onSuccess: (r) => {
      if (r === "sent" || r === "accepted") {
        toast.success(t(`result.${r}`));
        setCode("");
      } else toast.error(t(`result.${r}`));
      void qc.invalidateQueries({ queryKey: ["friends"] });
    },
    onError: () => toast.error(t("error")),
  });
  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => respondFriendRequest(id, accept),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["friends"] }),
  });

  const myCode = profile?.friend_code ?? null;
  const inviteUrl = myCode ? `${window.location.origin}/friends?add=${myCode}` : "";
  const share = async () => {
    if (!myCode) return;
    try {
      if (navigator.share) await navigator.share({ title: "GymTrack", text: t("shareText", { code: myCode }), url: inviteUrl });
      else {
        await navigator.clipboard.writeText(inviteUrl);
        toast.success(t("linkCopied"));
      }
    } catch {}
  };

  const incoming = list.data?.filter((f) => f.status === "pending" && f.incoming) ?? [];
  const outgoing = list.data?.filter((f) => f.status === "pending" && !f.incoming) ?? [];
  const friends = list.data?.filter((f) => f.status === "accepted") ?? [];

  return (
    <>
      <Card className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("yourCode")}</p>
        <div className="flex items-center gap-2">
          <p className="num flex-1 text-3xl tracking-wider">{myCode ?? "…"}</p>
          <Button
            variant="secondary"
            size="icon"
            aria-label={t("copyCode")}
            disabled={!myCode}
            onClick={async () => {
              await navigator.clipboard.writeText(myCode!);
              toast.success(t("codeCopied"));
            }}
          >
            <Copy />
          </Button>
          <Button size="icon" aria-label={t("share")} disabled={!myCode} onClick={share}>
            <Share2 />
          </Button>
        </div>
        {profile?.share_progress === false && (
          <p className="flex items-start gap-2 rounded-lg bg-muted p-2 text-xs text-muted-foreground">
            <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden /> {t("hiddenNote")}{" "}
            <Link href="/profile#privacy" className="font-semibold text-primary underline-offset-2 hover:underline">
              {t("privacySettings")}
            </Link>
          </p>
        )}
      </Card>

      <Card>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim().length >= 6) send.mutate();
          }}
        >
          <div className="flex-1">
            <Field label={t("addByCode")} htmlFor="friend-code">
              <Input id="friend-code" value={code} placeholder="GT-XXXXXX" autoCapitalize="characters" className="num tracking-wider" onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </Field>
          </div>
          <Button type="submit" disabled={code.trim().length < 6 || send.isPending}>
            <UserPlus aria-hidden /> {t("add")}
          </Button>
        </form>
      </Card>

      {incoming.length > 0 && (
        <Section title={t("requests")}>
          <ul className="space-y-2">
            {incoming.map((f) => (
              <li key={f.id} className="flex items-center gap-3 rounded-2xl border border-primary/50 bg-card p-3">
                <Avatar url={f.avatar_url} name={f.display_name ?? "?"} className="size-11 text-lg" />
                <span className="min-w-0 flex-1 truncate font-semibold">{f.display_name ?? t("noName")}</span>
                <Button size="icon" variant="secondary" aria-label={t("decline")} onClick={() => respond.mutate({ id: f.id, accept: false })}>
                  <X />
                </Button>
                <Button size="icon" aria-label={t("accept")} onClick={() => respond.mutate({ id: f.id, accept: true })}>
                  <Check />
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={t("friendsTitle", { count: friends.length })}>
        {list.isSuccess && !friends.length ? (
          <EmptyState>{t("empty")}</EmptyState>
        ) : (
          <ul className="space-y-2">
            {friends.map((f) => (
              <FriendItem key={f.id} f={f} />
            ))}
          </ul>
        )}
      </Section>

      {outgoing.length > 0 && (
        <Section title={t("sent")}>
          <ul className="space-y-2">
            {outgoing.map((f) => (
              <li key={f.id} className="flex items-center gap-3 rounded-2xl border bg-card p-3 opacity-80">
                <Avatar url={f.avatar_url} name={f.display_name ?? "?"} className="size-11 text-lg" />
                <span className="min-w-0 flex-1 truncate">{f.display_name ?? t("noName")}</span>
                <span className="text-xs text-muted-foreground">{t("waiting")}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

function FriendItem({ f }: { f: FriendRow }) {
  const t = useTranslations("friends");
  return (
    <li>
      <Link href={`/friends/view?id=${f.friend_id}`} className="flex items-center gap-3 rounded-2xl border bg-card p-3">
        <Avatar url={f.avatar_url} name={f.display_name ?? "?"} className="size-11 text-lg" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{f.display_name ?? t("noName")}</span>
          {!f.can_view && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <EyeOff className="size-3" aria-hidden /> {t("progressHidden")}
            </span>
          )}
        </span>
        <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}
