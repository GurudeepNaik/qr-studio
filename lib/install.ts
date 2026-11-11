// Installing the site as an app. Chrome, Edge and Samsung Internet fire `beforeinstallprompt`;
// iPhone and iPad Safari never do, so those get "Share, then Add to Home Screen" steps instead.
// (Same approach as the Arcade's lib/games/install.ts.)

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallWay = "installed" | "prompt" | "ios" | "none";

let deferred: InstallPromptEvent | null = null;
let started = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

/** Once per page: registers the service worker and keeps the browser's install prompt for our own button. */
export function startInstallWatch(): void {
  if (started) return;
  started = true;
  addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
}

export function onInstallChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function installWay(): InstallWay {
  if (matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone) return "installed";
  if (deferred) return "prompt";
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "none";
}

/** Shows the browser's install dialog. True when the person accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  notify();
  return outcome === "accepted";
}
