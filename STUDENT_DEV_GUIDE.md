# Divly Student Developer Guide

Welcome! This guide was written so you can own, debug, customize, and deploy **Divly** completely on your own — even if you're in your 1st year of Computer Science and this is your first live full-stack web app.

There is **no hidden magic** in this repo. Everything lives in plain TypeScript files (~150–300 lines each), uses **one SQLite file** (`data/divly.sqlite`) for storage, and stores all money in **whole GBP pence** (`199` = `£1.99`) so you never hit weird JavaScript decimal bugs like `0.1 + 0.2 = 0.30000000000000004`.

---

## 1. Folder-by-Folder Map (Every File Explained)

### Backend (`server/`) — Runs on Node.js 22
The backend handles the database, logins, payments, case math, demand prediction, wholesale APIs, and admin tools.

- **`server/index.ts`** — The main door to the server. Creates the Express web server, registers every `/api/...` route (like `/api/state`, `/api/checkout/create`, `/api/admin/cutoff`, `/api/admin/wholesale/search`), handles Stripe webhooks, and serves the built React website (`dist/`) when deployed in production.
- **`server/db.ts`** — Opens the SQLite database file (`data/divly.sqlite`) using Node 22's built-in `node:sqlite` in fast `WAL` mode, runs safe column migrations (`ean_barcode`, `shelf_life_weeks`, `carryover_stock_slots`), creates all tables (`settings`, `products`, `users`, `otp_codes`, `sessions`, `orders`, `pool_allocations`, `wholesale_orders`), and computes live pool + Closer Bonus fields.
- **`server/seed.ts`** — Runs automatically on first boot when the database is empty. Inserts the default UoB Shackleton Hub settings, 12 Aldi-beating bulk products (with real UK EAN-13 barcodes and realistic shelf lives), and starter pool slots.
- **`server/services/poolAllocator.ts`** — **The Case-Splitting Engine.** Assigns incoming student orders into numbered slots (`0, 1, 2...`), calculates which box and slot each item belongs to, and locks boxes as soon as they reach `100%` full.
- **`server/services/buyAheadPredictor.ts`** — **The Bayesian Incomplete-Box Buy-Ahead Predictor.** Uses past + current student demand, product shelf life, and upfront student cash coverage to score (`0–100`) whether an incomplete box (e.g. `3/4` full rice) is safe for you to buy ahead and sell the leftover share next week instead of refunding students.
- **`server/services/wholesaleApi.ts`** — **Live UK Wholesale & Barcode API Service.** Searches live UK grocery items and EAN-13 barcodes via **Open Food Facts UK v2** (zero API keys required!) + optional **Qogita B2B API**, and submits wholesale purchase orders (via Qogita API, webhook, or 1-click Qogita/Booker/Bestway SKU links).
- **`server/services/settlement.ts`** — **The Weekly Cutoff & Refund Engine.** Marks `100%` locked boxes (plus any incomplete boxes you chose to underwrite via Buy-Ahead) as `fulfilled`, rolls leftover underwritten shares into `carryover_stock_slots`, and refunds unfilled `auto_refunded` shares to the penny.
- **`server/services/qrPass.ts`** — **The Saturday Pickup Pass Engine.** Generates unique `UOB-XXXXXX` codes, 6-digit backup PINs, and cryptographically signed QR strings (`DV1...`) so nobody can fake a screenshot at pickup, while blocking double-collection.
- **`server/services/auth.ts`** — Enforces `@student.bham.ac.uk` / `@bham.ac.uk` emails, generates 6-digit OTP login codes, sends them via Resend (or prints them in your terminal in dev), and checks your `ADMIN_PIN`.
- **`server/services/stripeService.ts`** — Talks to Stripe's API for real Card / Apple Pay / Google Pay checkouts and refunds when `STRIPE_SECRET_KEY` is set, or switches cleanly to the built-in Test Checkout modal when `STRIPE_SECRET_KEY` is empty.
- **`server/services/realtime.ts`** — Broadcasts live Server-Sent Events (`pool_updated`, `drop_updated`, `products_updated`) over `/api/events` to every open browser tab.

### Shared Types (`src/shared/`) — Used by BOTH Backend & Frontend
- **`src/shared/types.ts`** — Defines `Product`, `ProductWithPool`, `Order`, `BuyAheadPrediction`, `LiveSupplierProductResult`, `WholesalePurchaseOrder`, and `formatPence(pence)` (`450` -> `"£4.50"`). Because both `server/` and `src/` import this file, TypeScript catches any mismatch right away!

### Frontend (`src/`) — Runs in the Student's Browser (React 19 + Tailwind v4)
- **`src/main.tsx` & `src/App.tsx`** — Mounts React, `<Navbar />`, the 3 main views (`StorefrontView`, `OrdersView`, `AdminView`), `<BasketDrawer />`, and `<AuthModal />`.
- **`src/index.css`** — Clean Modern Grocery App theme (Tailwind CSS v4, crisp white cards, `#059669` emerald savings pills).
- **`src/config/brand.ts`** — Your one-file brand control panel (`BRAND_NAME`, `BRAND_TAGLINE`, `CAMPUS_NAME`, `ALLOWED_EMAIL_DOMAINS`).
- **`src/lib/api.ts` & `src/context/AppContext.tsx`** — Typed `apiFetch` helper and global `useApp()` state holding live products, settings, user, orders, persisted `divly_basket`, Stripe return handling, and `/api/events` live updates.
- **`src/components/Navbar.tsx`** — Sticky grocery header with Divly logo, UoB hub badge, live ticking cutoff countdown, navigation tabs, Sign In / Dev Login bar, and trolley button.
- **`src/components/StorefrontView.tsx`** — Main shop screen: defaults to sorting by **Almost Full & Extra Savings**, highlights the *"🔥 Almost Full — Lock a Box for Extra Closer Discount + Free Pickup"* spotlight shelf, and provides search + category filters.
- **`src/components/ProductCard.tsx`** — Supermarket tile showing *"Save X% vs Aldi"*, *"⚡ CLOSER BONUS: -X% + FREE PICKUP"* badge on almost-full pools, *"✓ Instant Stock Held at Hub"* badge when carryover stock exists, segmented slot bar, WhatsApp share link, and `+ Chip In` stepper.
- **`src/components/AuthModal.tsx`** — Popup modal for `@student.bham.ac.uk` 6-digit OTP login, Admin PIN login, and local-dev 1-click login.
- **`src/components/BasketDrawer.tsx`** — Slide-out trolley showing Closer Bonus savings, automatic £0.50 small-order fee waiver when an almost-full item is in your basket (plus a 1-tap upsell card to waive the fee if under £8!), case-lock previews, and Stripe / Test Checkout.
- **`src/components/OrdersView.tsx`** — Displays live slot statuses, pence-exact refund breakdown, and scannable `<QRCodeSVG />` pickup passes.
- **`src/components/AdminView.tsx` & `src/components/admin/*`** — Your 3 Founder Admin tabs:
  - **`AdminWholesaleTab.tsx` (+ `AdminBuyAheadPanel.tsx`)** — Wholesale shopping list, **Bayesian Incomplete-Box Buy-Ahead Predictor** checkboxes for cutoff underwriting, **Live Wholesale PO Ordering** with 1-click Qogita/Booker/Bestway SKU links, and Hub/Fee settings.
  - **`AdminProductsTab.tsx` (+ `AdminSupplierImportModal.tsx`)** — No-code Product & Aldi Price Manager plus **1-click Live UK Wholesale / Open Food Facts Barcode Search & Import**.
  - **`AdminScannerTab.tsx`** — Saturday Hub QR / `UOB-XXXXXX` / PIN / email pass scanner with double-collection protection.

---

## 2. Plain-English Walkthrough of the Core Algorithms

### 1. Atomic Case-Splitting (`server/services/poolAllocator.ts`)
Suppose a bulk rice sack splits into `caseSize = 4` bags and 3 bags are already taken (`Slots 0, 1, 2`). If Alice buys **2 bags** at the exact same millisecond Bob buys **1 bag**:
- **`BEGIN IMMEDIATE` lock:** SQLite pauses Bob for `<1ms` until Alice's slots are written, backed up by `UNIQUE(drop_cycle_number, product_id, global_slot_index)` so two students **never** collide.
- **Division & remainder math:** Each share gets sequential `slot = 0, 1, 2, 3, 4...`:
  - `boxNumber = Math.floor(slot / caseSize) + 1` and `slotInBox = (slot % caseSize) + 1`.
  - Alice's `slot = 3` lands in `Box #1, Slot 4/4` (immediately promoting all 4 rows in Box #1 from `'pooling'` to `'locked_box'`), while her `slot = 4` opens `Box #2, Slot 1/4`!

### 2. Almost-Full Closer Bonus & Fee Waiver (`server/db.ts` & `BasketDrawer.tsx`)
**Why we built this:** Early on, if 10 students buy 10 *different* items, you end up with ten `1/6` boxes and zero full cases! You want campus traffic to **herd together** and finish boxes that are already underway.
- **How it works:** Whenever an open box has at least 1 claimed slot AND is either **50%+ full** (`fillRatio >= 0.5`) or has **1–2 spots left** (`openCaseRemainingSlots <= 2`), Divly marks `isAlmostFull = true`:
  1. **Extra Closer Discount:** Students get **`6%` off** (when 2 spots left or 50%+ full) or **`10%` off** (when just 1 final spot is left to lock the box!).
  2. **Margin Floor Safety Clamp:** The discount is clamped so `effectiveSharePricePence` **never** drops below `Math.ceil(wholesaleCaseCostPence / caseSize) + 10` — guaranteeing you still make at least 10p profit per share!
  3. **Free Pickup Fee Waiver:** Adding *any* `isAlmostFull` item sets `waivesSmallOrderFee = true`, waiving the £0.50 small-order fee on their whole trolley even under £8.00 (and `BasketDrawer` suggests a 1-tap almost-full item whenever a student is about to pay the £0.50 fee!).
  4. **Penny-Exact Refunds:** Each allocation row saves the exact `share_price_pence` that student actually paid, so if an almost-full box still doesn't finish, they are refunded the exact amount they paid.

### 3. Bayesian Incomplete-Box Buy-Ahead Safety Predictor (`server/services/buyAheadPredictor.ts`)
**Why we built this:** Imagine Thursday cutoff arrives and a 20kg Basmati Rice sack (`caseSize = 4`, shelf life `52 weeks`, wholesale cost `£18.00`) has **3 of 4 bags claimed** (`£17.97` already paid by 3 students!). Refunding those 3 students disappoints them when you only needed **£0.03 of your own cash** to buy the sack and sell the 4th bag next week! On the other hand, buying a case of short-dated 2-week bakery snacks with only `1/8` sold would spoil and lose money.

Here is how `computeBuyAheadPredictions(db)` turns that intuition into clean math:
1. **Gamma-Poisson Weekly Demand Rate (`estimatedWeeklyDemand`):** If it's Week 1, simple averages divide by zero or freak out over small numbers. A **Gamma-Poisson update** is just a fancy name for a weighted average between a sensible starter guess (say, `priorAlpha = 2` shares over `priorBeta = 1` week) and real observed shares claimed across `N` drop cycles:
   $$\lambda = \frac{\text{priorAlpha} + \text{totalClaimedShares}}{\text{priorBeta} + \text{cyclesObserved}}$$
   Early on, the starter guess keeps estimates calm; after 5–10 drops, your real UoB sales history dominates!
2. **Safe Shelf-Life Horizon (`safeHorizonWeeks`):** You never want to sell groceries right before their best-before date. So if `shelfLifeWeeks < 4`, `safeHorizonWeeks = 0` (automatic **`AUTO_REFUND`**). Otherwise we only count half the shelf life, capped at 6 weeks: `Math.min(Math.floor(shelfLifeWeeks / 2), 6)`.
3. **Poisson Cumulative Sell-Through Probability `P(D >= u)`:** If students buy $\lambda$ shares per week, over $H$ safe weeks expected demand is $\mu = \lambda \times H$. Using the standard Poisson formula $P(D = k) = \frac{e^{-\mu}\mu^k}{k!}$, we add up the probabilities for $k = 0, 1, \dots, u - 1$ (where $u$ is `unsoldSlotsCount`) and subtract from `1`:
   $$P(D \ge u) = 1 - \sum_{k=0}^{u-1} \frac{e^{-\mu}\mu^k}{k!}$$
   That gives the exact percentage chance (e.g. `94%`) that UoB students will buy all `u` leftover shares well before expiry!
4. **Upfront Cash Coverage & Out-of-Pocket Float:** We compare `immediateStudentCashPence` (cash already collected from students in that open box today) against `wholesaleCaseCostPence`:
   - `netOutOfPocketFloatPence = Math.max(0, wholesaleCaseCostPence - immediateStudentCashPence)` — the exact cash *you* temporarily front from your pocket today.
   - `expectedNetProfitPence` weighs expected revenue from selling the leftover shares against the tiny risk of any share expiring unsold.
5. **Decision & Carryover Stock (`carryoverStockSlots`):** Combining sell-through probability, cash coverage, and shelf life produces a `0–100` **Safety Score** (`SAFE_BUY_AHEAD` green at `>= 70`, `BORDERLINE_REVIEW` amber at `45–69`, or `AUTO_REFUND` below `45` / `< 4w` shelf life). When you leave a `SAFE_BUY_AHEAD` box ticked during **Trigger Weekly Cutoff**, those students are marked **`fulfilled`** for Saturday pickup, and the `u` leftover bags are added to `products.carryover_stock_slots` (showing `"✓ Instant Stock Held at Hub"` for next week's drop!).

### 4. Live UK Wholesale & Open Food Facts API (`server/services/wholesaleApi.ts`)
- **Zero-Key Product & Barcode Search (`GET /api/admin/wholesale/search?q=...`):** Queries the live **Open Food Facts UK v2 REST API** (`uk.openfoodfacts.org`) by product name (e.g. `"Oatly"`, `"Indomie"`) or 13-digit EAN barcode (with a 4.5-second timeout so slow Wi-Fi never hangs your server). It automatically estimates sensible bulk case sizes, wholesale case costs, Aldi comparison prices, and shelf-life weeks so you can add real UK products in 1 click!
- **Automated B2B Wholesale Ordering (`POST /api/admin/wholesale/order`):** Compiles every `100%` locked case (plus any Buy-Ahead cases) into a saved `WholesalePurchaseOrder`. If `QOGITA_API_KEY` or `WHOLESALE_ORDER_WEBHOOK_URL` is configured, it submits the order payload live via `fetch`; either way, it generates **1-click Qogita, Booker, and Bestway SKU links** by EAN barcode so you can check out at your wholesaler in seconds.

### 5. Weekly Cutoff Conservation, HMAC QR Passes & SSE Live Bars
- **Penny-Exact Settlement (`settlement.ts`):** If `0` items in a student's order are fulfilled, Divly refunds **100% including any £0.50 small-order fee** (`status = 'refunded'`). Otherwise it refunds exact `auto_refunded` shares (`status = 'settled'`) and enforces `totalPaidPence === netChargedPence + refundedPence`.
- **Tamper-Proof QR Passes (`qrPass.ts`):** Signs `DV1.<orderId>.<nonce>.<sig>` with `QR_HMAC_SECRET` (`HMAC-SHA256`), verifies signatures with `crypto.timingSafeEqual`, and locks `collected_at` so passes cannot be scanned twice.
- **Live SSE Updates (`AppContext.tsx`):** `new EventSource('/api/events')` listens for `pool_updated` / `drop_updated` / `products_updated` and refreshes every open student browser automatically.

---

## 3. Common Tasks Recipes (Copy-Paste & Go)

### Recipe 1: How do I rename Divly or change colours?
- Edit `BRAND_NAME`, `BRAND_TAGLINE`, `CAMPUS_NAME`, and `ALLOWED_EMAIL_DOMAINS` in `src/config/brand.ts` (plus `<title>` in `index.html` and `public/logo.svg` / `public/icon.svg`).
- Edit the grocery emerald `#059669` button/badge classes in `src/index.css`.

### Recipe 2: How do I import real UK products by barcode or connect Qogita / Wholesale Webhooks?
1. **Zero-Key Barcode/Name Import (works immediately!):** Open **Admin -> Products & Aldi Prices**, type any UK brand or 13-digit barcode (e.g. `Oatly`, `Nongshim`, `7394376616228`) into **Import from Live UK Wholesale / Barcode API**, and click **1-Click Import to Catalog**.
2. **Optional Automated B2B Ordering:** To connect live Qogita wholesale pricing/ordering or push POs to a Zapier/Make/Supplier webhook, add to `.env`:
   ```env
   QOGITA_API_KEY=qog_live_your_buyer_key
   WHOLESALE_ORDER_WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/your-webhook
   ```

### Recipe 3: How do I switch from Test Checkout to real Stripe (Card, Apple Pay & Google Pay)?
1. Enable **Apple Pay** & **Google Pay** in [dashboard.stripe.com](https://dashboard.stripe.com), then set in `.env`:
   ```env
   STRIPE_SECRET_KEY=sk_live_your_key_here
   PUBLIC_BASE_URL=https://yourdomain.co.uk
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
   ```
   *(Point your Stripe `checkout.session.completed` webhook at `https://yourdomain.co.uk/api/webhooks/stripe`.)* Restart the server — live Stripe Checkout and automated cutoff refunds activate immediately!

### Recipe 4: How do I connect Resend for real `@student.bham.ac.uk` OTP login emails?
1. Verify your domain on [resend.com](https://resend.com) (free 3,000 emails/mo) and add to `.env`:
   ```env
   RESEND_API_KEY=re_your_api_key_here
   EMAIL_FROM="Divly UoB <login@yourdomain.co.uk>"
   ```

### Recipe 5: How do I deploy to Railway, Render, or my home Proxmox VM in 10 minutes?
> **Before going live:** Set `ALLOW_DEV_LOGIN=false`, choose a strong `ADMIN_PIN`, and generate `QR_HMAC_SECRET` via `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

- **Railway:** Deploy from GitHub (`railway.json` sets up Docker + `/api/state` healthcheck), **Attach a Volume mounted at `/app/data`**, and paste your `.env` variables.
- **Render:** Deploy via **New Blueprint Instance** (`render.yaml` provisions Docker, `/api/state` healthcheck, and a 1 GB persistent disk at `/app/data`).
- **Home Proxmox VM / VPS (£0/mo):** Copy `.env.example` to `.env`, set secrets, and run `docker compose up -d --build`. Back up your database anytime with `docker cp divly-uob:/app/data/divly.sqlite ./backup-$(date +%F).sqlite`.
