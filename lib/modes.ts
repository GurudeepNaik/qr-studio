// The six kinds of code: what each one's form fields turn into, and what its card says.
import { checkCall, checkLink, checkMap, checkUpi, checkWhatsApp, checkWifi, isMapsLink, prettyPhone, rupees, splitMapsShare, type Check, type WifiSecurity } from "./payload";

export type Mode = "upi" | "link" | "map" | "wa" | "call" | "wifi";
export type Fields = Record<string, string>;

export const MODES: { key: Mode; label: string }[] = [
  { key: "upi", label: "UPI pay" },
  { key: "link", label: "Website" },
  { key: "map", label: "Directions" },
  { key: "wa", label: "WhatsApp" },
  { key: "call", label: "Call" },
  { key: "wifi", label: "Wi-Fi" },
];

/** The fields each mode keeps, so a saved code stores only its own. */
export const FIELDS: Record<Mode, string[]> = {
  upi: ["id", "name", "amount", "note"],
  link: ["url"],
  map: ["place", "label"],
  wa: ["phone", "text"],
  call: ["phone"],
  wifi: ["ssid", "pass", "sec", "showPass"],
};

export const DEFAULT_TITLE: Record<Mode, string> = {
  upi: "Scan to pay", link: "Scan me", map: "Find us", wa: "Chat on WhatsApp", call: "Call us", wifi: "Free Wi-Fi",
};

const v = (f: Fields, k: string) => (f[k] ?? "").trim();

export function build(mode: Mode, f: Fields): Check<string> {
  switch (mode) {
    case "upi": return checkUpi({ id: f.id ?? "", name: f.name ?? "", amount: f.amount ?? "", note: f.note ?? "" });
    case "link": return checkLink(f.url ?? "");
    case "map": return checkMap(f.place ?? "");
    case "wa": return checkWhatsApp(f.phone ?? "", f.text ?? "");
    case "call": return checkCall(f.phone ?? "");
    case "wifi": return checkWifi(f.ssid ?? "", f.pass ?? "", (f.sec || "WPA") as WifiSecurity);
  }
}

/** Lines under the code on the card (the first is the big one) and the small footer. */
export function cardLines(mode: Mode, f: Fields, value: string): { lines: string[]; footer: string } {
  switch (mode) {
    case "upi": {
      const name = v(f, "name"), id = v(f, "id"), amt = rupees(v(f, "amount"));
      return { lines: [name || id, ...(name ? [id] : []), ...(amt ? [amt] : [])], footer: "Pay with any UPI app" };
    }
    case "link": {
      const u = new URL(value);
      return { lines: [(u.hostname.replace(/^www\./, "") + (u.pathname === "/" ? "" : u.pathname)).slice(0, 34)], footer: "" };
    }
    case "map": {
      const place = v(f, "place");
      const label = v(f, "label") || splitMapsShare(place)?.name || (isMapsLink(place) || /^-?\d/.test(place) ? "" : place);
      return { lines: label ? [label.slice(0, 34)] : [], footer: "Scan for directions in Google Maps" };
    }
    case "wa":
    case "call": {
      const d = value.replace(/^tel:\+|^https:\/\/wa\.me\//, "").replace(/\?.*$/, "");
      return { lines: [prettyPhone(d)], footer: mode === "wa" ? "Opens a chat in WhatsApp" : "Tap to call after scanning" };
    }
    case "wifi": {
      const lines = [v(f, "ssid")];
      if (f.showPass !== "0" && f.sec !== "nopass" && f.pass) lines.push(`Password: ${f.pass}`);
      return { lines, footer: "Point your camera here to join" };
    }
  }
}

/** One line for the Recent list. */
export function summary(mode: Mode, f: Fields): { main: string; sub: string } {
  switch (mode) {
    case "upi": return { main: v(f, "name") || v(f, "id"), sub: [v(f, "id"), rupees(v(f, "amount"))].filter(Boolean).join(" · ") };
    case "link": return { main: v(f, "url"), sub: "Website" };
    case "map": return { main: v(f, "label") || v(f, "place"), sub: "Directions" };
    case "wa": return { main: v(f, "phone"), sub: "WhatsApp" };
    case "call": return { main: v(f, "phone"), sub: "Call" };
    case "wifi": return { main: v(f, "ssid"), sub: "Wi-Fi" };
  }
}

export function fileBase(mode: Mode, f: Fields): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
  const part = { upi: v(f, "id").split("@")[0] ?? "", link: "", map: v(f, "label"), wa: "", call: "", wifi: v(f, "ssid") }[mode];
  return [`${mode === "wa" ? "whatsapp" : mode}-qr`, slug(part)].filter(Boolean).join("-");
}

/**
 * What another app shared to QR Studio (Android share sheet → /?title=&text=&url=), as a mode and its fields.
 * A Google Maps share becomes Directions; any other web link becomes Website.
 */
export function fromShare(title: string, text: string, url: string): { mode: Mode; f: Fields } | null {
  const all = [title, text, url].filter(Boolean).join("\n").trim();
  if (!all) return null;
  const maps = splitMapsShare(all);
  if (maps) return { mode: "map", f: { place: maps.url, label: (title.trim() || maps.name).slice(0, 34) } };
  const link = /https?:\/\/\S+/i.exec(all);
  if (link) return { mode: "link", f: { url: link[0] } };
  return null;
}
