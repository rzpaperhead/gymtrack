import { ImageResponse } from "next/og";

/** App icons rendered at build time (no binary assets to maintain). */
const SIZES = { "192": 192, "512": 512, maskable: 512, apple: 180 } as const;
type Name = keyof typeof SIZES;

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(SIZES).map((name) => ({ name }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const size = SIZES[name as Name] ?? 512;
  // Maskable icons need their content inside the central 80% safe zone.
  const pad = name === "maskable" ? 0.22 : 0.14;
  const bar = size * (1 - pad * 2);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0c0f" }}>
        <svg width={bar} height={bar} viewBox="0 0 24 24" fill="none" stroke="#c5f04a" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.4 14.4 9.6 9.6" />
          <path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z" />
          <path d="m21.5 21.5-1.4-1.4" />
          <path d="M3.9 3.9 2.5 2.5" />
          <path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
