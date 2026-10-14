/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    // `/workout/view?id=…` etc. are one static page: ignore `id` when matching the
    // precache, but keep `_rsc` so RSC payload requests never get HTML.
    ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^id$/],
  },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

// Background rest alert sent by /api/push/dispatch. Skipped when the app is
// already on screen (it beeps/vibrates itself).
self.addEventListener("push", (event) => {
  const data = (() => {
    try {
      return event.data?.json() as { title: string; body: string; tag?: string };
    } catch {
      return null;
    }
  })();
  if (!data) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      if (clients.some((c) => (c as WindowClient).visibilityState === "visible")) return;
      return self.registration.showNotification(data.title, {
        body: data.body,
        tag: data.tag ?? "rest-timer",
        icon: "/icons/192",
        badge: "/icons/192",
        requireInteraction: false,
      });
    }),
  );
});

// Focus the app when the rest-timer notification is tapped.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const client = clients.find((c) => "focus" in c);
      return client ? client.focus() : self.clients.openWindow("/workout/active");
    }),
  );
});

serwist.addEventListeners();
