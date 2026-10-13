import { alive, db } from "@/lib/db/local";
import { isSyncEnabled, newId, nowIso, requireUserId } from "@/lib/db/session";
import { saveRow, softDelete } from "@/lib/db/write";
import { getSupabase } from "@/lib/supabase/client";
import type { Pose, ProgressPhoto } from "@/lib/types";

export const PHOTO_BUCKET = "progress-photos";
const MAX_EDGE = 1600;

/** Downscale and re-encode to JPEG; strips EXIF (incl. GPS) as a side effect. */
export async function compressImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.85),
  );
}

export async function countPhotos(): Promise<number> {
  return (await db.progress_photos.toArray()).filter(alive).length;
}

/** Store locally first (works offline), then upload when possible. */
export async function addPhoto(file: File, date: string, pose: Pose): Promise<string> {
  const userId = requireUserId();
  const id = newId();
  const blob = await compressImage(file);
  const row: ProgressPhoto = {
    id,
    user_id: userId,
    date,
    pose,
    storage_path: `${userId}/${id}.jpg`,
    updated_at: nowIso(),
    deleted_at: null,
  };
  await db.photo_blobs.put({ id, blob, pending_upload: isSyncEnabled() });
  await saveRow("progress_photos", row);
  void uploadPendingPhotos();
  return id;
}

let uploading = false;

export async function uploadPendingPhotos() {
  if (uploading || !isSyncEnabled() || !navigator.onLine) return;
  uploading = true;
  try {
    const pending = (await db.photo_blobs.toArray()).filter((b) => b.pending_upload);
    for (const p of pending) {
      const row = await db.progress_photos.get(p.id);
      if (!alive(row)) {
        await db.photo_blobs.delete(p.id);
        continue;
      }
      const { error } = await (await getSupabase())
        .storage.from(PHOTO_BUCKET)
        .upload(row.storage_path, p.blob, { contentType: "image/jpeg", upsert: true });
      if (error) break;
      await db.photo_blobs.update(p.id, { pending_upload: false });
    }
  } finally {
    uploading = false;
  }
}

export async function deletePhoto(photo: ProgressPhoto) {
  await softDelete("progress_photos", [photo.id]);
  await db.photo_blobs.delete(photo.id);
  if (isSyncEnabled() && navigator.onLine) {
    await (await getSupabase()).storage.from(PHOTO_BUCKET).remove([photo.storage_path]);
  }
}

/** Local blob if we have one, otherwise a short-lived signed URL (private bucket). */
export async function photoUrl(photo: ProgressPhoto): Promise<string | null> {
  const local = await db.photo_blobs.get(photo.id);
  if (local) return URL.createObjectURL(local.blob);
  if (!isSyncEnabled()) return null;
  const { data } = await (await getSupabase()).storage.from(PHOTO_BUCKET).createSignedUrl(photo.storage_path, 60 * 10);
  return data?.signedUrl ?? null;
}
