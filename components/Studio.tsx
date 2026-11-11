"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { build, cardLines, DEFAULT_TITLE, FIELDS, fileBase, fromShare, MODES, summary, type Fields, type Mode } from "@/lib/modes";
import { rupees } from "@/lib/payload";
import { colourCheck, renderSvg, svgToPng, type CardText, type DotStyle } from "@/lib/qr";

interface Saved { mode: Mode; f: Fields; fg: string; bg: string; dots: DotStyle; card: boolean; title: string; at: number }

const RECENT_KEY = "qr.recent.v2";
const HEX = /^#[0-9a-f]{6}$/i;
const PALETTES = [
  { name: "Classic", fg: "#111111", bg: "#ffffff" },
  { name: "Indigo", fg: "#1e2a78", bg: "#ffffff" },
  { name: "Green", fg: "#0b5d3b", bg: "#f3fbf6" },
  { name: "Maroon", fg: "#7a1630", bg: "#fff8f3" },
  { name: "Teal", fg: "#0b4f5c", bg: "#eefaf9" },
  { name: "Charcoal", fg: "#2b2b2b", bg: "#fff6d6" },
];
const MODE_KEYS = MODES.map(m => m.key) as string[];

const ICONS: Record<Mode, React.ReactNode> = {
  upi: <><path d="M7 5h10M7 9h10M7 5c5 0 5 8 0 8l7 6" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  map: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>,
  wa: <><path d="M4 20l1.3-4A8 8 0 1 1 8 18.8z" /><path d="M9 9.5c.3 2.2 2.3 4.2 4.5 4.5l1-1.2 2 .8" /></>,
  call: <><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></>,
  wifi: <><path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 16a5 5 0 0 1 6.4 0" /><circle cx="12" cy="19.3" r=".9" fill="currentColor" /></>,
};

function readRecent(): Saved[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as Saved[];
    // Stored on this device only, but still treat it as untrusted input before it reaches the SVG.
    return Array.isArray(raw)
      ? raw.filter(r => r && MODE_KEYS.includes(r.mode) && r.f && typeof r.f === "object" && HEX.test(r.fg) && HEX.test(r.bg) && ["square", "rounded", "dots"].includes(r.dots)).slice(0, 6)
      : [];
  } catch {
    return [];
  }
}

/** Uploaded logos are redrawn to a 160 px PNG: small enough to keep the SVG light, and an SVG upload can't carry scripts. */
async function logoFromFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Pick an image file (PNG, JPG or SVG).");
  if (file.size > 8 * 1024 * 1024) throw new Error("That image is over 8 MB. Pick a smaller one.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error("Couldn't read that image.")); img.src = url; });
    const side = 160, canvas = document.createElement("canvas");
    canvas.width = canvas.height = side;
    const ctx = canvas.getContext("2d")!;
    const s = Math.min(side / img.naturalWidth, side / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.drawImage(img, (side - w) / 2, (side - h) / 2, w, h);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function Studio() {
  const [mode, setMode] = useState<Mode>("upi");
  const [f, setF] = useState<Fields>({ sec: "WPA" });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [fg, setFg] = useState(PALETTES[0]!.fg);
  const [bg, setBg] = useState(PALETTES[0]!.bg);
  const [dots, setDots] = useState<DotStyle>("rounded");
  const [logo, setLogo] = useState<string | null>(null);
  const [logoError, setLogoError] = useState("");
  const [card, setCard] = useState(true);
  const [titles, setTitles] = useState<Partial<Record<Mode, string>>>({}); // missing = the default for the mode
  const [recent, setRecent] = useState<Saved[]>([]);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [mounted, setMounted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecent(readRecent());
    setMounted(true);
    // Opened from another app's Share button (Android, once QR Studio is installed): fill the form from it.
    const q = new URLSearchParams(location.search);
    const shared = fromShare(q.get("title") ?? "", q.get("text") ?? "", q.get("url") ?? "");
    if (shared) {
      setMode(shared.mode);
      setF(prev => ({ ...prev, ...shared.f }));
      history.replaceState(null, "", "/");
    }
    try {
      const probe = new File([new Blob(["x"], { type: "image/png" })], "x.png", { type: "image/png" });
      setCanShare(typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] }));
    } catch { /* no file sharing on this browser */ }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const check = build(mode, f);
  const value = check.ok ? check.value : "";
  const cardTitle = (titles[mode] ?? DEFAULT_TITLE[mode]).slice(0, 28);

  const cardText: CardText | null = useMemo(
    () => (card && value ? { title: cardTitle, ...cardLines(mode, f, value) } : null),
    [card, value, mode, f, cardTitle],
  );

  const rendered = useMemo(() => {
    if (!value) return { svg: "", error: "" };
    try {
      return { svg: renderSvg(value, { fg, bg, dots, logo }, cardText), error: "" };
    } catch {
      return { svg: "", error: "That's too long to fit in a QR code. Try something shorter." };
    }
  }, [value, fg, bg, dots, logo, cardText]);

  const colourWarning = colourCheck(fg, bg);
  const set = (k: string, val: string) => setF(prev => ({ ...prev, [k]: val }));
  const touch = (k: string) => setTouched(t => ({ ...t, [k]: true }));
  const errorFor = (k: string) => (!check.ok && check.field === k && touched[k] ? check.error : "");

  function remember() {
    const own = Object.fromEntries(FIELDS[mode].map(k => [k, f[k] ?? ""]));
    const item: Saved = { mode, f: own, fg, bg, dots, card, title: cardTitle, at: Date.now() };
    const key = (s: Saved) => `${s.mode}:${JSON.stringify(s.f)}`;
    const next = [item, ...recent.filter(r => key(r) !== key(item))].slice(0, 6);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private mode: fine */ }
  }

  function restore(s: Saved) {
    setMode(s.mode);
    setF(prev => ({ ...prev, ...Object.fromEntries(Object.entries(s.f).map(([k, x]) => [k, String(x ?? "")])) }));
    setFg(s.fg); setBg(s.bg); setDots(s.dots); setCard(s.card);
    setTitles(t => ({ ...t, [s.mode]: s.title === DEFAULT_TITLE[s.mode] ? undefined : String(s.title).slice(0, 28) }));
    setTouched({});
    setToast("Loaded");
  }

  async function run(action: "png" | "svg" | "share" | "print") {
    if (!rendered.svg || busy) return;
    setBusy(true);
    const name = fileBase(mode, f);
    try {
      if (action === "svg") {
        download(new Blob([rendered.svg], { type: "image/svg+xml" }), `${name}.svg`);
        setToast("SVG saved");
      } else if (action === "print") {
        window.print();
      } else {
        const png = await svgToPng(rendered.svg, 1200);
        if (action === "share" && canShare) {
          const file = new File([png], `${name}.png`, { type: "image/png" });
          const text = { upi: "Scan to pay me with any UPI app", map: "Scan for directions", wifi: "Scan to join our Wi-Fi" }[mode as string];
          try {
            await navigator.share({ files: [file], title: "QR code", text });
          } catch (e) {
            if ((e as Error).name !== "AbortError") throw e;
            return; // closed the share sheet: nothing to remember
          }
        } else {
          download(png, `${name}.png`);
          setToast("Image saved");
        }
      }
      remember();
    } catch {
      setToast("Something went wrong. Try Save instead.");
    } finally {
      setBusy(false);
    }
  }

  async function onLogo(file: File | undefined) {
    setLogoError("");
    if (!file) return;
    try { setLogo(await logoFromFile(file)); } catch (e) { setLogoError((e as Error).message); }
    if (fileRef.current) fileRef.current.value = "";
  }

  function locate() {
    if (!navigator.geolocation) { setToast("This browser can't share your location."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      p => { set("place", `${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`); setLocating(false); },
      e => { setLocating(false); setToast(e.code === e.PERMISSION_DENIED ? "Location is blocked. Allow it in the browser, or type the address." : "Couldn't find your location. Type the address instead."); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  /** A text field bound to f[k], with its error shown once the person has left it. */
  const input = (k: string, props: React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) => {
    const { mono, ...rest } = props;
    return (
      <input id={`f-${k}`} className={`field ${mono ? "font-mono" : ""}`} value={f[k] ?? ""} aria-invalid={!!errorFor(k)} autoComplete="off"
        onBlur={() => touch(k)} onChange={e => set(k, e.target.value)} {...rest} />
    );
  };

  const testLink = value && mode !== "wifi" ? value : "";
  const testLabel = { upi: "Test it: open in my UPI app", link: "Test it: open the link", map: "Test it: open the directions", wa: "Test it: open the chat", call: "Test it: call the number", wifi: "" }[mode];

  return (
    <>
      <div className="studio">
        {/* ---------- What goes in the code ---------- */}
        <section className="a-details rounded-3xl border border-line bg-card p-4 sm:p-6" aria-labelledby="details-h">
          <h2 id="details-h" className="sr-only">What the QR code does</h2>
          <div role="tablist" aria-label="QR type" className="grid grid-cols-3 gap-1 rounded-2xl bg-soft p-1 sm:grid-cols-6">
            {MODES.map(m => (
              <button key={m.key} role="tab" aria-selected={mode === m.key} onClick={() => { setMode(m.key); setTouched({}); }}
                className={`press flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[13px] font-semibold ${mode === m.key ? "bg-card text-fg shadow-sm" : "text-muted"}`}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden
                  className={mode === m.key ? "text-accent" : ""}>{ICONS[m.key]}</svg>
                {m.label}
              </button>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-4">
            {mode === "upi" && (
              <>
                <Field label="UPI ID" hint="Find it in your UPI app under your profile, e.g. 9876543210@ybl" error={errorFor("id")} k="id">
                  {input("id", { mono: true, placeholder: "yourname@okbank", autoCapitalize: "none", autoCorrect: "off", spellCheck: false, inputMode: "email",
                    onChange: e => set("id", e.target.value.replace(/\s+/g, "")) })}
                </Field>
                <Field label="Name shown to the payer" optional k="name">{input("name", { maxLength: 50, placeholder: "Asha Tea Stall", autoComplete: "name" })}</Field>
                <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
                  <Field label="Fixed amount" optional hint="Leave empty to let the payer type it" error={errorFor("amount")} k="amount">
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted">₹</span>
                      {input("amount", { className: "field pl-8 tabular-nums", placeholder: "0", inputMode: "decimal", onChange: e => set("amount", e.target.value.replace(/[^\d.]/g, "")) })}
                    </div>
                  </Field>
                  <Field label="Note" optional hint="Shows in the payer's app, e.g. Invoice 42" k="note">{input("note", { maxLength: 50, placeholder: "For tea" })}</Field>
                </div>
              </>
            )}

            {mode === "link" && (
              <Field label="Link" hint="A website, Google review page, menu, Instagram, YouTube or form" error={errorFor("url")} k="url">
                {input("url", { placeholder: "example.com/menu", inputMode: "url", autoCapitalize: "none", autoCorrect: "off", spellCheck: false })}
              </Field>
            )}

            {mode === "map" && (
              <>
                <Field label="Where to" hint="An address or place name. Or in Google Maps tap Share, then Copy, and paste it here" error={errorFor("place")} k="place">
                  {input("place", { placeholder: "Asha Tea Stall, MG Road, Bhatkal", autoCapitalize: "words" })}
                </Field>
                <button onClick={locate} disabled={locating} className="press -mt-1 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line text-sm font-medium disabled:opacity-50">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
                  {locating ? "Finding you…" : "I'm there now: use my location"}
                </button>
                <Field label="Name on the card" optional hint="e.g. your shop's name; the address is used if empty" k="label">{input("label", { maxLength: 34, placeholder: "Asha Tea Stall" })}</Field>
              </>
            )}

            {(mode === "wa" || mode === "call") && (
              <Field label={mode === "wa" ? "WhatsApp number" : "Phone number"} hint="10-digit Indian number, or + and the country code" error={errorFor("phone")} k="phone">
                {input("phone", { placeholder: "98765 43210", inputMode: "tel", autoComplete: "tel" })}
              </Field>
            )}
            {mode === "wa" && (
              <Field label="Ready-made message" optional hint="The customer can edit it before sending" k="text">
                <textarea id="f-text" className="field min-h-24 resize-y" maxLength={300} value={f.text ?? ""} placeholder="Hi, I'd like to place an order" onChange={e => set("text", e.target.value)} />
              </Field>
            )}

            {mode === "wifi" && (
              <>
                <Field label="Wi-Fi name" hint="Exactly as phones show it, capitals included" error={errorFor("ssid")} k="ssid">
                  {input("ssid", { placeholder: "Asha Cafe Guest", autoCapitalize: "none", autoCorrect: "off", spellCheck: false })}
                </Field>
                <div role="radiogroup" aria-label="Wi-Fi security" className="grid grid-cols-3 gap-2">
                  {([["WPA", "Password"], ["nopass", "No password"], ["WEP", "WEP (old)"]] as const).map(([k, label]) => (
                    <button key={k} role="radio" aria-checked={(f.sec || "WPA") === k} onClick={() => set("sec", k)}
                      className={`press min-h-11 rounded-xl border text-sm font-medium ${(f.sec || "WPA") === k ? "border-accent bg-accent-soft text-fg" : "border-line text-muted"}`}>{label}</button>
                  ))}
                </div>
                {f.sec !== "nopass" && (
                  <>
                    <Field label="Password" error={errorFor("pass")} k="pass">
                      {input("pass", { placeholder: "8 or more characters", autoCapitalize: "none", autoCorrect: "off", spellCheck: false, mono: true })}
                    </Field>
                    <label className="-mt-1 flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm">
                      <span>Print the password on the card too</span>
                      <input type="checkbox" checked={f.showPass !== "0"} onChange={e => set("showPass", e.target.checked ? "1" : "0")} className="size-5 accent-[var(--accent)]" />
                    </label>
                  </>
                )}
              </>
            )}
          </div>
        </section>

        {/* ---------- The code and what to do with it ---------- */}
        <section className="a-preview rounded-3xl border border-line bg-card p-4 sm:p-5" aria-labelledby="preview-h">
          <h2 id="preview-h" className="sr-only">Your QR code</h2>
          <div className="mx-auto max-w-[340px]">
            {rendered.svg ? (
              <div key={rendered.svg.length + fg + dots} className="qr-preview qr-pop" role="img"
                aria-label={mode === "upi" ? `QR code to pay ${f.name || f.id}${rupees(f.amount ?? "") ? ` ${rupees(f.amount ?? "")}` : ""}` : `QR code: ${MODES.find(m => m.key === mode)!.label}`}
                dangerouslySetInnerHTML={{ __html: rendered.svg }} />
            ) : (
              <div className="grid aspect-square place-items-center rounded-2xl border-2 border-dashed border-line p-6 text-center text-[15px] text-muted">
                {rendered.error || {
                  upi: "Type your UPI ID and your QR code appears here.",
                  link: "Paste a link and your QR code appears here.",
                  map: "Type an address or use your location, and your QR code appears here.",
                  wa: "Type your WhatsApp number and your QR code appears here.",
                  call: "Type your phone number and your QR code appears here.",
                  wifi: "Type your Wi-Fi name and password, and your QR code appears here.",
                }[mode]}
              </div>
            )}
          </div>

          {colourWarning && rendered.svg && (
            <p role="alert" className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">{colourWarning}</p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={() => run(canShare ? "share" : "png")} disabled={!rendered.svg || busy}
              className="press col-span-2 min-h-12 rounded-2xl bg-accent text-[16px] font-semibold text-accent-fg disabled:opacity-40">
              {canShare ? "Share (WhatsApp and more)" : "Download image"}
            </button>
            <div className="col-span-2 flex gap-2">
              {canShare && <Action onClick={() => run("png")} disabled={!rendered.svg || busy}>Save</Action>}
              <Action onClick={() => run("print")} disabled={!rendered.svg || busy}>Print</Action>
              <Action onClick={() => run("svg")} disabled={!rendered.svg || busy} title="Sharp at any size, for print shops">SVG</Action>
            </div>
            {testLink && (
              <a href={testLink} target={testLink.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer"
                className={`press col-span-2 flex min-h-11 items-center justify-center rounded-2xl text-sm font-medium text-accent ${mode === "upi" || mode === "call" ? "md:hidden" : ""}`}>
                {testLabel}
              </a>
            )}
          </div>
          {value && (
            <details className="mt-3 text-sm text-muted">
              <summary className="cursor-pointer select-none py-1">What the code contains</summary>
              <p className="mt-1 break-all rounded-xl bg-soft p-3 font-mono text-xs">{value}</p>
            </details>
          )}
        </section>

        {/* ---------- Look ---------- */}
        <section className="a-style rounded-3xl border border-line bg-card p-4 sm:p-6" aria-labelledby="style-h">
          <h2 id="style-h" className="text-[17px] font-semibold">Make it yours</h2>

          <fieldset className="mt-4">
            <legend className="text-sm font-medium">Colours</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {PALETTES.map(p => {
                const on = p.fg === fg && p.bg === bg;
                return (
                  <button key={p.name} onClick={() => { setFg(p.fg); setBg(p.bg); }} aria-pressed={on} aria-label={p.name}
                    className={`press grid size-11 place-items-center rounded-full border-2 ${on ? "border-accent" : "border-line"}`} style={{ background: p.bg }}>
                    <span className="size-5 rounded-full" style={{ background: p.fg }} />
                  </button>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <ColourInput label="Code" value={fg} onChange={setFg} />
              <ColourInput label="Background" value={bg} onChange={setBg} />
            </div>
          </fieldset>

          <fieldset className="mt-5">
            <legend className="text-sm font-medium">Dot shape</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(["square", "rounded", "dots"] as const).map(d => (
                <button key={d} onClick={() => setDots(d)} aria-pressed={dots === d}
                  className={`press min-h-11 rounded-xl border text-sm font-medium capitalize ${dots === d ? "border-accent bg-accent-soft text-fg" : "border-line text-muted"}`}>
                  {d}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-5">
            <p className="text-sm font-medium">Logo in the middle <span className="font-normal text-muted">(optional)</span></p>
            <div className="mt-2 flex items-center gap-2">
              <input ref={fileRef} type="file" accept="image/*" className="sr-only" id="logo" onChange={e => onLogo(e.target.files?.[0])} />
              <label htmlFor="logo" className="press flex min-h-11 cursor-pointer items-center rounded-xl border border-line px-4 text-sm font-medium">
                {logo ? "Change logo" : "Add a logo"}
              </label>
              {logo && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logo} alt="Your logo" className="size-11 rounded-lg border border-line object-contain" />
                  <button onClick={() => setLogo(null)} className="press min-h-11 rounded-xl px-3 text-sm text-muted">Remove</button>
                </>
              )}
            </div>
            {logoError && <p role="alert" className="mt-2 text-sm text-bad">{logoError}</p>}
            {logo && <p className="mt-2 text-xs text-muted">The code switches to its strongest error correction so it still scans with a logo.</p>}
          </div>

          <div className="mt-5">
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
              <span className="text-sm font-medium">Card with heading and details</span>
              <input id="card-toggle" type="checkbox" checked={card} onChange={e => setCard(e.target.checked)} className="size-5 accent-[var(--accent)]" />
            </label>
            {card && (
              <input aria-label="Card heading" className="field mt-1" value={cardTitle} maxLength={28} onChange={e => setTitles(t => ({ ...t, [mode]: e.target.value }))} placeholder={DEFAULT_TITLE[mode]} />
            )}
          </div>
        </section>
      </div>

      {mounted && recent.length > 0 && (
        <section className="mt-6" aria-labelledby="recent-h">
          <div className="flex items-baseline justify-between">
            <h2 id="recent-h" className="text-[15px] font-semibold">Recent <span className="font-normal text-muted">(on this phone only)</span></h2>
            <button className="press min-h-10 px-2 text-sm text-muted" onClick={() => { setRecent([]); try { localStorage.removeItem(RECENT_KEY); } catch { /* fine */ } }}>Clear</button>
          </div>
          <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
            {recent.map(r => {
              const s = summary(r.mode, r.f);
              return (
                <li key={r.at}>
                  <button onClick={() => restore(r)} className="press flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-card px-3 text-left">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: r.bg, color: r.fg, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.08)" }}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONS[r.mode]}</svg>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{s.main}</span>
                      <span className="block truncate text-xs text-muted">{s.sub}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 flex justify-center px-4">
        {toast && <p className="rounded-full bg-fg px-4 py-2 text-sm font-medium text-bg shadow-lg">{toast}</p>}
      </div>

      {mounted && rendered.svg && createPortal(
        <div id="print-root"><div id="print-area" dangerouslySetInnerHTML={{ __html: rendered.svg }} /></div>,
        document.body,
      )}
    </>
  );
}

function Field({ label, hint, error, optional, k, children }: { label: string; hint?: string; error?: string; optional?: boolean; k: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={`f-${k}`} className="mb-1.5 block text-sm font-medium">
        {label} {optional && <span className="font-normal text-muted">(optional)</span>}
      </label>
      {children}
      {error ? <p role="alert" className="mt-1.5 text-sm text-bad">{error}</p> : hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function Action({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className="press min-h-11 flex-1 rounded-2xl border border-line text-sm font-medium disabled:opacity-40">{children}</button>;
}

function ColourInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-line px-2">
      <input type="color" value={value} onChange={e => onChange(e.target.value)} className="size-8 cursor-pointer rounded-md border-0 bg-transparent p-0" />
      <span className="text-sm">{label}</span>
      <span className="ml-auto hidden font-mono text-xs text-muted uppercase min-[400px]:inline">{value}</span>
    </label>
  );
}
