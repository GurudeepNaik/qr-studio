// Asks Chrome whether each site can be installed as an app (the same check that enables "Install app").
//   npx tsx scripts/installable.mts https://a.example https://b.example/play
import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
let bad = 0;
for (const url of process.argv.slice(2)) {
  const p = await b.newPage();
  await p.goto(url, { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 2500)); // let the service worker register
  const cdp = await p.createCDPSession();
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  const manifest = await cdp.send("Page.getAppManifest").catch(() => ({ url: "", errors: [] as unknown[] }));
  const sw = await p.evaluate(async () => !!(await navigator.serviceWorker?.getRegistration()));
  const errs = installabilityErrors.map(e => e.errorId);
  if (errs.length) bad++;
  console.log(`${errs.length ? "NO " : "YES"} ${url}  manifest=${manifest.url || "none"} serviceWorker=${sw}${errs.length ? `  errors: ${errs.join(", ")}` : ""}`);
  await p.close();
}
await b.close();
process.exit(bad ? 1 : 0);
