"use client";

import { cn } from "@/lib/utils";

export function Avatar({ url, name, className }: { url?: string | null; name: string; className?: string }) {
  return (
    <span
      className={cn("flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-2xl font-extrabold text-primary-foreground", className)}
      aria-hidden
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatar is a data URL or public storage URL
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        (name || "G").slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
