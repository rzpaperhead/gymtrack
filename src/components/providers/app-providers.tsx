"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { AuthProvider } from "@/components/providers/auth-provider";

/**
 * Heavier providers (Supabase, IndexedDB, sync) — only for signed-in screens,
 * so the public landing page stays light.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  // TanStack Query handles server-only data (signed photo URLs, billing,
  // account actions). Training data is read live from IndexedDB instead.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 60_000, retry: 1, networkMode: "offlineFirst" } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
