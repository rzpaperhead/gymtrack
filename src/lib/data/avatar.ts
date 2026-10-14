import { updateProfile } from "@/lib/data/profile";
import { isSyncEnabled, requireUserId } from "@/lib/db/session";
import { getSupabase } from "@/lib/supabase/client";

const SIZE = 256;

/** Square-crop and shrink to a small JPEG. */
async function avatarBlob(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bmp.close();
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.85));
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

/** Signed in: upload to the public `avatars` bucket. Demo mode: keep a small data URL. */
export async function setAvatar(file: File) {
  const blob = await avatarBlob(file);
  if (!isSyncEnabled()) return updateProfile({ avatar_url: await toDataUrl(blob) });
  const sb = await getSupabase();
  const path = `${requireUserId()}/avatar-${Date.now()}.jpg`;
  const { error } = await sb.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  const { data } = sb.storage.from("avatars").getPublicUrl(path);
  await updateProfile({ avatar_url: data.publicUrl });
}

export async function removeAvatar() {
  await updateProfile({ avatar_url: null });
}
