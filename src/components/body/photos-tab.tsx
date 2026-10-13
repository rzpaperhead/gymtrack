"use client";

import { useQuery } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { Camera, CloudOff, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog, EmptyState, Field, NativeSelect, PaywallCard, Section, Segmented } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dateKey } from "@/lib/calc/stats";
import { canCreate } from "@/lib/entitlements";
import { addPhoto, deletePhoto, photoUrl } from "@/lib/data/photos";
import { alive, db } from "@/lib/db/local";
import { useEntitlements } from "@/lib/hooks";
import { POSES, type Pose, type ProgressPhoto } from "@/lib/types";

function Photo({ photo, className }: { photo: ProgressPhoto; className?: string }) {
  const t = useTranslations("body");
  // Signed URLs come from the server, so they're cached through TanStack Query.
  const { data: url, isFetched } = useQuery({
    queryKey: ["photo-url", photo.id],
    queryFn: () => photoUrl(photo),
    staleTime: 5 * 60_000,
    gcTime: 9 * 60_000,
  });
  useEffect(() => () => {
    if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
  }, [url]);
  if (!url) {
    return (
      <div className={`flex aspect-[3/4] items-center justify-center rounded-xl bg-muted text-xs text-muted-foreground ${className ?? ""}`}>
        {isFetched ? (
          <span className="flex flex-col items-center gap-1 p-2 text-center">
            <CloudOff className="size-5" aria-hidden />
            {t("photoUnavailable")}
          </span>
        ) : null}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- private blob/signed URLs can't go through next/image
  return <img src={url} alt={`${t(`poses.${photo.pose}`)} · ${photo.date}`} className={`aspect-[3/4] w-full rounded-xl object-cover ${className ?? ""}`} />;
}

export function PhotosTab() {
  const t = useTranslations();
  const f = useFormatter();
  const ent = useEntitlements();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pose, setPose] = useState<Pose>("front");
  const [date, setDate] = useState(() => dateKey(new Date()));
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<ProgressPhoto | null>(null);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const photos = useLiveQuery(async () => (await db.progress_photos.toArray()).filter(alive).sort((a, b) => b.date.localeCompare(a.date)), []);

  if (!photos) return null;
  const allowed = canCreate(ent, "photos", photos.length);
  const dates = [...new Set(photos.map((p) => p.date))];
  const a = compareA || dates[dates.length - 1] || "";
  const b = compareB || dates[0] || "";
  const pick = (d: string) => photos.find((p) => p.date === d && p.pose === pose) ?? photos.find((p) => p.date === d);

  return (
    <div className="space-y-5">
      {allowed ? (
        <div className="space-y-3 rounded-2xl border bg-card p-4">
          <Segmented label={t("body.pose")} value={pose} onChange={setPose} options={POSES.map((p) => ({ value: p, label: t(`body.poses.${p}`) }))} />
          <Field label={t("common.date")} htmlFor="p-date">
            <Input id="p-date" type="date" value={date} max={dateKey(new Date())} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            aria-label={t("body.addPhoto")}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setBusy(true);
              try {
                await addPhoto(file, date, pose);
              } catch {
                toast.error(t("common.error"));
              } finally {
                setBusy(false);
              }
            }}
          />
          <Button size="lg" className="w-full" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Camera aria-hidden /> {busy ? t("body.uploading") : t("body.addPhoto")}
          </Button>
        </div>
      ) : (
        <PaywallCard reason={t("body.photoLimit", { max: ent.maxProgressPhotos })} />
      )}

      {!photos.length ? (
        <EmptyState>{t("body.noPhotos")}</EmptyState>
      ) : (
        <>
          {dates.length > 1 && (
            <Section title={t("body.compare")}>
              <p className="text-sm text-muted-foreground">{t("body.compareHint")}</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  [a, setCompareA],
                  [b, setCompareB],
                ].map(([d, set], i) => {
                  const p = pick(d as string);
                  return (
                    <div key={i} className="space-y-2">
                      <NativeSelect label={`${t("common.date")} ${i + 1}`} hideLabel value={d as string} onChange={set as (v: string) => void}>
                        {dates.map((x) => (
                          <option key={x} value={x}>
                            {f.dateTime(new Date(`${x}T12:00:00`), { dateStyle: "medium" })}
                          </option>
                        ))}
                      </NativeSelect>
                      {p && <Photo photo={p} />}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}
          <Section>
            <ul className="grid grid-cols-3 gap-2">
              {photos.map((p) => (
                <li key={p.id} className="relative">
                  <Photo photo={p} />
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between rounded-b-xl bg-black/60 px-2 py-1 text-[0.7rem] text-white">
                    <span>
                      {f.dateTime(new Date(`${p.date}T12:00:00`), { day: "numeric", month: "short" })} · {t(`body.poses.${p.pose}`)}
                    </span>
                    <button type="button" className="flex size-8 items-center justify-center" aria-label={t("common.delete")} onClick={() => setToDelete(p)}>
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t("common.delete")}
        description={t("body.deletePhotoConfirm")}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={() => deletePhoto(toDelete!)}
      />
    </div>
  );
}
