// Regenerates public/icon-192.png, public/icon-512.png (maskable) and app/apple-icon.png from public/icon.svg:  npx tsx scripts/icons.mts .
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "node:fs";
const root = process.argv[2]!;
const svg = readFileSync(`${root}/public/icon.svg`, "utf8");
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const p = await b.newPage();
for (const s of [192, 512]) {
  await p.setViewport({ width: s, height: s });
  // Maskable icons need the art inside the middle 80%, so the 512 gets a full-bleed background.
  const inner = s === 512 ? Math.round(s * 0.8) : s;
  const art = (s === 512 ? svg.replace('rx="112"', 'rx="0"') : svg).replace("<svg ", `<svg width="${inner}" height="${inner}" `);
  await p.setContent(`<body style="margin:0;width:${s}px;height:${s}px;display:grid;place-items:center;background:#1d5fd1">${art}</body>`);
  writeFileSync(`${root}/public/icon-${s}.png`, await p.screenshot({ type: "png", omitBackground: false }));
}
await b.close();
