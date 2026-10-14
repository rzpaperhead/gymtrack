import { NextResponse } from "next/server";
import { MANUAL_PRICING } from "@/lib/entitlements";

/** USD→IDR rate, cached for 6 hours. Falls back to a fixed rate if the source is down. */
export const revalidate = 21600;

export async function GET() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { next: { revalidate } });
    const data = (await res.json()) as { result?: string; rates?: Record<string, number>; time_last_update_utc?: string };
    const rate = data.rates?.IDR;
    if (data.result === "success" && rate && rate > 1000) {
      return NextResponse.json({ rate, source: "open.er-api.com", updated: data.time_last_update_utc ?? null });
    }
  } catch {}
  return NextResponse.json({ rate: MANUAL_PRICING.fallbackUsdIdr, source: "fallback", updated: null });
}
