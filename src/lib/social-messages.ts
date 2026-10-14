import type { PushMessage } from "@/lib/push-server";

/** Server-side text for queued social notifications, by the recipient's language. */

type Payload = Record<string, string | number | null | undefined>;

const T = {
  id: {
    friend_request: (p: Payload) => ({ title: "Permintaan pertemanan", body: `${p.from} ingin berteman denganmu di GymTrack.`, url: "/friends" }),
    friend_accepted: (p: Payload) => ({ title: "Kalian sekarang berteman 🤝", body: `${p.from} menerima permintaan pertemananmu.`, url: "/friends" }),
    friend_pr: (p: Payload) => ({
      title: `${p.from} mencetak PR baru! 🏆`,
      body: Number(p.count) > 1 ? `${p.exercise_id} dan ${Number(p.count) - 1} rekor lainnya. Beri semangat!` : `${p.exercise_id}. Beri semangat!`,
      url: "/friends",
    }),
    kudos: (p: Payload) => ({ title: `${p.from} memberi ${p.emoji}`, body: "untuk latihanmu. Terus semangat!", url: "/workout" }),
    challenge_invite: (p: Payload) => ({ title: `${p.from} mengajakmu ikut tantangan`, body: `"${p.title}" — buka GymTrack untuk bergabung.`, url: "/friends?tab=challenges" }),
    message: (p: Payload) => ({ title: p.group ? `${p.group}` : `${p.from}`, body: p.group ? `${p.from}: ${p.body}` : `${p.body}`, url: `/chat/view?id=${p.conversation_id}` }),
  },
  en: {
    friend_request: (p: Payload) => ({ title: "Friend request", body: `${p.from} wants to be friends on GymTrack.`, url: "/friends" }),
    friend_accepted: (p: Payload) => ({ title: "You're now friends 🤝", body: `${p.from} accepted your friend request.`, url: "/friends" }),
    friend_pr: (p: Payload) => ({
      title: `${p.from} hit a new PR! 🏆`,
      body: Number(p.count) > 1 ? `${p.exercise_en} and ${Number(p.count) - 1} more. Cheer them on!` : `${p.exercise_en}. Cheer them on!`,
      url: "/friends",
    }),
    kudos: (p: Payload) => ({ title: `${p.from} sent you ${p.emoji}`, body: "for your workout. Keep it up!", url: "/workout" }),
    challenge_invite: (p: Payload) => ({ title: `${p.from} invited you to a challenge`, body: `"${p.title}" — open GymTrack to join.`, url: "/friends?tab=challenges" }),
    message: (p: Payload) => ({ title: p.group ? `${p.group}` : `${p.from}`, body: p.group ? `${p.from}: ${p.body}` : `${p.body}`, url: `/chat/view?id=${p.conversation_id}` }),
  },
} as const;

export type SocialKind = keyof (typeof T)["id"];

export function socialMessage(kind: SocialKind, payload: Payload, locale: string | null | undefined): PushMessage {
  const m = T[locale === "en" ? "en" : "id"][kind](payload);
  return { ...m, tag: kind };
}
