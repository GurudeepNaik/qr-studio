import localFont from "next/font/local";

// Bundled (Latin subset, variable weight) so builds never download fonts. Both are SIL Open Font License.
export const inter = localFont({ src: "./inter-latin.woff2", weight: "100 900", variable: "--font-inter", display: "swap" });
export const mono = localFont({ src: "./jetbrains-mono-latin.woff2", weight: "100 800", variable: "--font-mono-jb", display: "swap" });
