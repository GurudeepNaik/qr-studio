// What goes inside the QR code: a web link, or a UPI payment request any UPI app understands.

/** A UPI ID looks like name@bank: letters, digits and . _ - before the @, letters after it. */
export const UPI_ID = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;
export const MAX_AMOUNT = 100000; // ₹1 lakh: the usual per-payment limit for person-to-person UPI

export interface UpiInput { id: string; name: string; amount: string; note: string }
export type Check<T> = { ok: true; value: T } | { ok: false; error: string; field?: string };

export function checkUpi(input: UpiInput): Check<string> {
  const id = input.id.trim();
  if (!id) return { ok: false, error: "Enter a UPI ID, like yourname@okbank.", field: "id" };
  if (!UPI_ID.test(id)) return { ok: false, error: "That doesn't look like a UPI ID. It should look like name@bank.", field: "id" };
  const name = input.name.trim().slice(0, 50);
  const params = new URLSearchParams({ pa: id });
  if (name) params.set("pn", name);
  const raw = input.amount.trim();
  if (raw) {
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter an amount above ₹0, or leave it empty to let the payer type it.", field: "amount" };
    if (amount > MAX_AMOUNT) return { ok: false, error: `Most UPI apps allow up to ₹${MAX_AMOUNT.toLocaleString("en-IN")} in one payment.`, field: "amount" };
    if (Math.round(amount * 100) !== amount * 100) return { ok: false, error: "Use at most 2 decimal places (paise).", field: "amount" };
    params.set("am", amount.toFixed(2));
  }
  params.set("cu", "INR");
  const note = input.note.trim().slice(0, 50);
  if (note) params.set("tn", note);
  // URLSearchParams writes spaces as "+"; UPI apps expect %20.
  return { ok: true, value: `upi://pay?${params.toString().replace(/\+/g, "%20")}` };
}

/** Accepts "example.com/x" and adds https://. Only web links (http/https) are allowed. */
export function checkLink(raw: string): Check<string> {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Paste a link, like example.com or https://…", field: "url" };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: "That isn't a link we can open. Check for spaces or typos.", field: "url" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: "Only web links (https://) are supported.", field: "url" };
  if (!url.hostname.includes(".") && url.hostname !== "localhost") return { ok: false, error: "That address is missing its ending, like .com or .in.", field: "url" };
  return { ok: true, value: url.toString() };
}

/** "₹1,250" for the printed card. */
export const rupees = (amount: string) => {
  const n = Number(amount);
  return Number.isFinite(n) && n > 0 ? `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "";
};

// ---------- Phone numbers (WhatsApp, Call) ----------

/**
 * Digits with country code, no "+". A plain 10-digit number is taken as Indian (+91); a leading 0 (trunk prefix,
 * as in 080…) is dropped. `mobile` additionally requires an Indian mobile number to start with 6–9.
 */
export function checkPhone(raw: string, mobile: boolean): Check<string> {
  const text = raw.trim();
  const plus = text.startsWith("+");
  let d = text.replace(/\D/g, "");
  if (!d) return { ok: false, error: "Enter a phone number.", field: "phone" };
  if (!plus && d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (!plus && d.length === 10) {
    if (mobile && !/^[6-9]/.test(d)) return { ok: false, error: "Indian mobile numbers start with 6, 7, 8 or 9.", field: "phone" };
    d = `91${d}`;
  }
  if (d.length < 8 || d.length > 15) return { ok: false, error: "Check the number: 10 digits for India, or + and the country code.", field: "phone" };
  return { ok: true, value: d };
}
export const prettyPhone = (d: string) => (d.length === 12 && d.startsWith("91") ? `+91 ${d.slice(2, 7)} ${d.slice(7)}` : `+${d}`);

export function checkWhatsApp(phone: string, text: string): Check<string> {
  const p = checkPhone(phone, true);
  if (!p.ok) return p;
  const msg = text.trim().slice(0, 300);
  return { ok: true, value: `https://wa.me/${p.value}${msg ? `?text=${encodeURIComponent(msg)}` : ""}` };
}

export function checkCall(phone: string): Check<string> {
  const p = checkPhone(phone, false);
  return p.ok ? { ok: true, value: `tel:+${p.value}` } : p;
}

// ---------- Directions ----------

const MAPS_LINK = /^(https?:\/\/)?((www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)/i;
const COORDS = /^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/;

/** A Google Maps link is kept as is; an address, place name or "lat, lng" becomes a directions link. */
const MAPS_LINK_ANYWHERE = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)\S*/i;

/**
 * Google Maps' Share gives "Place name, address https://maps.app.goo.gl/…": pull the link out and keep the
 * words before it as the name for the card.
 */
export function splitMapsShare(raw: string): { url: string; name: string } | null {
  const m = MAPS_LINK_ANYWHERE.exec(raw);
  if (!m) return null;
  const name = raw.slice(0, m.index).split(/\n/)[0]!.replace(/[\s,·-]+$/, "").trim();
  return { url: m[0], name };
}

export function checkMap(raw: string): Check<string> {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return { ok: false, error: "Type your shop's address or name, or paste a Google Maps link.", field: "place" };
  const shared = splitMapsShare(raw.trim());
  if (shared || MAPS_LINK.test(text)) {
    const link = checkLink(shared?.url ?? text);
    return link.ok ? link : { ...link, field: "place" };
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return { ok: false, error: "That isn't a Google Maps link. Paste one from Share in Google Maps, or type the address.", field: "place" };
  if (text.length > 200) return { ok: false, error: "Keep the address under 200 characters.", field: "place" };
  const c = COORDS.exec(text);
  if (c && (Math.abs(Number(c[1])) > 90 || Math.abs(Number(c[2])) > 180)) return { ok: false, error: "Those map coordinates are out of range.", field: "place" };
  const dest = c ? `${c[1]},${c[2]}` : text;
  return { ok: true, value: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}` };
}
export const isMapsLink = (raw: string) => MAPS_LINK.test(raw.trim()) || !!splitMapsShare(raw);

// ---------- Wi-Fi ----------

export type WifiSecurity = "WPA" | "WEP" | "nopass";
/** The Wi-Fi QR format phones' cameras understand: special characters are escaped with a backslash. */
const wifiEsc = (s: string) => s.replace(/([\\;,":])/g, "\\$1");

export function checkWifi(ssid: string, password: string, security: WifiSecurity): Check<string> {
  const name = ssid.trim();
  if (!name) return { ok: false, error: "Enter the Wi-Fi name exactly as phones show it.", field: "ssid" };
  if (new TextEncoder().encode(name).length > 32) return { ok: false, error: "Wi-Fi names are at most 32 characters.", field: "ssid" };
  if (security === "WPA" && (password.length < 8 || password.length > 63)) return { ok: false, error: "Wi-Fi passwords are 8 to 63 characters.", field: "pass" };
  if (security === "WEP" && !password) return { ok: false, error: "Enter the Wi-Fi password.", field: "pass" };
  const pass = security === "nopass" ? "" : `P:${wifiEsc(password)};`;
  return { ok: true, value: `WIFI:T:${security};S:${wifiEsc(name)};${pass};` };
}
