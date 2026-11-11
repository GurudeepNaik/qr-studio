import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { inter, mono } from "./fonts";
import "./globals.css";

const url = "https://gurudeep-qr.vercel.app";
const description = "Turn a UPI ID, shop location, WhatsApp number, Wi-Fi or any link into a QR code in seconds. Add your name, amount and logo, then share it on WhatsApp or print it for your shop counter. Free, no sign-up, nothing leaves your phone.";

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: { default: "QR Studio · UPI and link QR codes", template: "%s · QR Studio" },
  description,
  applicationName: "QR Studio",
  keywords: ["UPI QR code", "UPI QR generator", "Wi-Fi QR code", "WhatsApp QR code", "Google Maps QR code", "QR code generator", "payment QR", "shop QR", "free QR code", "India"],
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "QR Studio", title: "QR Studio · UPI and link QR codes", description, url },
  twitter: { card: "summary_large_image", title: "QR Studio · UPI and link QR codes", description },
  appleWebApp: { capable: true, title: "QR Studio", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0f13" },
  ],
};

// Runs before paint so the saved or system theme applies without a flash.
const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
