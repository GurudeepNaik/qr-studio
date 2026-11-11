import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "QR Studio",
    short_name: "QR Studio",
    description: "UPI and link QR codes, made on your phone.",
    start_url: "/",
    display: "standalone",
    // Lets QR Studio appear in Android's share sheet (e.g. Share from Google Maps) once installed.
    share_target: { action: "/", method: "GET", params: { title: "title", text: "text", url: "url" } },
    background_color: "#f7f7f4",
    theme_color: "#1d5fd1",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
