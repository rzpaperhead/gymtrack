import { NextResponse } from "next/server";
import { adminClient, userFromRequest } from "@/lib/supabase/server";

const BUCKET = "progress-photos";

/**
 * Delete the caller's account: photos in Storage first, then the auth user —
 * every table references auth.users with ON DELETE CASCADE.
 */
export async function DELETE(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = adminClient();

  for (;;) {
    const { data: files, error } = await db.storage.from(BUCKET).list(user.id, { limit: 1000 });
    if (error) return NextResponse.json({ error: "storage_list_failed" }, { status: 500 });
    if (!files?.length) break;
    const { error: rmError } = await db.storage.from(BUCKET).remove(files.map((f) => `${user.id}/${f.name}`));
    if (rmError) return NextResponse.json({ error: "storage_remove_failed" }, { status: 500 });
    if (files.length < 1000) break;
  }

  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
