# MenuQR — Digital Menu & QR Code SaaS

A multi-tenant SaaS that lets restaurants, cafes and hotels create a beautiful
digital menu, publish it at a permanent link (`/menu/[slug]`), and share it with
one QR code that never changes. Owners manage categories, dishes, prices,
photos and availability from a mobile-first dashboard; customers just scan.

**Stack:** Next.js 14 (App Router) + React + TypeScript + Tailwind CSS ·
Supabase (PostgreSQL, Auth, Storage, Row Level Security) · `qrcode` for QR
generation · `lucide-react` icons · Deploys free on Vercel + Supabase free tier.

**→ Setup: follow [SETUP.md](./SETUP.md) step by step.** No credentials are
committed to this repo, and the app shows a clear “Supabase not connected”
state (never fake/demo data) until the env vars are set.

---

## What's built (MVP)

| Area | Route / file | What it does |
|---|---|---|
| Landing | `/` — `app/page.tsx` | Premium SaaS landing: hero, features, how-it-works, 4 plans, register/login CTAs |
| Auth | `/login`, `/register` | Supabase Auth email+password. Register creates the `profiles` row (role `owner`) via DB trigger + app fallback |
| Owner overview | `/dashboard` | Items, categories, scans today/month/total, availability, plan status, most-viewed items |
| Restaurant profile | `/dashboard/restaurant` | Name, slug (unique, editable), description, logo + cover upload (Storage) or URL paste, address, phone, WhatsApp, hours, currency, language, theme + accent colour, publish toggle |
| Categories | `/dashboard/categories` | Full CRUD, optional image, visibility, up/down reorder (`display_order`) |
| Menu items | `/dashboard/items` | Full CRUD: name, description, price, discount price, photo upload/URL, category, availability + featured toggles, reorder, search/filter. **Free-plan 5-item limit enforced** from the subscription's plan |
| QR code | `/dashboard/qr` | Permanent QR for `/menu/[slug]`, generated with the `qrcode` package; PNG + SVG download; printable table card (print CSS prints only the card) |
| Analytics | `/dashboard/analytics` | Total/today/month scans, daily scans bar list (14 days), most-viewed items & categories. Views ≠ purchases — labelled as such |
| Subscription | `/dashboard/subscription` | Current plan + usage vs limits + plan comparison. **No fake payments** — upgrades are activated manually by the Super Admin after verified payment |
| Public menu | `/menu/[slug]` | Flagship page: cover, logo, info, hours, search, sticky category chips, featured section, dish cards with photo/price/discount/availability, restaurant light/dark theme, WhatsApp button. Records `menu_scans` on load and `item_views` on dish tap. Works signed-out |
| Super Admin | `/admin` | Requires `profiles.role = 'super_admin'` (checked in DB + RLS). All restaurants, suspend/activate, all subscriptions, change a restaurant's plan, platform totals |

## Database (`supabase/schema.sql`)

Tables: `profiles`, `subscription_plans`, `restaurants`, `restaurant_members`,
`restaurant_settings` (1:1 per restaurant), `categories`, `menu_items`,
`qr_codes`, `menu_scans`, `item_views`, `subscriptions` — UUID PKs,
timestamps, indexes.

- **RLS on every table.** Owners/members only touch their own restaurants
  (`is_restaurant_member()` / `owns_restaurant()` helpers); anonymous visitors
  can only read *published* restaurants + their categories/items/settings and
  can only *insert* `menu_scans` / `item_views`; super admin full access via
  `is_super_admin()` reading `profiles.role`.
- **Signup trap fixed from the start:** besides the session-based insert
  policy, `profiles_insert_signup` allows the no-session (email-confirmation)
  insert in one safe shape only — role forced to `owner`.
- **Auto-setup trigger** on restaurant creation: owner membership row,
  `restaurant_settings`, default `qr_codes` row, and a FREE `subscriptions`
  row. Profile auto-created by a trigger on `auth.users` (+ app fallback).
- **Storage:** public bucket `menu-images` (5 MB, images only), public read,
  writes scoped to the uploader's own `{userId}/…` folder.
- **Seed data:** only the 4 subscription plans (Free 5 items/1 restaurant,
  Starter, Pro, Business) — platform configuration. No fake restaurants,
  categories or dishes anywhere.
- Only the public anon/publishable key is used in the frontend. The
  `service_role` key appears nowhere in this codebase.

## Project structure

```
app/
  page.tsx                  Landing page
  login/  register/         Auth (Supabase Auth, client-side)
  dashboard/                Owner dashboard (auth-guarded shell)
    page.tsx                Overview
    restaurant/ categories/ items/ qr/ analytics/ subscription/
  menu/[slug]/page.tsx      Public digital menu (signed-out OK)
  admin/page.tsx            Super Admin panel
components/
  DashboardShell.tsx        Mobile drawer + bottom tabs + desktop sidebar, auth guard
  ImageField.tsx            Storage upload OR URL paste for any image
  AuthShell.tsx, ui.tsx     Shared cards, buttons, inputs, states
lib/
  supabaseClient.ts         Browser client (null + setup state when env missing)
  useOwner.ts               Loads user/profile/restaurant/subscription
  types.ts, utils.ts        Row types, slugify, price formatting, uploads
supabase/schema.sql         Complete schema + RLS + triggers + storage + plan seed
```

## Local development

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key + site URL
npm run dev                  # http://localhost:3000
npm run build                # production build check
```

## Deliberately NOT in the MVP

Online ordering, WhatsApp ordering, reservations, waiter call, table-specific
QRs, POS, reviews, custom domains, and payment gateways. The schema is ready
for them (e.g. extra `qr_codes` rows per table, `subscriptions.ends_at`,
Stripe-ready plan rows) — see the master prompt's Phase plan. Plan limits and
manual activation come first; payments plug into `subscriptions` later without
a rebuild.
