import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "GymTrack",
    short_name: "GymTrack",
    description: "Catat latihan gym secepat mungkin, tetap jalan saat offline.",
    lang: "id",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0c0f",
    theme_color: "#0b0c0f",
    categories: ["health", "fitness", "sports"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Mulai latihan", short_name: "Latihan", url: "/workout", icons: [{ src: "/icons/192", sizes: "192x192" }] },
      { name: "Catat berat badan", short_name: "Berat", url: "/body", icons: [{ src: "/icons/192", sizes: "192x192" }] },
    ],
  };
}
