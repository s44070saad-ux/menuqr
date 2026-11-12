# Velora — Setup & Deployment Guide

Exact steps, in order. Everything uses free tiers. Budget ~20 minutes.
Do **not** skip Step 2 — without the database schema nothing can save data.

---

## Step 1 — Create the Supabase project

1. Go to https://supabase.com → sign in → **New project**.
2. Name it e.g. `menuqr`, choose a strong database password (save it in your
   password manager), pick the closest region, create (free plan).
3. Wait until the project finishes provisioning.

## Step 2 — Run the database schema

1. In the Supabase project: **SQL Editor → New query**.
2. Open `supabase/schema.sql` from this repo, copy the **entire** file,
   paste it in, press **Run**. You should see “Success. No rows returned”.
   The file is safe to re-run if you ever need to.
3. This creates all tables, RLS policies, triggers, the public
   `menu-images` storage bucket, and seeds the 4 subscription plans.
5. **Then run the ordering + analytics migration the same way:**
   open `supabase/migration-ordering.sql`, copy the entire file, paste it
   into a new SQL query and press **Run**. It adds customer ordering for
   Pro/Business (orders tables, `place_customer_order` /
   `get_customer_order` RPCs, per-table QR codes), the
   `restaurant_settings.enable_ordering` toggle, and the analytics fix
   (`menu_scans.source` QR-vs-link, table number, visitor id). Safe to re-run.
   On the already-live project this migration is the ONLY SQL needed —
   schema.sql does not need to be re-run.
6. **Then run the Admin v2 migration the same way:**
   `supabase/migration-admin-v2.sql` adds the `payments` table (the Super
   Admin's manual payment log) and makes `restaurant_plan_slug()` expiry-
   aware, so a paid plan past its due date (`subscriptions.ends_at`)
   behaves as Free until a new payment is confirmed in /admin.
7. **Then run the Phase A+B migration the same way:**
   `supabase/migration-phase-ab.sql` adds menu themes + QR styling
   settings (`menu_theme`, `qr_color`, `card_style`), item option
   groups/options (variations & add-ons) with RLS, the
   `order_items.options_snapshot` column, options-aware versions of
   `place_customer_order` / `get_customer_order`, and refreshed plan
   feature lists. Safe to re-run. On the already-live project, run ONLY
   this file — the earlier migrations are already applied.
8. **Then run the free-trial migration the same way:**
   `supabase/migration-trial.sql` changes the restaurant-creation
   trigger so every NEW restaurant starts on a 3-day free Pro trial
   (status `trialing`, `ends_at` = now + 3 days) instead of Free.
   Expiry is automatic: `restaurant_plan_slug()` returns `free` once
   the trial ends. Existing restaurants are not affected.
9. **Then run the trial-plans migration the same way:**
   `supabase/migration-trial-plans.sql` adds `restaurants.trial_plan_slug`
   and lets the owner pick ANY paid plan to trial at restaurant setup
   (Starter / Pro / Business; Pro default; explicit Free = no trial).
   The setup form writes the column; the homepage plan CTAs carry it
   through registration (`/register?plan=pro`).
10. **Then run the Phase 1.1 allergens migration the same way:**
    `supabase/migration-phase1-allergens.sql` adds `allergens` (text[]),
    `dietary` (text[]) and `calories` (integer) to `menu_items`
    (EU-14 allergen keys + dietary flags, all plans — legal info).
11. **Then run the Phase 1.4 charges migration the same way:**
    `supabase/migration-phase1-charges.sql` adds `tax_percent`,
    `service_percent` and `min_order_amount` to `restaurant_settings`,
    a charge breakdown (`subtotal_amount`, `tax_amount`,
    `service_amount`) to `orders`, and replaces `place_customer_order`
    / `get_customer_order` so totals are computed server-side.
12. **Then run the Phase 1.5 ETA migration the same way:**
    `supabase/migration-phase1-eta.sql` adds `prep_time_minutes`
    (default 20) to `restaurant_settings` — the customer order page
    shows a Received → Preparing → Ready timeline and a ready-by ETA
    from the confirmation time + this setting.
13. **Then run the Phase 2 upsell migration the same way:**
    `supabase/migration-phase2-upsell.sql` adds
    `menu_items.suggested_item_ids` (owner-picked "pairs well with"
    suggestions), `order_items.via_upsell` (suggestion attribution),
    the `popular_item_ids()` function behind the "Popular" badge, and
    replaces `place_customer_order` to store the attribution.
14. **Then run the Phase 2 feedback migration the same way:**
    `supabase/migration-phase2-feedback.sql` adds
    `restaurant_settings.google_review_url`, the private `feedback`
    table (owner-read RLS, no direct public writes), and the
    token-gated `submit_order_feedback()` RPC used by the post-order
    review/feedback prompt.
15. **Then run the Phase 2 schedules migration the same way:**
    `supabase/migration-phase2-schedules.sql` adds per-item
    availability windows (`available_from`/`available_to`),
    `restaurant_settings.timezone`, and the `price_schedules`
    happy-hour table (RLS: public reads active schedules, only
    Pro/Business restaurants can write them), and replaces
    `place_customer_order` to enforce windows + schedule discounts
    server-side.
16. **Then run the Phase 3 migration the same way:**
    `supabase/migration-phase3.sql` adds the `customers` table
    (auto-built from orders by phone), `coupons` + `gift_cards`
    (Pro/Business writes in RLS, re-validated inside
    `place_customer_order` — coupons discount before tax/service,
    gift cards pay last against the post-charge total), loyalty
    settings on `restaurant_settings`, the `winback_sends` log, and
    the `preview_discount` / `unsubscribe_customer` RPCs.
17. **Win-back email (optional):** create a free Resend account and
    set `RESEND_API_KEY` (optionally `RESEND_FROM`) in the Vercel
    project env vars. Without it, the Customers page's win-back
    composer states that email is not configured — nothing is sent
    or faked.
18. **Then run the Phase 4 migration the same way:**
    `supabase/migration-phase4.sql` adds order tips + payment state,
    the restaurant Stripe settings columns, and the
    `restaurant_secrets` table (RLS on, no client policies — only
    the server-side API routes can read restaurant Stripe keys).
19. **Card payments platform key (required for Stripe):** in the
    Supabase project → Settings → API, copy the `service_role`
    secret and set it as `SUPABASE_SERVICE_ROLE_KEY` in the Vercel
    project env vars (Production + Preview), then redeploy. It is
    used ONLY by the `/api/stripe/*` server routes and must never
    appear in client code or the repo.
    Restaurants then connect their OWN Stripe account from
    Dashboard → Orders (restricted key with Checkout Sessions:
    Write; optional webhook to `/api/stripe/webhook` for the
    `checkout.session.completed` / `checkout.session.expired`
    events). Velora never touches the money.
20. **Then run the Phase 5 migrations the same way, in this order:**
    `supabase/migration-phase5-i18n.sql` (translation tables +
    `restaurant_settings.menu_languages`) and
    `supabase/migration-phase5-square.sql` (Square columns on
    settings/secrets + `orders.square_order_id`).
21. **Menu languages (optional):** owners enable Spanish/French/
    German/Italian in Dashboard → Items → Menu languages and press
    Auto-translate. Translations come from the free MyMemory API
    and are cached in the database forever. Set `TRANSLATE_EMAIL`
    in Vercel env to raise the free quota to ~10,000 words/day
    (a full menu is a few hundred words).
22. **Square POS (optional, for the platform owner):** create a
    Square developer account (developer.squareup.com — developers
    outside Square's seller countries may still build OAuth apps
    for sellers in supported countries, as long as the app itself
    takes no payments), create an application with redirect URI
    `<site>/api/square/callback`, and set `SQUARE_APPLICATION_ID`,
    `SQUARE_APPLICATION_SECRET` and `SQUARE_ENVIRONMENT`
    (`sandbox` while testing, `production` live) in Vercel env,
    then redeploy. Restaurants then connect from Dashboard →
    Orders → Square POS and pick a location; orders get a
    "Send to Square" button. OAuth tokens refresh automatically.
4. Verify: **Storage** should show a bucket named `menu-images` (public).
   If it is missing for any reason, create it manually: Storage → New bucket →
   name `menu-images`, **Public bucket ON** — then re-run the storage policy
   section of `schema.sql` (or simply re-run the whole file).

## Step 3 — Auth settings (email confirmation)

- Default Supabase behaviour asks new users to confirm their email before
  first login. Velora handles **both** settings correctly:
  the DB trigger creates the profile at signup, the app-side insert works
  with or without a session (see `profiles_insert_signup` in schema.sql).
- For the smoothest testing, you may turn confirmation OFF:
  **Authentication → Sign In / Providers → Email → “Confirm email” OFF → Save.**
  Turn it back ON for real public signups if you prefer verified emails.
- In **Authentication → URL Configuration**, set **Site URL** to your deployed
  site URL (Step 6) and add it under **Redirect URLs** — needed for the
  confirmation/login email links to land on the right domain.

## Step 4 — Get your API keys

**Project Settings → API.** You need exactly two public values:

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon / Publishable key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (new projects show a “Publishable” key `sb_publishable_…`; older ones show
  the `anon` JWT — either is the correct public key)

⚠️ **Never** use the `service_role` / Secret key in this app or in any
`NEXT_PUBLIC_*` variable. It exists in that settings page — leave it there.

## Step 5 — Push the code to GitHub

From this folder (or upload via the GitHub web UI):

```bash
git init
git add .
git commit -m "Velora SaaS MVP"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/menuqr.git
git push -u origin main
```

(Do not commit `.env.local` — it is gitignored.)

## Step 6 — Deploy on Vercel

1. https://vercel.com → **Add New → Project** → import your GitHub repo.
2. Framework preset: **Next.js** (auto-detected). Leave build settings default.
3. **Environment Variables** — add all three (Production + Preview + Development):
   - `NEXT_PUBLIC_SUPABASE_URL` = your Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon/publishable key
   - `NEXT_PUBLIC_SITE_URL` = your Vercel URL, e.g. `https://menuqr-xyz.vercel.app` (no trailing slash)
4. **Deploy.** Wait for “Ready”.
5. Go back to Supabase **Authentication → URL Configuration** and set the
   Site URL / Redirect URLs to this Vercel URL (Step 3).
6. If you change env vars later, **redeploy** (Deployments → ⋯ → Redeploy) —
   `NEXT_PUBLIC_*` values are baked in at build time.

## Step 7 — Make yourself Super Admin

1. Open your deployed site → **Register** with your own email → log in.
2. Supabase → **SQL Editor** → run (replace with your email):

```sql
alter table public.profiles disable trigger trg_protect_profile_role;
update public.profiles set role = 'super_admin' where email = 'YOUR_EMAIL@example.com';
alter table public.profiles enable trigger trg_protect_profile_role;
```

   (The trigger normally blocks role changes from app users so nobody can
   promote themselves; the SQL Editor runs as the database owner, and the
   disable/enable pair makes the one-time promotion explicit and safe.)
3. Log in again — the dashboard sidebar shows **Super Admin panel**, and
   `/admin` opens the platform panel.

## Step 8 — Test checklist (Phase 5)

Run through every item on the live site before calling it done:

- [ ] Landing page loads; Register creates an account; Login/Logout work.
- [ ] Dashboard redirects to `/login` when signed out.
- [ ] Create the restaurant profile; slug auto-fills; public link works.
- [ ] Upload a logo (Storage) — and/or paste an image URL — both display.
- [ ] Add 2 categories; reorder them with ↑ ↓; order matches the public menu.
- [ ] Add menu items with photo, price and a discount price; toggle one
      unavailable (shows greyed on the public menu); mark one featured
      (appears in the Featured section).
- [ ] Free-plan limit: the 16th item is blocked with a clear message.
- [ ] Public menu `/menu/[slug]` opens **signed out** (test in a private/
      incognito window): search works, category chips scroll, WhatsApp
      button appears if a number is set, theme matches your setting.
- [ ] Open the public menu a few times and tap some dishes → dashboard
      Overview + Analytics show the scans and popular items.
- [ ] QR page: QR renders; PNG and SVG download; “Print table card” prints
      only the card; scanning the printed/downloaded QR opens the menu.
- [ ] Change a price in the dashboard → refresh the public menu → new price
      shows, same QR still works.
- [ ] Data isolation: register a **second** account — it must see an empty
      dashboard and must not see/edit the first restaurant anywhere.
- [ ] Super Admin: `/admin` lists restaurants, suspend hides the public menu,
      activate restores it, changing a plan updates the item limit.
- [ ] Mobile: check dashboard + public menu on a real Android phone —
      bottom tab bar, no sideways scrolling, forms easy to tap.

## Troubleshooting

- **“Supabase not connected” box** → env vars missing or not redeployed.
- **Registration works but no profile** → schema.sql was not run (or run in a
  different project). Re-run it in the correct project.
- **Image upload fails** → `menu-images` bucket missing or private. Re-run
  schema.sql Step 2, confirm the bucket is **public**.
- **Public menu says “not found”** → restaurant is unpublished or suspended,
  or the slug in the link differs from the saved slug.
- **Confirmation email link goes to localhost** → fix Supabase URL
  Configuration (Step 3/6).
