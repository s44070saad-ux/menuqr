"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Store, FolderTree, UtensilsCrossed, QrCode, BarChart3,
  CreditCard, Menu, X, MoreHorizontal, Home, LogOut, Loader2, ShieldCheck, ClipboardList, ChefHat,
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import { NotConfigured } from "./ui";
import type { Profile } from "@/lib/types";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/orders", label: "Orders", icon: ClipboardList },
  { href: "/dashboard/kitchen", label: "Kitchen (KDS)", icon: ChefHat },
  { href: "/dashboard/restaurant", label: "Restaurant", icon: Store },
  { href: "/dashboard/categories", label: "Categories", icon: FolderTree },
  { href: "/dashboard/items", label: "Menu Items", icon: UtensilsCrossed },
  { href: "/dashboard/qr", label: "QR Code", icon: QrCode },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/subscription", label: "Subscription", icon: CreditCard },
];

const TABS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/orders", label: "Orders", icon: ClipboardList },
  { href: "/dashboard/items", label: "Items", icon: UtensilsCrossed },
  { href: "/dashboard/qr", label: "QR Code", icon: QrCode },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Owner dashboard shell: mobile sticky header + slide-in drawer, desktop
 * sidebar, fixed bottom tab bar on mobile. Includes the auth guard —
 * signed-out visitors, or users without a profile, are sent to /login
 * and dashboard content is never rendered before the check completes.
 */
export default function DashboardShell({ title, children }: { title: string; children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [authChecked, setAuthChecked] = useState(!isSupabaseConfigured);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!u.user) { router.replace("/login"); return; }
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).single();
      if (cancelled) return;
      if (!data) { router.replace("/login"); return; }
      setProfile(data as Profile);
      setAuthChecked(true);
    })();
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => { setDrawerOpen(false); }, [pathname]);
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [drawerOpen]);

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    router.replace("/login");
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-appbg px-4 py-10 font-body">
        <NotConfigured />
      </div>
    );
  }

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-appbg font-body text-slate-600">
        <div className="flex items-center gap-3 text-sm">
          <Loader2 size={20} className="animate-spin text-brand" /> Checking your session…
        </div>
      </div>
    );
  }

  const brand = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
        <QrCode size={20} />
      </span>
      <div>
        <p className="font-heading text-lg font-semibold leading-none">Velora</p>
        <p className="mt-0.5 text-[11px] text-slate-300">Restaurant dashboard</p>
      </div>
    </>
  );

  const footer = (
    <div className="space-y-2 px-5 pb-5 pt-4">
      {profile && (
        <div className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand font-heading text-sm font-semibold text-white">
            {(profile.full_name || profile.email).trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{profile.full_name || "Restaurant owner"}</p>
            <p className="truncate text-[11px] text-slate-300">{profile.email}</p>
          </div>
        </div>
      )}
      {profile?.role === "super_admin" && (
        <Link href="/admin" className="flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2 text-sm text-amber-300 hover:bg-white/10 lg:min-h-0">
          <ShieldCheck size={18} /> Super Admin panel
        </Link>
      )}
      <Link href="/" className="flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white lg:min-h-0">
        <Home size={18} /> Back to homepage
      </Link>
      <button type="button" onClick={signOut} className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/10 hover:text-white lg:min-h-0">
        <LogOut size={18} /> Sign out
      </button>
    </div>
  );

  const navLinks = (onNavigate?: () => void) => NAV.map((item) => {
    const active = isActive(pathname, item.href);
    return (
      <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
        className={`flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm lg:min-h-0 lg:py-2 ${active ? "bg-white/15 font-medium text-white" : "text-slate-200 hover:bg-white/10 hover:text-white"}`}>
        <item.icon size={18} className="shrink-0" /> {item.label}
      </Link>
    );
  });

  return (
    <div className="min-h-screen bg-appbg font-body text-slate-800 lg:flex">
      {/* Mobile sticky header */}
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-ink px-4 py-3 text-white lg:hidden">
        {brand}
        <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Open menu" aria-expanded={drawerOpen}
          className="ml-auto flex min-h-[44px] items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white">
          <Menu size={20} /> Menu
        </button>
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Main menu">
          <button type="button" aria-label="Close menu" onClick={() => setDrawerOpen(false)} className="absolute inset-0 h-full w-full bg-black/50" />
          <aside className="absolute inset-y-0 left-0 flex w-[85vw] max-w-xs flex-col bg-ink text-white shadow-2xl">
            <div className="flex items-center gap-2 px-5 py-4">
              {brand}
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close menu"
                className="ml-auto flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white">
                <X size={22} />
              </button>
            </div>
            <nav aria-label="Dashboard navigation" className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">{navLinks(() => setDrawerOpen(false))}</nav>
            {footer}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden bg-ink text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col">
        <div className="flex items-center gap-2 px-5 py-4">{brand}</div>
        <nav aria-label="Dashboard navigation" className="flex-1 space-y-1 overflow-y-auto px-3">{navLinks()}</nav>
        {footer}
      </aside>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 sm:px-6 lg:py-6 lg:pb-6">
        <p className="text-xs text-slate-500">Dashboard / {title}</p>
        <h1 className="mb-5 mt-1 font-heading text-[22px] font-semibold text-ink sm:text-2xl">{title}</h1>
        {children}
      </main>

      {/* Mobile bottom tab bar */}
      <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 shadow-[0_-2px_10px_rgba(16,24,40,0.08)] backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="grid grid-cols-5">
          {TABS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] font-medium ${active ? "text-brand" : "text-slate-500"}`}>
                <item.icon size={21} className={active ? "text-brand" : "text-slate-400"} /> {item.label}
              </Link>
            );
          })}
          <button type="button" onClick={() => setDrawerOpen(true)} aria-label="More — open full menu" aria-expanded={drawerOpen}
            className="flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] font-medium text-slate-500">
            <MoreHorizontal size={21} className="text-slate-400" /> More
          </button>
        </div>
      </nav>
    </div>
  );
}
