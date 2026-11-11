"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { checkLink, checkUpi, rupees, type UpiInput } from "@/lib/payload";
import { colourCheck, renderSvg, svgToPng, type CardText, type DotStyle } from "@/lib/qr";

type Mode = "upi" | "link";
interface Saved { mode: Mode; upi: UpiInput; link: string; fg: string; bg: string; dots: DotStyle; card: boolean; title: string; at: number }

const RECENT_KEY = "qr.recent.v1";
const HEX = /^#[0-9a-f]{6}$/i;
const PALETTES = [
  { name: "Classic", fg: "#111111", bg: "#ffffff" },
  { name: "Indigo", fg: "#1e2a78", bg: "#ffffff" },
  { name: "Green", fg: "#0b5d3b", bg: "#f3fbf6" },
  { name: "Maroon", fg: "#7a1630", bg: "#fff8f3" },
  { name: "Teal", fg: "#0b4f5c", bg: "#eefaf9" },
  { name: "Charcoal", fg: "#2b2b2b", bg: "#fff6d6" },
];
const EMPTY_UPI: UpiInput = { id: "", name: "", amount: "", note: "" };
const defaultTitle = (m: Mode) => (m === "upi" ? "Scan to pay" : "Scan me");

function readRecent(): Saved[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as Saved[];
    // Stored on this device only, but still treat it as untrusted input before it reaches the SVG.
    return Array.isArray(raw) ? raw.filter(r => r && (r.mode === "upi" || r.mode === "link") && HEX.test(r.fg) && HEX.test(r.bg) && ["square", "rounded", "dots"].includes(r.dots)).slice(0, 6) : [];
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
  const [upi, setUpi] = useState<UpiInput>(EMPTY_UPI);
  const [link, setLink] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [fg, setFg] = useState(PALETTES[0]!.fg);
  const [bg, setBg] = useState(PALETTES[0]!.bg);
  const [dots, setDots] = useState<DotStyle>("rounded");
  const [logo, setLogo] = useState<string | null>(null);
  const [logoError, setLogoError] = useState("");
  const [card, setCard] = useState(true);
  const [title, setTitle] = useState<string | null>(null); // null = the default for the mode
  const [recent, setRecent] = useState<Saved[]>([]);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [mounted, setMounted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecent(readRecent());
    setMounted(true);
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

  const check = mode === "upi" ? checkUpi(upi) : checkLink(link);
  const cardTitle = (title ?? defaultTitle(mode)).slice(0, 28);

  const cardText: CardText | null = useMemo(() => {
    if (!card || !check.ok) return null;
    if (mode === "upi") {
      const lines = [upi.name.trim() || upi.id.trim(), ...(upi.name.trim() ? [upi.id.trim()] : []), ...(rupees(upi.amount) ? [rupees(upi.amount)] : [])];
      return { title: cardTitle, lines, footer: "Pay with any UPI app" };
    }
    const u = new URL(check.value);
    const shown = (u.hostname.replace(/^www\./, "") + (u.pathname === "/" ? "" : u.pathname)).slice(0, 34);
    return { title: cardTitle, lines: [shown], footer: "" };
  }, [card, check.ok, check.ok ? check.value : "", mode, upi, cardTitle]); // eslint-disable-line react-hooks/exhaustive-deps

  const style = { fg, bg, dots, logo };
  const rendered = useMemo(() => {
    if (!check.ok) return { svg: "", error: "" };
    try {
      return { svg: renderSvg(check.value, style, cardText), error: "" };
    } catch {
      return { svg: "", error: "That's too long to fit in a QR code. Try a shorter link." };
    }
  }, [check.ok, check.ok ? check.value : "", fg, bg, dots, logo, cardText]); // eslint-disable-line react-hooks/exhaustive-deps

  const colourWarning = colourCheck(fg, bg);
  const fileBase = mode === "upi" ? `upi-qr-${upi.id.split("@")[0] || "code"}` : "link-qr";

  function remember() {
    const item: Saved = { mode, upi, link, fg, bg, dots, card, title: cardTitle, at: Date.now() };
    const key = (s: Saved) => (s.mode === "upi" ? `u:${s.upi.id}:${s.upi.amount}:${s.upi.note}` : `l:${s.link}`);
    const next = [item, ...recent.filter(r => key(r) !== key(item))].slice(0, 6);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private mode: fine */ }
  }

  function restore(s: Saved) {
    setMode(s.mode); setUpi(s.upi); setLink(s.link); setFg(s.fg); setBg(s.bg); setDots(s.dots); setCard(s.card);
    setTitle(s.title === defaultTitle(s.mode) ? null : s.title);
    setTouched({});
    setToast("Loaded");
  }

  async function run(action: "png" | "svg" | "share" | "print") {
    if (!rendered.svg || busy) return;
    setBusy(true);
    try {
      if (action === "svg") {
        download(new Blob([rendered.svg], { type: "image/svg+xml" }), `${fileBase}.svg`);
        setToast("SVG saved");
      } else if (action === "print") {
        window.print();
      } else {
        const png = await svgToPng(rendered.svg, 1200);
        if (action === "share" && canShare) {
          const file = new File([png], `${fileBase}.png`, { type: "image/png" });
          try {
            await navigator.share({ files: [file], title: "QR code", text: mode === "upi" ? "Scan to pay me with any UPI app" : undefined });
          } catch (e) {
            if ((e as Error).name !== "AbortError") throw e;
            return; // closed the share sheet: nothing to remember
          }
        } else {
          download(png, `${fileBase}.png`);
          setToast("Image saved");
        }
      }
      remember();
    } catch {
      setToast("Something went wrong. Try Download instead.");
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

  const err = (k: string, msg: string | false) => (touched[k] && msg ? msg : "");
  const upiError = !check.ok && mode === "upi" ? check.error : "";
  const idError = err("id", upiError.includes("UPI ID") && upiError);
  const amountError = err("amount", (upiError.includes("₹") || upiError.includes("decimal")) && upiError);
  const linkError = err("link", mode === "link" && !check.ok && check.error);
  const touch = (k: string) => setTouched(t => ({ ...t, [k]: true }));

  return (
    <>
      <div className="studio">
        {/* ---------- What goes in the code ---------- */}
        <section className="a-details rounded-3xl border border-line bg-card p-4 sm:p-6" aria-labelledby="details-h">
          <h2 id="details-h" className="sr-only">What the QR code opens</h2>
          <div role="tablist" aria-label="QR type" className="grid grid-cols-2 gap-1 rounded-2xl bg-soft p-1">
            {(["upi", "link"] as const).map(m => (
              <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setTouched({}); }}
                className={`press min-h-11 rounded-xl text-[15px] font-semibold ${mode === m ? "bg-card text-fg shadow-sm" : "text-muted"}`}>
                {m === "upi" ? "UPI payment" : "Website link"}
              </button>
            ))}
          </div>

          {mode === "upi" ? (
            <div className="mt-5 grid gap-4">
              <Field label="UPI ID" hint="Find it in your UPI app under your profile, e.g. 9876543210@ybl" error={idError} htmlFor="upi-id">
                <input id="upi-id" className="field font-mono" value={upi.id} placeholder="yourname@okbank" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                  inputMode="email" aria-invalid={!!idError} onBlur={() => touch("id")} onChange={e => setUpi({ ...upi, id: e.target.value.replace(/\s+/g, "") })} />
              </Field>
              <Field label="Name shown to the payer" optional htmlFor="upi-name">
                <input id="upi-name" className="field" value={upi.name} maxLength={50} placeholder="Asha Tea Stall" autoComplete="name" onChange={e => setUpi({ ...upi, name: e.target.value })} />
              </Field>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
                <Field label="Fixed amount" optional hint="Leave empty to let the payer type it" error={amountError} htmlFor="upi-amount">
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted">₹</span>
                    <input id="upi-amount" className="field pl-8 tabular-nums" value={upi.amount} placeholder="0" inputMode="decimal" autoComplete="off" aria-invalid={!!amountError}
                      onBlur={() => touch("amount")} onChange={e => setUpi({ ...upi, amount: e.target.value.replace(/[^\d.]/g, "") })} />
                  </div>
                </Field>
                <Field label="Note" optional hint="Shows in the payer's app, e.g. Invoice 42" htmlFor="upi-note">
                  <input id="upi-note" className="field" value={upi.note} maxLength={50} placeholder="For tea" onChange={e => setUpi({ ...upi, note: e.target.value })} />
                </Field>
              </div>
            </div>
          ) : (
            <div className="mt-5 grid gap-4">
              <Field label="Link" hint="A website, Google review page, menu, Instagram, WhatsApp chat (wa.me/91…) or form" error={linkError} htmlFor="link">
                <input id="link" className="field" value={link} placeholder="example.com/menu" inputMode="url" autoComplete="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                  aria-invalid={!!linkError} onBlur={() => touch("link")} onChange={e => setLink(e.target.value)} />
              </Field>
            </div>
          )}
        </section>

        {/* ---------- The code and what to do with it ---------- */}
        <section className="a-preview rounded-3xl border border-line bg-card p-4 sm:p-5" aria-labelledby="preview-h">
          <h2 id="preview-h" className="sr-only">Your QR code</h2>
          <div className="mx-auto max-w-[340px]">
            {rendered.svg ? (
              <div key={rendered.svg.length + fg + dots} className="qr-preview qr-pop" role="img"
                aria-label={mode === "upi" ? `QR code to pay ${upi.name || upi.id}${rupees(upi.amount) ? ` ${rupees(upi.amount)}` : ""}` : `QR code for ${check.ok ? check.value : "your link"}`}
                dangerouslySetInnerHTML={{ __html: rendered.svg }} />
            ) : (
              <div className="grid aspect-square place-items-center rounded-2xl border-2 border-dashed border-line p-6 text-center text-[15px] text-muted">
                {rendered.error || (mode === "upi" ? "Type your UPI ID and your QR code appears here." : "Paste a link and your QR code appears here.")}
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
            {mode === "upi" && check.ok && (
              <a href={check.value} className="press col-span-2 flex min-h-11 items-center justify-center rounded-2xl text-sm font-medium text-accent md:hidden">
                Test it: open in my UPI app
              </a>
            )}
          </div>
          {check.ok && (
            <details className="mt-3 text-sm text-muted">
              <summary className="cursor-pointer select-none py-1">What the code contains</summary>
              <p className="mt-1 break-all rounded-xl bg-soft p-3 font-mono text-xs">{check.value}</p>
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
              <input type="checkbox" checked={card} onChange={e => setCard(e.target.checked)} className="size-5 accent-[var(--accent)]" />
            </label>
            {card && (
              <input aria-label="Card heading" className="field mt-1" value={cardTitle} maxLength={28} onChange={e => setTitle(e.target.value)} placeholder={defaultTitle(mode)} />
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
            {recent.map(r => (
              <li key={r.at}>
                <button onClick={() => restore(r)} className="press flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-card px-3 text-left">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg text-xs font-bold" style={{ background: r.bg, color: r.fg, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.08)" }}>{r.mode === "upi" ? "₹" : "↗"}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{r.mode === "upi" ? r.upi.name || r.upi.id : r.link}</span>
                    <span className="block truncate text-xs text-muted">{r.mode === "upi" ? [r.upi.id, rupees(r.upi.amount)].filter(Boolean).join(" · ") : "Link"}</span>
                  </span>
                </button>
              </li>
            ))}
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

function Field({ label, hint, error, optional, htmlFor, children }: { label: string; hint?: string; error?: string; optional?: boolean; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
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
