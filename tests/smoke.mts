// Browser test: every style of code must scan. Renders each combination in the real page, then reads it back
// with jsQR from (a) a phone-size screenshot and (b) the downloadable PNG at 1200 px and a small 260 px copy.
//   pnpm smoke                          # against production
//   pnpm smoke http://localhost:3100    # against a local `pnpm start -p 3100`
import puppeteer, { type Page } from "puppeteer-core";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = (process.argv[2] ?? "https://gurudeep-qr.vercel.app").replace(/\/$/, "");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const JSQR = readFileSync(new URL("../node_modules/jsqr/dist/jsQR.js", import.meta.url), "utf8");
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const results: { pass: boolean; name: string }[] = [];
const ok = (name: string, pass: unknown) => results.push({ pass: !!pass, name });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });

async function phone(width = 375): Promise<Page> {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width, height: 860, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument("globalThis.__name = f => f"); // tsx helper used inside page.evaluate
  page.on("pageerror", e => ok(`no page errors (${(e as Error).message.slice(0, 80)})`, false));
  await page.goto(BASE, { waitUntil: "networkidle2" });
  await page.addScriptTag({ content: JSQR });
  return page;
}
async function type(page: Page, sel: string, text: string) {
  await page.$eval(sel, el => { (el as HTMLInputElement).select(); });
  await page.click(sel, { count: 3 });
  await page.keyboard.press("Backspace");
  if (text) await page.type(sel, text);
}
const clickText = (page: Page, text: string) => page.evaluate((t: string) => {
  const b = [...document.querySelectorAll<HTMLElement>("button, label")].find(e => e.textContent?.trim().toLowerCase() === t.toLowerCase());
  if (!b) throw new Error(`no button "${t}"`);
  b.click();
}, text);

/** Decodes the preview three ways; returns what each read (null = couldn't read). */
async function readAll(page: Page): Promise<(string | null)[]> {
  await wait(350);
  const el = await page.$(".qr-preview");
  if (!el) return [null, null, null];
  const shot = await el.screenshot({ encoding: "base64" });
  return page.evaluate(async (shot: string) => {
    const decode = async (src: string, width: number) => {
      const img = new Image();
      await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = src; });
      const c = document.createElement("canvas");
      c.width = width; c.height = Math.round(width * (img.naturalHeight / img.naturalWidth));
      const x = c.getContext("2d")!;
      x.drawImage(img, 0, 0, c.width, c.height);
      const d = x.getImageData(0, 0, c.width, c.height);
      return (window as unknown as { jsQR: (d: Uint8ClampedArray, w: number, h: number) => { data: string } | null }).jsQR(d.data, c.width, c.height)?.data ?? null;
    };
    const svg = document.querySelector(".qr-preview")!.innerHTML;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    return [await decode(`data:image/png;base64,${shot}`, 600), await decode(url, 1200), await decode(url, 260)];
  }, shot);
}

// A logo to upload: a busy, colourful square, the worst case for covering modules.
const dir = mkdtempSync(join(tmpdir(), "qr-"));
const logoPath = join(dir, "logo.png");
{
  const p = await browser.newPage();
  await p.setViewport({ width: 200, height: 200 });
  await p.setContent(`<div style="width:200px;height:200px;background:conic-gradient(red,orange,green,blue,purple,red);border-radius:40px"></div>`);
  writeFileSync(logoPath, await p.screenshot({ type: "png" }));
  await p.close();
}

// ---------- UPI: every style ----------
{
  const page = await phone();
  ok("UPI tab is the default", (await page.$eval('[role=tab][aria-selected=true]', e => e.textContent)) === "UPI payment");
  ok("empty state invites typing", (await page.$eval(".a-preview", e => e.textContent)).includes("Type your UPI ID"));
  await type(page, "#upi-id", "asha.rao@okicici");
  await type(page, "#upi-name", "Asha Tea Stall");
  await type(page, "#upi-amount", "250");
  await type(page, "#upi-note", "Tea & snacks");
  const expected = "upi://pay?pa=asha.rao%40okicici&pn=Asha%20Tea%20Stall&am=250.00&cu=INR&tn=Tea%20%26%20snacks";
  ok("card shows name, ID and ₹250", /Asha Tea Stall[\s\S]*asha\.rao@okicici[\s\S]*₹250/.test(await page.$eval(".qr-preview", e => e.textContent ?? "")));
  const palettes = ["Classic", "Indigo", "Green", "Maroon", "Teal", "Charcoal"];
  for (const logo of [false, true]) {
    if (logo) {
      const input = await page.$("#logo");
      await (input as unknown as { uploadFile: (p: string) => Promise<void> }).uploadFile(logoPath);
      await page.waitForSelector('img[alt="Your logo"]', { timeout: 5000 });
    }
    // Every combination, not a sample: 3 shapes x 6 palettes x card/plain x logo/none = 72 codes.
    for (const dots of ["square", "rounded", "dots"]) {
      await clickText(page, dots);
      for (const card of [true, false]) for (const palette of palettes) {
        const isOn = await page.$eval('input[type=checkbox]', e => (e as HTMLInputElement).checked);
        if (isOn !== card) await page.click('input[type=checkbox]');
        await page.click(`button[aria-label="${palette}"]`);
        const reads = await readAll(page);
        ok(`UPI scans: ${dots}, ${palette}, ${card ? "card" : "plain"}${logo ? ", logo" : ""} (screen/1200/260: ${reads.map(r => (r === expected ? "✓" : r === null ? "unread" : "WRONG")).join(" ")})`, reads.every(r => r === expected));
      }
    }
  }
  // Faint colours warn.
  await page.$eval('input[type=color]', el => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(el, "#d8d8d8");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await wait(200);
  ok("faint code colour shows a warning", (await page.$eval(".a-preview", e => e.textContent)).includes("too close"));
  ok("fits a 375 px phone", (await page.evaluate(() => document.documentElement.scrollWidth)) <= 375);
}

// ---------- Validation ----------
{
  const page = await phone(320);
  await type(page, "#upi-id", "not-an-id");
  await page.click("#upi-name");
  await wait(150);
  ok("bad UPI ID: error after leaving the field", (await page.$eval(".a-details", e => e.textContent)).includes("doesn't look like a UPI ID"));
  ok("bad UPI ID: no code drawn", !(await page.$(".qr-preview")));
  await type(page, "#upi-id", "9876543210@ybl");
  await type(page, "#upi-amount", "500000");
  await page.click("#upi-name");
  await wait(150);
  ok("amount over ₹1 lakh is refused", (await page.$eval(".a-details", e => e.textContent)).includes("up to ₹1,00,000"));
  ok("fits a 320 px phone", (await page.evaluate(() => document.documentElement.scrollWidth)) <= 320);
}

// ---------- Link mode, recent list ----------
{
  const page = await phone();
  await clickText(page, "Website link");
  await type(page, "#link", "example.com/menu?table=4");
  const reads = await readAll(page);
  ok(`link scans and gets https:// (${reads.join(" | ").slice(0, 80)})`, reads.every(r => r === "https://example.com/menu?table=4"));
  await type(page, "#link", "javascript:alert(1)");
  await page.click("body");
  await wait(150);
  ok("javascript: links are refused", !(await page.$(".qr-preview")));
  await type(page, "#link", "https://wa.me/919876543210");
  const cdp = await page.createCDPSession();
  await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dir });
  await clickText(page, "SVG");
  await wait(600);
  await wait(900);
  let svgFile = ""; try { svgFile = readFileSync(join(dir, "link-qr.svg"), "utf8"); } catch { /* not saved */ }
  ok("SVG download saved", svgFile.startsWith("<svg"));
  await page.reload({ waitUntil: "networkidle2" });
  await wait(300);
  ok("recent list remembers the code after reload", (await page.$eval("#recent-h", e => e.parentElement!.parentElement!.textContent ?? "").catch(() => "")).includes("wa.me"));
}

// ---------- Desktop layout + dark mode ----------
{
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 860 });
  await page.goto(BASE, { waitUntil: "networkidle2" });
  const [d, p] = await page.$$eval(".a-details, .a-preview", els => els.map(e => e.getBoundingClientRect().left));
  ok("desktop: code sits beside the form", (p ?? 0) > (d ?? 0) + 300);
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.click('button[aria-label^="Switch to"]');
  ok("theme switches", (await page.evaluate(() => document.documentElement.dataset.theme)) !== before);
  for (const path of ["/manifest.webmanifest", "/opengraph-image", "/icon-192.png", "/icon-512.png"]) {
    const r = await page.goto(`${BASE}${path}`);
    ok(`${path} is served`, r?.status() === 200);
  }
}

await browser.close();
const failed = results.filter(r => !r.pass);
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.name}`);
console.log(`\n${results.length - failed.length} of ${results.length} passed against ${BASE}`);
process.exit(failed.length ? 1 : 0);
