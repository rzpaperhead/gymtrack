import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { Providers } from "@/components/providers/providers";
import "./globals.css";

const sans = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
  // Body text renders fine in the fallback first; only the display face is preloaded.
  preload: false,
});

const display = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["700", "800"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "GymTrack — Catat latihan gym, offline", template: "%s · GymTrack" },
  description:
    "Pencatat latihan gym yang tetap jalan tanpa sinyal. Satu tap per set, rest timer otomatis, estimasi 1RM, dan rekor pribadi.",
  applicationName: "GymTrack",
  appleWebApp: { capable: true, title: "GymTrack", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: "GymTrack",
    title: "GymTrack — Catat latihan gym, offline",
    description: "Satu tap per set, rest timer otomatis, progres yang jelas.",
    locale: "id_ID",
    alternateLocale: ["en_US"],
  },
  icons: {
    icon: [{ url: "/icons/192", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0c0f" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${sans.variable} ${display.variable} dark h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
