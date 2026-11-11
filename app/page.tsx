import Link from "next/link";
import {
  QrCode, Smartphone, RefreshCw, BarChart3, Image as ImageIcon, ShieldCheck,
  Check, ArrowRight, Store, MousePointerClick, Printer, Globe, Zap, Wallet,
} from "lucide-react";

// Static plan presentation — mirrors the seeded `subscription_plans` rows.
// Prices are platform configuration and can be changed by the super admin.
const PLANS = [
  {
    name: "Free", price: "PKR 0", period: "forever", highlight: false,
    features: ["5 menu items", "1 restaurant", "Basic QR code", "Basic menu design", "Platform branding"],
  },
  {
    name: "Starter", price: "PKR 999", period: "/month", highlight: true,
    features: ["Unlimited menu items", "Custom restaurant branding", "QR code download (PNG + SVG)", "Basic analytics"],
  },
  {
    name: "Pro", price: "PKR 2,499", period: "/month", highlight: false,
    features: ["Everything in Starter", "Advanced analytics", "Direct ordering (dine-in + takeaway)", "Table QR codes", "Live order dashboard", "Extra menu customization"],
  },
  {
    name: "Business", price: "PKR 4,999", period: "/month", highlight: false,
    features: ["Everything in Pro", "Multiple restaurant branches", "Branch management", "Advanced analytics", "Priority support"],
  },
];

const FEATURES = [
  { icon: QrCode, title: "One permanent QR code", text: "Your QR points to your menu forever. Change prices, add dishes, mark items sold out — the printed code never changes." },
  { icon: Smartphone, title: "A menu customers love", text: "Mobile-first digital menu with photos, categories, search and your branding. No app download, no sign-up for customers." },
  { icon: RefreshCw, title: "Instant updates", text: "Edit a price in your dashboard and it is live on every table's QR within seconds. No reprinting, ever." },
  { icon: BarChart3, title: "Real scan analytics", text: "See daily and monthly QR scans, most-viewed categories and your most popular dishes — straight from real menu visits." },
  { icon: ImageIcon, title: "Your branding, your photos", text: "Upload your logo, cover photo and food pictures. Choose light or dark theme and your own accent colour." },
  { icon: ShieldCheck, title: "Private & secure", text: "Every restaurant's data is isolated with database-level security. Only you can manage your menu." },
];

const STEPS = [
  { icon: Store, title: "1. Create your restaurant", text: "Register free, add your name, logo, address and opening hours." },
  { icon: MousePointerClick, title: "2. Build your menu", text: "Add categories and dishes with photos, prices and discounts." },
  { icon: Printer, title: "3. Print your QR code", text: "Download the QR as PNG/SVG or print the ready-made table card." },
  { icon: Zap, title: "4. Customers scan & browse", text: "Guests scan and see your live menu instantly on their phones." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-body text-ink">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white"><QrCode size={20} /></span>
          <span className="font-heading text-lg font-semibold">Velora</span>
          <nav className="ml-auto flex items-center gap-2">
            <Link href="/login" className="inline-flex min-h-[44px] items-center rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:text-ink">Log in</Link>
            <Link href="/register" className="inline-flex min-h-[44px] items-center rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">Start free</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pb-14 pt-12 text-center sm:px-6 sm:pt-16">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-light/60 px-3 py-1 text-xs font-semibold text-brand-dark">
          <Wallet size={14} /> Free to start — no card required
        </span>
        <h1 className="mx-auto mt-5 max-w-3xl font-heading text-4xl font-bold leading-tight sm:text-5xl">
          Your restaurant menu, one scan away
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
          Create a beautiful digital menu, get a permanent QR code for your tables, and update
          prices anytime — your printed QR keeps working. Built for restaurants, cafes and hotels.
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/register" className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-base font-semibold text-white hover:bg-brand-dark sm:w-auto">
            Create my free menu <ArrowRight size={18} />
          </Link>
          <a href="#how" className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-slate-300 px-6 py-3 text-base font-medium text-slate-700 hover:bg-slate-50 sm:w-auto">
            See how it works
          </a>
        </div>
        <p className="mt-4 text-sm text-slate-500">Free plan: 5 menu items · 1 restaurant · permanent QR included</p>

        {/* Hero visual: stylised phone menu mock (pure CSS, no fake data claims) */}
        <div className="mx-auto mt-10 max-w-sm rounded-[2rem] border border-slate-200 bg-appbg p-3 shadow-pop">
          <div className="overflow-hidden rounded-[1.6rem] bg-white text-left">
            <div className="bg-ink px-5 py-6 text-white">
              <p className="font-heading text-lg font-semibold">Your Restaurant</p>
              <p className="text-xs text-slate-300">Digital menu · Scan to view</p>
            </div>
            <div className="space-y-3 px-5 py-4">
              {["Burgers", "Pizza", "Drinks"].map((c) => (
                <div key={c} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-light/60 text-brand"><UtensilsIcon /></span>
                  <div>
                    <p className="text-sm font-semibold">{c}</p>
                    <p className="text-xs text-slate-500">Tap to browse dishes</p>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-center gap-2 rounded-xl bg-ink py-3 text-sm font-medium text-white">
                <QrCode size={18} /> yourdomain.com/menu/your-restaurant
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-y border-slate-100 bg-appbg py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center font-heading text-2xl font-bold sm:text-3xl">Everything a modern menu needs</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-slate-600">No technical knowledge required. If you can use WhatsApp, you can run your digital menu.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl bg-white p-5 shadow-card">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-light/60 text-brand-dark"><f.icon size={22} /></span>
                <h3 className="mt-3 font-heading text-base font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-center font-heading text-2xl font-bold sm:text-3xl">Live in four steps</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.title} className="rounded-2xl border border-slate-200 p-5">
              <s.icon size={26} className="text-brand" />
              <h3 className="mt-3 font-heading text-base font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{s.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Globe size={16} /> Works on any Android or iPhone browser — nothing to install.
        </div>
      </section>

      {/* Plans */}
      <section className="border-y border-slate-100 bg-appbg py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center font-heading text-2xl font-bold sm:text-3xl">Simple pricing</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-slate-600">Start free. Upgrade when your menu grows — paid plans are activated by our team after payment confirmation.</p>
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {PLANS.map((p) => (
              <div key={p.name} className={`flex flex-col rounded-2xl bg-white p-6 shadow-card ${p.highlight ? "ring-2 ring-brand" : ""}`}>
                {p.highlight && <span className="mb-3 self-start rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-semibold text-white">MOST POPULAR</span>}
                <h3 className="font-heading text-lg font-semibold">{p.name}</h3>
                <p className="mt-2"><span className="font-heading text-3xl font-bold">{p.price}</span><span className="text-sm text-slate-500"> {p.period}</span></p>
                <ul className="mt-4 flex-1 space-y-2">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-600"><Check size={16} className="mt-0.5 shrink-0 text-brand" /> {f}</li>
                  ))}
                </ul>
                <Link href="/register" className={`mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold ${p.highlight ? "bg-brand text-white hover:bg-brand-dark" : "border border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
                  Start with {p.name}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
        <h2 className="font-heading text-2xl font-bold sm:text-3xl">Put your menu on every table today</h2>
        <p className="mx-auto mt-3 max-w-xl text-slate-600">Create your free account, add your dishes, print one QR code — done.</p>
        <Link href="/register" className="mt-7 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-brand px-7 py-3 text-base font-semibold text-white hover:bg-brand-dark">
          Get started free <ArrowRight size={18} />
        </Link>
      </section>

      <footer className="border-t border-slate-100 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 text-center text-sm text-slate-500 sm:px-6">
          <span className="flex items-center gap-2 font-heading font-semibold text-ink"><QrCode size={18} className="text-brand" /> Velora</span>
          <p>Digital menus & QR codes for restaurants, cafes and hotels.</p>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-ink">Log in</Link>
            <Link href="/register" className="hover:text-ink">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function UtensilsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" /><path d="M7 2v20" /><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </svg>
  );
}
