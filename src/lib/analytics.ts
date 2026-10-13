/**
 * Product analytics wrapper. The provider is still undecided (BRIEF §12), so
 * every call goes through `track()` and providers are plugged in here.
 */

export type AnalyticsEvent =
  | "signup"
  | "onboarding_completed"
  | "workout_started"
  | "workout_completed"
  | "paywall_viewed"
  | "upgrade_started"
  | "upgrade";

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

export interface AnalyticsProvider {
  track(event: AnalyticsEvent, props: AnalyticsProps): void;
  identify?(userId: string): void;
}

const providers: AnalyticsProvider[] = [];

if (process.env.NODE_ENV === "development") {
  providers.push({
    track: (event, props) => console.debug("[analytics]", event, props),
  });
}

export function registerAnalyticsProvider(p: AnalyticsProvider) {
  providers.push(p);
}

export function track(event: AnalyticsEvent, props: AnalyticsProps = {}) {
  for (const p of providers) {
    try {
      p.track(event, props);
    } catch {
      // Analytics must never break the app.
    }
  }
}

export function identify(userId: string) {
  for (const p of providers) {
    try {
      p.identify?.(userId);
    } catch {}
  }
}
