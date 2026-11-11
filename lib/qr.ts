import QRCode from "qrcode";

// Draws a QR code as SVG: our own modules (square, rounded or dots) and our own corner "eyes",
// on top of the standard encoding from the qrcode package. Scanners only need the dark/light pattern,
// so any style here keeps the exact same matrix.

export type DotStyle = "square" | "rounded" | "dots";
export interface QrStyle { fg: string; bg: string; dots: DotStyle; logo: string | null }

const QUIET = 4; // blank modules around the code; scanners need it

export interface Matrix { size: number; dark: (r: number, c: number) => boolean }

export function encode(text: string, withLogo: boolean): Matrix {
  // A logo covers the middle, so use the strongest error correction (up to 30% damage recoverable).
  const qr = QRCode.create(text, { errorCorrectionLevel: withLogo ? "H" : "M" });
  const { size, data } = qr.modules;
  return { size, dark: (r, c) => r >= 0 && c >= 0 && r < size && c < size && data[r * size + c] === 1 };
}

const inEye = (size: number, r: number, c: number) =>
  (r < 7 && c < 7) || (r < 7 && c >= size - 7) || (r >= size - 7 && c < 7);

function eye(x: number, y: number, style: DotStyle, fg: string): string {
  const round = style !== "square";
  const outer = round ? 2.2 : 0;
  const inner = round ? 1.1 : 0;
  // Outer 7×7 ring drawn as a thick stroke, inner 3×3 block filled.
  return `<rect x="${x + 0.5}" y="${y + 0.5}" width="6" height="6" rx="${outer}" fill="none" stroke="${fg}" stroke-width="1"/>` +
    `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="${inner}" fill="${fg}"/>`;
}

/** The QR as an SVG <g> in module units (size + 2×QUIET wide), for embedding in a card. */
export function qrGroup(m: Matrix, style: QrStyle): { body: string; units: number } {
  const units = m.size + QUIET * 2;
  const o = QUIET;
  // Keep modules out from under the logo: a clean square with a 1-module margin.
  const logoSpan = style.logo ? Math.floor(m.size * 0.22) | 1 : 0;
  const logoStart = Math.floor((m.size - logoSpan) / 2);
  const underLogo = (r: number, c: number) => logoSpan > 0 && r >= logoStart - 1 && r <= logoStart + logoSpan && c >= logoStart - 1 && c <= logoStart + logoSpan;

  // Alignment patterns (5×5 ring with a centre dot, which scanners use to correct perspective) are drawn
  // as one solid shape like the eyes. Drawn as loose dots they read poorly. Matching on the pattern itself
  // is safe: whatever matches is drawn with exactly the same dark and light cells.
  const align = new Set<number>();
  let rings = "";
  for (let r = 2; r < m.size - 2; r++) {
    for (let c = 2; c < m.size - 2; c++) {
      if (inEye(m.size, r - 2, c - 2) || inEye(m.size, r + 2, c + 2) || inEye(m.size, r - 2, c + 2) || inEye(m.size, r + 2, c - 2)) continue;
      let hit = true;
      for (let dr = -2; dr <= 2 && hit; dr++) for (let dc = -2; dc <= 2 && hit; dc++) {
        const k = r + dr, l = c + dc;
        if (align.has(k * m.size + l) || m.dark(k, l) !== (Math.max(Math.abs(dr), Math.abs(dc)) !== 1)) hit = false;
      }
      if (!hit || underLogo(r, c)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) align.add((r + dr) * m.size + c + dc);
      const x = c + o - 2, y = r + o - 2, round = style.dots !== "square";
      rings += `<rect x="${x + 0.5}" y="${y + 0.5}" width="4" height="4" rx="${round ? 1.3 : 0}" fill="none" stroke="${style.fg}" stroke-width="1"/>` +
        `<rect x="${x + 2}" y="${y + 2}" width="1" height="1" rx="${round ? 0.5 : 0}" fill="${style.fg}"/>`;
    }
  }

  let modules = "";
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (!m.dark(r, c) || inEye(m.size, r, c) || underLogo(r, c) || align.has(r * m.size + c)) continue;
      const x = c + o, y = r + o;
      if (style.dots === "dots") modules += `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.45"/>`;
      else if (style.dots === "rounded") {
        // Round only the corners that have no dark neighbour, so connected runs stay solid.
        const n = m.dark(r - 1, c), s = m.dark(r + 1, c), w = m.dark(r, c - 1), e = m.dark(r, c + 1);
        const k = 0.5;
        const tl = !n && !w ? k : 0, tr = !n && !e ? k : 0, br = !s && !e ? k : 0, bl = !s && !w ? k : 0;
        modules += `<path d="M${x + tl} ${y}H${x + 1 - tr}${tr ? `A${tr} ${tr} 0 0 1 ${x + 1} ${y + tr}` : ""}V${y + 1 - br}${br ? `A${br} ${br} 0 0 1 ${x + 1 - br} ${y + 1}` : ""}H${x + bl}${bl ? `A${bl} ${bl} 0 0 1 ${x} ${y + 1 - bl}` : ""}V${y + tl}${tl ? `A${tl} ${tl} 0 0 1 ${x + tl} ${y}` : ""}Z"/>`;
      } else modules += `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`;
    }
  }
  const eyes = eye(o, o, style.dots, style.fg) + eye(o + m.size - 7, o, style.dots, style.fg) + eye(o, o + m.size - 7, style.dots, style.fg);
  let logo = "";
  if (style.logo && logoSpan > 0) {
    const x = o + logoStart, y = o + logoStart;
    logo = `<rect x="${x - 0.6}" y="${y - 0.6}" width="${logoSpan + 1.2}" height="${logoSpan + 1.2}" rx="1.4" fill="${style.bg}"/>` +
      `<image href="${style.logo}" x="${x}" y="${y}" width="${logoSpan}" height="${logoSpan}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  // A hairline stroke in the same colour closes the anti-aliasing seams between neighbouring rounded cells.
  const seam = style.dots === "rounded" ? ` stroke="${style.fg}" stroke-width="0.06"` : "";
  const body = `<rect width="${units}" height="${units}" fill="${style.bg}"/><g fill="${style.fg}"${seam}>${modules}</g>${eyes}${rings}${logo}`;
  return { body, units };
}

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

export interface CardText { title: string; lines: string[]; footer: string }

/**
 * The finished image: just the QR, or a card around it (title above, details and a footer below),
 * which is what gets downloaded, shared and printed.
 */
export function renderSvg(text: string, style: QrStyle, card: CardText | null): string {
  const m = encode(text, !!style.logo);
  const { body, units } = qrGroup(m, style);
  if (!card) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${units} ${units}" shape-rendering="geometricPrecision">${body}</svg>`;
  }
  // Card layout in a 400-wide space; the QR is scaled into a 300×300 box.
  const W = 400, qr = 300, pad = 50;
  const top = card.title ? 74 : 40;
  const lineH = 26;
  const H = top + qr + 22 + card.lines.length * lineH + (card.footer ? 36 : 12) + 24;
  const scale = qr / units;
  const title = card.title ? `<text x="${W / 2}" y="50" text-anchor="middle" font-size="26" font-weight="700" fill="${style.fg}">${esc(card.title)}</text>` : "";
  const lines = card.lines.map((l, i) =>
    `<text x="${W / 2}" y="${top + qr + 34 + i * lineH}" text-anchor="middle" font-size="${i === 0 ? 20 : 16}" font-weight="${i === 0 ? 700 : 500}" fill="${i === 0 ? style.fg : "#5b616e"}">${esc(l)}</text>`).join("");
  const footer = card.footer ? `<text x="${W / 2}" y="${H - 26}" text-anchor="middle" font-size="13" fill="#8a909c">${esc(card.footer)}</text>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" shape-rendering="geometricPrecision">` +
    `<rect width="${W}" height="${H}" rx="28" fill="${style.bg}"/><rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="26.5" fill="none" stroke="${style.fg}" stroke-opacity="0.18" stroke-width="3"/>` +
    title + `<g transform="translate(${pad} ${top}) scale(${scale})">${body}</g>` + lines + footer + `</svg>`;
}

// ---------- Colour safety ----------
// Scanners need a dark code on a light background with enough contrast.

function luminance(hex: string): number {
  const v = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function colourCheck(fg: string, bg: string): string | null {
  const lf = luminance(fg), lb = luminance(bg);
  if (lf >= lb) return "The code should be darker than its background, or many phones won't scan it.";
  const ratio = (lb + 0.05) / (lf + 0.05);
  if (ratio < 4) return "These colours are too close. Pick a darker code colour so every phone can scan it.";
  return null;
}

/** PNG of the SVG at `width` pixels, drawn in the browser. */
export async function svgToPng(svg: string, width: number): Promise<Blob> {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("Couldn't draw the QR")); img.src = url; });
    const ratio = img.naturalHeight / img.naturalWidth || 1;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.round(width * ratio);
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error("Couldn't save the PNG"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}
