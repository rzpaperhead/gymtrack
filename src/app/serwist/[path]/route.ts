import { createSerwistRoute } from "@serwist/turbopack";

const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_APP_VERSION ?? String(Date.now());

/**
 * App routes are client-rendered over IndexedDB, so their HTML is static and
 * safe to precache: the app opens and runs fully offline after the first visit.
 */
const APP_ROUTES = [
  "/",
  "/~offline",
  "/login",
  "/onboarding",
  "/home",
  "/workout",
  "/workout/active",
  "/workout/summary",
  "/workout/view",
  "/exercises",
  "/exercises/view",
  "/templates",
  "/templates/edit",
  "/programs",
  "/progress",
  "/body",
  "/profile",
  "/premium",
  "/admin",
  "/auth/reset",
  "/friends",
  "/friends/view",
];

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "src/app/sw.ts",
  // esbuild-wasm rejects Windows paths; the native binary works everywhere.
  useNativeEsbuild: true,
  additionalPrecacheEntries: APP_ROUTES.map((url) => ({ url, revision })),
});
