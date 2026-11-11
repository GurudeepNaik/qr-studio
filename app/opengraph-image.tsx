import { ImageResponse } from "next/og";

export const alt = "QR Studio: UPI and link QR codes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  const cell = (x: number, y: number, w: number) => <div key={`${x}-${y}`} style={{ position: "absolute", left: x, top: y, width: w, height: w, borderRadius: w * 0.28, background: "#ffffff" }} />;
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: 72, padding: "0 96px", background: "#1d5fd1", color: "#fff", fontFamily: "sans-serif" }}>
      <div style={{ position: "relative", width: 320, height: 320, display: "flex" }}>
        {[cell(0, 0, 130), cell(190, 0, 130), cell(0, 190, 130), cell(190, 190, 56), cell(264, 264, 56)]}
      </div>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 640 }}>
        <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: -2 }}>QR Studio</div>
        <div style={{ fontSize: 38, marginTop: 18, lineHeight: 1.25, opacity: 0.92 }}>UPI and link QR codes. Share on WhatsApp or print for your counter.</div>
        <div style={{ fontSize: 28, marginTop: 28, opacity: 0.75 }}>Free · No sign-up · Nothing leaves your phone</div>
      </div>
    </div>,
    size,
  );
}
