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
  await p.setContent(`<body style="margin:0;background:#1d5fd1">${s === 512 ? `<div style="padding:${s * 0.1}px">${svg.replace('rx="112"', 'rx="0"')}</div>` : svg}</body>`);
  await p.addStyleTag({ content: "svg{width:100%;height:100%;display:block}" });
  writeFileSync(`${root}/public/icon-${s}.png`, await p.screenshot({ type: "png", omitBackground: false }));
}
await b.close();
