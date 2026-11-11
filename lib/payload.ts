// What goes inside the QR code: a web link, or a UPI payment request any UPI app understands.

/** A UPI ID looks like name@bank: letters, digits and . _ - before the @, letters after it. */
export const UPI_ID = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;
export const MAX_AMOUNT = 100000; // ₹1 lakh: the usual per-payment limit for person-to-person UPI

export interface UpiInput { id: string; name: string; amount: string; note: string }
export type Check<T> = { ok: true; value: T } | { ok: false; error: string };

export function checkUpi(input: UpiInput): Check<string> {
  const id = input.id.trim();
  if (!id) return { ok: false, error: "Enter a UPI ID, like yourname@okbank." };
  if (!UPI_ID.test(id)) return { ok: false, error: "That doesn't look like a UPI ID. It should look like name@bank." };
  const name = input.name.trim().slice(0, 50);
  const params = new URLSearchParams({ pa: id });
  if (name) params.set("pn", name);
  const raw = input.amount.trim();
  if (raw) {
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter an amount above ₹0, or leave it empty to let the payer type it." };
    if (amount > MAX_AMOUNT) return { ok: false, error: `Most UPI apps allow up to ₹${MAX_AMOUNT.toLocaleString("en-IN")} in one payment.` };
    if (Math.round(amount * 100) !== amount * 100) return { ok: false, error: "Use at most 2 decimal places (paise)." };
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
  if (!text) return { ok: false, error: "Paste a link, like example.com or https://…" };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: "That isn't a link we can open. Check for spaces or typos." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: "Only web links (https://) are supported." };
  if (!url.hostname.includes(".") && url.hostname !== "localhost") return { ok: false, error: "That address is missing its ending, like .com or .in." };
  return { ok: true, value: url.toString() };
}

/** "₹1,250" for the printed card. */
export const rupees = (amount: string) => {
  const n = Number(amount);
  return Number.isFinite(n) && n > 0 ? `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "";
};
