import Link from "next/link";
import {
  QrCode, Smartphone, RefreshCw, BarChart3, Image as ImageIcon, ShieldCheck,
  Check, X, ArrowRight, Store, MousePointerClick, Printer, Globe, Zap, Wallet,
  ClipboardList, ChefHat, SlidersHorizontal, Palette, Languages, MessageCircle,
  MousePointer2, Sparkles,
} from "lucide-react";
import HeroQr from "@/components/HeroQr";

// Static plan presentation — mirrors the seeded `subscription_plans` rows.
// Prices are platform configuration and can be changed by the super admin.
const PLANS = [
  {
    slug: "free", name: "Free", price: "PKR 0", period: "forever", highlight: false,
    features: ["5 menu items", "1 restaurant", "Basic QR code", "Basic menu design", "Platform branding"],
  },
  {
    slug: "starter", name: "Starter", price: "PKR 2,999", period: "/month", highlight: false,
    features: ["Unlimited menu items", "Custom restaurant branding", "QR code download (PNG + SVG)", "Menu themes & styled QR codes", "Basic analytics"],
  },
  {
    slug: "pro", name: "Pro", price: "PKR 4,999", period: "/month", highlight: true,
    features: ["Everything in Starter", "Direct ordering (dine-in + takeaway)", "Kitchen display (KDS)", "Item variations & add-ons", "WhatsApp order alerts", "Table QR codes", "Advanced analytics"],
  },
  {
    slug: "business", name: "Business", price: "PKR 8,999", period: "/month", highlight: false,
    features: ["Everything in Pro", "Multiple restaurant branches", "Branch management", "Advanced analytics", "Priority support"],
  },
];

const FEATURES = [
  { icon: QrCode, title: "One permanent QR code", text: "Your QR points to your menu forever. Change prices, add dishes, mark items sold out — the printed code never changes." },
  { icon: ClipboardList, title: "Direct ordering built in", text: "Customers order from the table or for takeaway, right from the menu. Orders land live in your dashboard — no commission, ever." },
  { icon: ChefHat, title: "Kitchen display (KDS)", text: "A big live board for the kitchen: new orders, preparing, done — with a sound alert the moment an order arrives." },
  { icon: SlidersHorizontal, title: "Variations & add-ons", text: "Sizes, extra cheese, spice levels, optional extras — with per-option prices, checked by the server on every order." },
  { icon: Palette, title: "Themes & styled QR codes", text: "Four menu design themes, QR codes in your brand colour with your logo in the centre, and table-card designs that match." },
  { icon: Languages, title: "English + Urdu menus", text: "One tap switches the whole menu between English and full Urdu (RTL). Your dish names stay exactly as you wrote them." },
  { icon: MessageCircle, title: "WhatsApp order alerts", text: "Customers can forward their order straight to your WhatsApp, on top of the live dashboard alert and sound." },
  { icon: BarChart3, title: "Real analytics", text: "True QR scans (not page loads), most-viewed dishes, daily and monthly trends — counted from your actual menu traffic." },
  { icon: RefreshCw, title: "Instant updates", text: "Edit a price in your dashboard and it is live on every table's QR within seconds. No reprinting, ever." },
  { icon: ImageIcon, title: "Your branding, your photos", text: "Upload your logo, cover photo and food pictures. Choose a theme, light or dark, and your own accent colour." },
  { icon: Smartphone, title: "No app, no sign-up, no gate", text: "Customers scan and see your food instantly — no app download, no account, and no phone-number wall before the menu." },
  { icon: ShieldCheck, title: "Private & secure", text: "Every restaurant's data is isolated with database-level security, and plan limits are enforced in the database — not just hidden in the interface." },
];

const STEPS = [
  { icon: Store, title: "1. Create your restaurant", text: "Register free, add your name, logo, address and opening hours." },
  { icon: MousePointerClick, title: "2. Build your menu", text: "Add categories and dishes with photos, prices, discounts, variations and add-ons." },
  { icon: Printer, title: "3. Print your QR code", text: "Download the QR as PNG/SVG or print the ready-made table card in your brand style." },
  { icon: Zap, title: "4. Customers scan, browse & order", text: "Guests scan and see your live menu instantly — and on Pro they order straight from the table." },
];

const COMPARE: { label: string; velora: string; qlinko: string; win?: boolean }[] = [
  { label: "Setup / “installation” fee", velora: "PKR 0 — self-serve", qlinko: "PKR 28,000 one-time", win: true },
  { label: "Item variations & add-ons", velora: "Yes — sizes, extras, priced options", qlinko: "Not available", win: true },
  { label: "Your logo inside the QR code", velora: "Yes", qlinko: "No", win: true },
  { label: "Menu opens without a phone-number gate", velora: "Yes — food first", qlinko: "No — phone number first", win: true },
  { label: "Analytics", velora: "Real scans & orders from your restaurant", qlinko: "Dashboard demo figures", win: true },
  { label: "Kitchen display (KDS)", velora: "Yes (Pro)", qlinko: "Yes (Professional)" },
  { label: "Urdu menus", velora: "Yes", qlinko: "Yes" },
  { label: "Pro-level plan", velora: "PKR 4,999/mo", qlinko: "PKR 4,999/mo" },
];

const FAQS = [
  {
    q: "Do you charge a setup or installation fee?",
    a: "No — zero. Velora is fully self-serve: register, add your menu, download your QR code and print it. Some providers charge PKR 28,000 just for “professional installation”; we think a menu you set up yourself in 5 minutes shouldn't cost that.",
  },
  {
    q: "How does the 3-day free trial work?",
    a: "You pick the plan. When you set up your restaurant, choose any paid plan — Starter, Pro or Business — and it switches on free for 3 days, every feature included. Pro is preselected because it's the most popular. No card, no commitment. When the trial ends you continue on the Free plan (your menu and QR keep working), and if you pay before the trial ends, your paid time stacks on top of the remaining trial days.",
  },
  {
    q: "How do I pay for a paid plan?",
    a: "Pay by JazzCash, Easypaisa or bank transfer and send us the confirmation — our team activates your plan manually and sets your due date. No card is stored, and there is no automatic charge.",
  },
  {
    q: "Do my customers need an app or an account?",
    a: "No. Customers scan the table QR with any phone camera and the menu opens in their browser — no app, no sign-up, and we never ask for their phone number before showing your food. A phone number is only requested for takeaway orders, so you can call them back.",
  },
  {
    q: "If I change a price, do I need new QR codes?",
    a: "Never. Your QR code is permanent — it always points to your live menu. Update prices, add dishes or mark something sold out and every printed code shows the new menu within seconds.",
  },
  {
    q: "Can customers actually order, or is it just a menu?",
    a: "On Pro and Business, customers order dine-in (their table number comes from the table's own QR) or takeaway. Orders arrive live in your dashboard and kitchen display with a sound alert; you confirm, they watch the status update on their phone, and they pay at your counter — Velora takes 0% commission.",
  },
  {
    q: "Does it work in Urdu?",
    a: "Yes. Every menu has an English/اردو toggle that switches the full interface, right-to-left included. Many owners also write dish names in Urdu or Roman Urdu — that works too.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Paid plans are month-to-month with manual activation — if you stop paying, your restaurant simply returns to the Free plan. Your menu, QR code and data stay yours.",
  },
];

const BUILT_FOR = ["Restaurants", "Cafes", "Dhabas", "Fast food", "Food courts", "Hotels", "Chai spots", "Bakeries"];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-body text-ink">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white"><QrCode size={20} /></span>
          <span className="font-heading text-lg font-semibold">Velora</span>
          <nav className="ml-auto flex items-center gap-1 sm:gap-2">
            <a href="#features" className="hidden min-h-[44px] items-center rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:text-ink md:inline-flex">Features</a>
            <Link href="/menu/spice-route" className="hidden min-h-[44px] items-center rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:text-ink sm:inline-flex">Live demo</Link>
            <a href="#pricing" className="hidden min-h-[44px] items-center rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:text-ink md:inline-flex">Pricing</a>
            <a href="#faq" className="hidden min-h-[44px] items-center rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:text-ink md:inline-flex">FAQ</a>
            <Link href="/login" className="inline-flex min-h-[44px] items-center rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:text-ink">Log in</Link>
            <Link href="/register" className="inline-flex min-h-[44px] items-center rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">Start free</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-light/40 via-white to-white" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-2 lg:pt-20">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-light/60 px-3 py-1 text-xs font-semibold text-brand-dark">
              <Wallet size={14} /> Free to start — no card, no setup fee
            </span>
            <h1 className="mt-5 font-heading text-[1.9rem] font-bold leading-[1.14] sm:text-5xl sm:leading-[1.08] lg:text-[3.4rem]">
              Your menu, one scan away. <span className="whitespace-nowrap text-brand">Orders included.</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg lg:mx-0">
              A beautiful digital menu with a permanent QR code for every table — and on Pro,
              customers order straight from their phone to your kitchen display. Built for
              restaurants, cafes and hotels in Pakistan.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
              <Link href="/register" className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-base font-semibold text-white hover:bg-brand-dark sm:w-auto">
                Create my free menu <ArrowRight size={18} />
              </Link>
              <Link href="/menu/spice-route" className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 text-base font-medium text-slate-700 hover:bg-slate-50 sm:w-auto">
                <MousePointer2 size={18} className="text-brand" /> See a live menu
              </Link>
            </div>
            <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-slate-500 lg:justify-start">
              {["Live in about 5 minutes", "3-day free trial — any plan", "PKR pricing", "English + اردو", "0% order commission"].map((x) => (
                <li key={x} className="flex items-center gap-1.5"><Check size={15} className="text-brand" /> {x}</li>
              ))}
            </ul>
          </div>

          {/* Hero visual — phone menu + floating live cards (illustrative UI) */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="mx-auto max-w-sm rounded-[2rem] border border-slate-200 bg-appbg p-3 shadow-pop">
              <div className="overflow-hidden rounded-[1.6rem] bg-white text-left">
                <div className="bg-ink px-5 py-5 text-white">
                  <p className="font-heading text-lg font-semibold">Spice Route</p>
                  <p className="text-xs text-slate-300">Digital menu · Table 3 · اردو / EN</p>
                </div>
                <div className="space-y-3 px-5 py-4">
                  {[
                    { name: "Chicken Malai Boti", meta: "Creamy charcoal-grilled · 8 pcs", price: "PKR 850" },
                    { name: "Chicken Karahi", meta: "Half · Desi ghee · Serves 2–3", price: "PKR 1,450" },
                    { name: "Mint Margarita", meta: "Fresh mint · Soda", price: "PKR 250" },
                  ].map((d) => (
                    <div key={d.name} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-light/60 text-brand"><UtensilsIcon /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{d.name}</p>
                        <p className="truncate text-xs text-slate-500">{d.meta}</p>
                      </div>
                      <span className="text-sm font-bold text-brand-dark">{d.price}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white">
                    <span>2 items · PKR 2,000</span><span>View cart & order</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating: live order card */}
            <div className="absolute -right-2 top-6 hidden w-56 rounded-2xl bg-white p-3.5 shadow-pop sm:block lg:-right-6">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-600">
                <span className="h-2 w-2 rounded-full bg-amber-400" /> New order · Table 3
              </p>
              <p className="mt-1.5 text-sm font-semibold">Chicken Malai Boti ×1 <span className="font-normal text-slate-400">· With mint raita</span></p>
              <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                <Check size={12} /> Confirmed — kitchen is preparing
              </p>
            </div>

            {/* Floating: scannable demo QR */}
            <div className="absolute -left-2 bottom-8 hidden rounded-2xl bg-white p-3 text-center shadow-pop sm:block lg:-left-8">
              <HeroQr size={96} />
              <p className="mt-1.5 text-[11px] font-semibold text-slate-500">Scan me — live demo</p>
            </div>

            {/* Mobile-only: live-order strip (the floating cards above are sm+) */}
            <div className="mx-auto mt-4 max-w-sm rounded-2xl bg-white p-3.5 shadow-pop sm:hidden">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-600">
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" /> New order · Table 3
              </p>
              <p className="mt-1.5 text-sm font-semibold">Chicken Malai Boti ×1 <span className="font-normal text-slate-400">· With mint raita</span></p>
              <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                <Check size={12} /> Confirmed — kitchen is preparing
              </p>
            </div>
          </div>
        </div>

        {/* Proof strip */}
        <div className="relative border-y border-slate-100 bg-white">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 py-6 text-center sm:px-6 lg:grid-cols-4">
            {[
              { big: "PKR 0", small: "setup / installation fee" },
              { big: "~5 min", small: "from signup to live menu" },
              { big: "0%", small: "commission on your orders" },
              { big: "2 languages", small: "English + full Urdu (RTL)" },
            ].map((s) => (
              <div key={s.small}>
                <p className="font-heading text-2xl font-bold text-ink">{s.big}</p>
                <p className="mt-0.5 text-sm text-slate-500">{s.small}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-appbg py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center font-heading text-2xl font-bold sm:text-3xl">Everything a modern restaurant needs</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-slate-600">No technical knowledge required. If you can use WhatsApp, you can run Velora.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl bg-white p-5 shadow-card">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-light/60 text-brand-dark"><f.icon size={22} /></span>
                <h3 className="mt-3 font-heading text-base font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{f.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-sm text-slate-500">
            <Sparkles size={16} className="text-brand" /> Built for:
            {BUILT_FOR.map((b) => (
              <span key={b} className="rounded-full bg-white px-3 py-1 font-medium text-slate-600 shadow-card">{b}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Live demo band */}
      <section className="bg-ink py-14 text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-4 text-center sm:px-6 lg:flex-row lg:text-left">
          <div className="flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Live right now
            </span>
            <h2 className="mt-4 font-heading text-2xl font-bold sm:text-3xl">Don't take our word for it — open a real Velora menu</h2>
            <p className="mx-auto mt-3 max-w-xl leading-relaxed text-slate-300 lg:mx-0">
              Spice Route is a demo restaurant running on Velora at this moment. Scan the code with
              your phone or tap through — themes, categories and ordering work exactly as your
              customers will see them.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row lg:justify-start sm:justify-center">
              <Link href="/menu/spice-route" className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-dark">
                Open the live demo <ArrowRight size={18} />
              </Link>
              <a href="#how" className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-white/25 px-6 py-3 font-medium text-white hover:bg-white/10">
                How it works
              </a>
            </div>
          </div>
          <div className="shrink-0 rounded-3xl bg-white p-4 text-center shadow-pop">
            <HeroQr size={168} />
            <p className="mt-2 text-xs font-semibold text-slate-500">veloraqr.vercel.app/menu/spice-route</p>
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

      {/* Comparison */}
      <section className="border-y border-slate-100 bg-appbg py-14">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="text-center font-heading text-2xl font-bold sm:text-3xl">Velora vs Others</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-slate-600">Checked against other QR-menu providers' public pricing and products in November 2026.</p>
          <div className="mt-8 overflow-hidden rounded-2xl bg-white shadow-card">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="px-4 py-3 font-medium sm:px-5">Feature</th>
                  <th className="px-4 py-3 font-heading font-bold text-brand-dark sm:px-5">Velora</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell sm:px-5">Others</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row) => (
                  <tr key={row.label} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-700 sm:px-5">{row.label}</td>
                    <td className="px-4 py-3 sm:px-5">
                      <span className="flex items-start gap-1.5 font-semibold text-ink">
                        <Check size={16} className="mt-0.5 shrink-0 text-brand" /> {row.velora}
                      </span>
                      <span className="mt-1 flex items-start gap-1.5 text-slate-500 sm:hidden">
                        {row.win ? <X size={15} className="mt-0.5 shrink-0 text-red-400" /> : <span className="w-[15px]" />}
                        Others: {row.qlinko}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-slate-500 sm:table-cell sm:px-5">
                      <span className="flex items-start gap-1.5">
                        {row.win ? <X size={16} className="mt-0.5 shrink-0 text-red-400" /> : <Check size={16} className="mt-0.5 shrink-0 text-slate-400" />}
                        {row.qlinko}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section id="pricing" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-center font-heading text-2xl font-bold sm:text-3xl">Simple pricing in PKR</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-slate-600">Every new restaurant starts with a <strong>free 3-day trial of any paid plan</strong> — pick Starter, Pro or Business when you set up (Pro is preselected, it's the most popular). No card required. After that, stay on Free or upgrade; paid plans are activated by our team after payment confirmation. No setup fee, no commission, cancel anytime.</p>
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((p) => (
            <div key={p.name} className={`flex flex-col rounded-2xl bg-white p-6 shadow-card ring-1 ring-slate-100 ${p.highlight ? "!ring-2 !ring-brand" : ""}`}>
              {p.highlight && <span className="mb-3 self-start rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-semibold text-white">MOST POPULAR</span>}
              <h3 className="font-heading text-lg font-semibold">{p.name}</h3>
              <p className="mt-2"><span className="font-heading text-3xl font-bold">{p.price}</span><span className="text-sm text-slate-500"> {p.period}</span></p>
              <ul className="mt-4 flex-1 space-y-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-600"><Check size={16} className="mt-0.5 shrink-0 text-brand" /> {f}</li>
                ))}
              </ul>
              <Link href={p.slug === "free" ? "/register" : `/register?plan=${p.slug}`} className={`mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold ${p.highlight ? "bg-brand text-white hover:bg-brand-dark" : "border border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
                Start with {p.name}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-slate-100 bg-appbg py-14">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-center font-heading text-2xl font-bold sm:text-3xl">Frequently asked questions</h2>
          <div className="mt-8 space-y-3">
            {FAQS.map((f) => (
              <details key={f.q} className="group rounded-2xl bg-white px-5 py-4 shadow-card">
                <summary className="cursor-pointer list-none font-heading text-[15px] font-semibold marker:hidden">
                  <span className="flex items-center justify-between gap-3">
                    {f.q}
                    <span className="shrink-0 text-brand transition group-open:rotate-45"><PlusIcon /></span>
                  </span>
                </summary>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
        <h2 className="font-heading text-2xl font-bold sm:text-3xl">Put your menu on every table today</h2>
        <p className="mx-auto mt-3 max-w-xl text-slate-600">Create your free account, add your dishes, print one QR code — done. Your future self (and your printer budget) will thank you.</p>
        <Link href="/register" className="mt-7 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-brand px-7 py-3 text-base font-semibold text-white hover:bg-brand-dark">
          Get started free <ArrowRight size={18} />
        </Link>
      </section>

      <footer className="border-t border-slate-100 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 text-center text-sm text-slate-500 sm:px-6">
          <span className="flex items-center gap-2 font-heading font-semibold text-ink"><QrCode size={18} className="text-brand" /> Velora</span>
          <p>Digital menus, QR codes & ordering for restaurants, cafes and hotels in Pakistan.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/menu/spice-route" className="hover:text-ink">Live demo</Link>
            <a href="#pricing" className="hover:text-ink">Pricing</a>
            <a href="#faq" className="hover:text-ink">FAQ</a>
            <Link href="/login" className="hover:text-ink">Log in</Link>
            <Link href="/register" className="hover:text-ink">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function UtensilsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" /><path d="M7 2v20" /><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </svg>
  );
}
