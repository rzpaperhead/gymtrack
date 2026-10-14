"use client";

import { useEffect, useState } from "react";

/**
 * Keep the screen on while a session runs. Browsers suspend web apps that are
 * backgrounded or have the screen off, so this is what keeps the rest timer and
 * its alert alive mid-workout. Re-acquired when the app comes back to front.
 */
export function useWakeLock(active: boolean): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || lock) return;
      try {
        lock = await navigator.wakeLock.request("screen");
        if (cancelled) return void lock.release();
        setHeld(true);
        lock.addEventListener("release", () => {
          lock = null;
          setHeld(false);
        });
      } catch {
        setHeld(false);
      }
    };
    void acquire();
    const onVisible = () => void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [active]);
  return held;
}
