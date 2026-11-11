import { Studio } from "@/components/Studio";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  return (
    <>
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-2.5">
          <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden className="shrink-0">
            <rect width="32" height="32" rx="9" fill="var(--accent)" />
            <g fill="var(--accent-fg)"><rect x="7" y="7" width="7" height="7" rx="2" /><rect x="18" y="7" width="7" height="7" rx="2" /><rect x="7" y="18" width="7" height="7" rx="2" /><rect x="18" y="18" width="3" height="3" rx="1" /><rect x="22" y="22" width="3" height="3" rx="1" /></g>
          </svg>
          <span className="text-[17px] font-bold tracking-tight">QR Studio</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16">
        <div className="pt-1 pb-4 sm:pt-6 sm:pb-7">
          <h1 className="text-[24px] leading-tight font-bold tracking-tight text-balance sm:text-4xl">Get paid or get found with one scan</h1>
          <p className="mt-2 max-w-xl text-[15px] text-muted sm:text-base">
            <span className="sm:hidden">Free, no sign-up, nothing leaves your phone.</span>
            <span className="hidden sm:inline">QR codes for UPI payments, directions to your shop, WhatsApp, calls, Wi-Fi or any link. Share them on WhatsApp or print them for your counter. Free, no sign-up, and nothing leaves your phone.</span>
          </p>
        </div>
        <Studio />
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] text-sm text-muted min-[860px]:pb-8">
        <div className="border-t border-line pt-5">
          <p>Works with every UPI app: Google Pay, PhonePe, Paytm, BHIM and your bank&rsquo;s app. Money goes straight to your bank; this site never sees it.</p>
          <p className="mt-2">
            Your details stay in this browser. The site only counts page visits, without cookies.{" "}
            <a className="underline underline-offset-2" href="https://portfolio-gurudeep-naik.vercel.app">Made by Gurudeep ↗</a>
          </p>
        </div>
      </footer>
    </>
  );
}
