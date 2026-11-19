# Divly Student Developer Guide

Welcome! This guide was written so you can own, debug, customize, deploy, and launch **Divly** completely on your own — even if you're in your 1st year of Computer Science and this is your first live full-stack web app.

> **Going live on campus soon?** Pair this technical guide with **[LAUNCH_IN_14_DAYS.md](./LAUNCH_IN_14_DAYS.md)** for your Day 1 → Day 14 University of Birmingham operational checklist!

There is **no hidden magic** in this repo:
- Everything lives in concise TypeScript files (~150–300 lines each).
- All data lives in **one SQLite file** (`data/divly.sqlite`), backed up anytime in 1 click from Admin (`💾 Download DB Backup`).
- All money is stored in **whole GBP pence** (`199` = `£1.99`) so you never hit floating-point bugs like `0.1 + 0.2 = 0.30000000000000004`.
- **Important Public Copy Rule:** Never name competing supermarkets (such as `"Aldi"`) in student-facing UI, seeded `aldiUnitLabel` values, or `/flyer.html` — always use neutral retail copy like `"Save X% vs Supermarkets"` and `"Supermarket equiv."`. (Internal TypeScript property names like `aldiPricePence` / `aldiUnitLabel` and internal Admin-only benchmark labels inside `src/components/admin/` are fine!)

---

## 1. Folder-by-Folder Map (Every File Explained)

### Backend (`server/`) — Runs on Node.js 22
- **`server/index.ts`** — Express server entry point: registers all `/api/...` routes (state, auth, checkout, student item requests, wholesale search/POs, admin cutoff, and `/api/admin/backup`), handles Stripe webhooks, and serves `/flyer.html` + compiled `dist/` in production.
- **`server/db.ts`** — Opens `data/divly.sqlite` (`node:sqlite` in fast `WAL` mode), runs safe schema migrations (referrals, wallet credits, product requests, wholesale orders, barcodes, shelf life, and startup cleanup ensuring public unit labels stay competitor-neutral), and computes live pool + Closer Bonus fields.
- **`server/seed.ts`** — Seeds default UoB Hub settings, 12 bulk staples (with real UK EAN-13 barcodes and shelf lives), starter pool slots, and 4 realistic student item requests on first boot.
- **`server/services/poolAllocator.ts`** — **Case-Splitting Engine.** Assigns incoming orders into sequential `global_slot_index` (`0, 1, 2...`), computes `box_number` & `slot_in_box`, deducts applied wallet credits, rewards referrers (`+£1.00`) on first confirmed order, and locks boxes at `100%` capacity.
- **`server/services/buyAheadPredictor.ts`** — **Bayesian Incomplete-Box Buy-Ahead Predictor.** Scores (`0–100`) whether an incomplete open box is safe to buy ahead at cutoff based on Gamma-Poisson demand, shelf life, and upfront student cash coverage.
- **`server/services/wholesaleApi.ts`** — **Live UK Wholesale & Barcode API.** Queries **Open Food Facts UK v2** (zero API keys needed!) + optional **Qogita B2B API**, and submits wholesale purchase orders with 1-click Qogita/Booker/Bestway SKU links.
- **`server/services/settlement.ts`** — **Weekly Cutoff, Credit & Refund Engine.** Marks `100%` locked + approved Buy-Ahead boxes `fulfilled`, rolls leftover Buy-Ahead shares into `carryover_stock_slots`, refunds cash up to `totalPaidPence`, and restores any unused wallet credit on `auto_refunded` shares.
- **`server/services/qrPass.ts`** — **Saturday Pickup Pass Engine.** Signs tamper-proof `DV1...` QR tokens (`HMAC-SHA256`), generates unique `UOB-XXXXXX` codes + 6-digit PINs, and blocks double-collection.
- **`server/services/auth.ts`** — Verifies `@student.bham.ac.uk` / `@bham.ac.uk` 6-digit OTPs (via Resend or console in dev), generates personal `UOB-XXXXXX` referral codes, grants `+£0.50` welcome credits to referred students, and checks `ADMIN_PIN`.
- **`server/services/stripeService.ts` & `server/services/realtime.ts`** — Native `fetch` Stripe Checkout + Refunds service (falling back to Test Checkout when `STRIPE_SECRET_KEY` is blank) and `/api/events` SSE live broadcaster.

### Shared Types (`src/shared/`) & Public Print Assets (`public/`)
- **`src/shared/types.ts`** — Shared TypeScript contract (`Product`, `ProductWithPool`, `AuthUser`, `Order`, `ProductRequest`, `BuyAheadPrediction`, `WholesalePurchaseOrder`, `formatPence`).
- **`public/icon.svg`, `public/logo.svg`, `public/social-avatar.svg`** — Crisp grocery emerald Divly brand icons + 512×512 WhatsApp/Instagram society avatar.
- **`public/flyer.html`** — Print-ready **A4 UoB Hall Kitchen Poster** (`@media print` styled with steps, `£0.50` welcome bonus, and QR code — open `/flyer.html` and press `Ctrl+P` / `Cmd+P`!).

### Frontend (`src/`) — Runs in the Student's Browser (React 19 + Tailwind v4)
- **`src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/config/brand.ts`** — App shell, clean modern grocery CSS theme, and one-file brand/campus settings.
- **`src/lib/api.ts` & `src/context/AppContext.tsx`** — Typed `apiFetch` wrapper and `useApp()` state: manages live SSE updates (`pool_updated`, `drop_updated`, `products_updated`, `requests_updated`), captures `?ref=UOB-...` referral codes and `?product=...` deep links from shared URLs, and persists `divly_basket`.
- **`src/components/Navbar.tsx`** — Sticky header with live cutoff countdown, **`£X.XX Credit`** wallet badge, **`🎁 Give £0.50, Get £1`** copy-referral button, and trolley subtotal.
- **`src/components/StorefrontView.tsx` & `src/components/ProductCard.tsx`** — Storefront defaulting to **Almost Full & Extra Savings**, spotlighting `isAlmostFull` pools (`⚡ CLOSER BONUS: -X% + FREE PICKUP`), showing `"Save X% vs Supermarkets"`, and sharing deep links (`?product=...&ref=...`) straight to WhatsApp.
- **`src/components/RequestBoardSection.tsx` & `src/components/LegalFooter.tsx`** — Student **Suggest & Upvote Next Week's Drop** voting board + expandable UK compliance footer (FIR 2014 sealed ambient goods, Consumer Contracts Regs 2013, UoB privacy).
- **`src/components/AuthModal.tsx`, `src/components/BasketDrawer.tsx`, `src/components/OrdersView.tsx`** — UoB OTP login, slide-over trolley (Closer Bonus fee waiver + 1-tap upsell + automatic Wallet Credit deduction + £0.00 credit-covered checkout), and student QR Pickup Passes + **Give £0.50, Get £1.00** invite card.
- **`src/components/AdminView.tsx` & `src/components/admin/*`** — Founder Admin suite:
  - **`AdminWholesaleTab.tsx` + `AdminBuyAheadPanel.tsx` + `AdminSettingsForm.tsx`** — Wholesale shopping list, **Bayesian Buy-Ahead Predictor**, **Live Wholesale PO Ordering**, Hub/Fee settings, and **💾 1-Click DB Backup**.
  - **`AdminProductsTab.tsx` + `AdminSupplierImportModal.tsx` + `AdminProductFormModal.tsx`** — Product manager, **Open Food Facts UK / Qogita barcode import**, and **Student Item Requests** (`✓ Mark Stocked`).
  - **`AdminScannerTab.tsx` + `AdminPackingSlipsModal.tsx`** — **📷 Live Phone Camera QR Scanner** (`BarcodeDetector` + `getUserMedia` with PIN/code fallback) and **🏷️ Printable Saturday Bag Packing Labels** (`window.print()`).

---

## 2. Plain-English Walkthrough of the Core Algorithms

### 1. Atomic Case-Splitting (`server/services/poolAllocator.ts`)
- **`BEGIN IMMEDIATE` lock + `UNIQUE(drop_cycle_number, product_id, global_slot_index)`:** Pauses concurrent checkouts for `<1ms` so two students never claim the same slot.
- **Box & slot math:** Sequential `slot = 0, 1, 2...` maps to `boxNumber = Math.floor(slot / caseSize) + 1` and `slotInBox = (slot % caseSize) + 1`. Whenever `slotInBox === caseSize`, every row in that box flips from `'pooling'` to `'locked_box'` immediately!

### 2. Almost-Full Closer Bonus & Fee Waiver (`server/db.ts` & `BasketDrawer.tsx`)
- When an open box has `>= 1` claimed share AND either `fillRatio >= 0.5` or `<= 2` spots remaining, `isAlmostFull = true`:
  1. Grants **`6%` off** (2 spots left / 50%+ full) or **`10%` off** (1 spot left to lock!), clamped so `effectiveSharePricePence >= Math.ceil(wholesaleCaseCostPence / caseSize) + 10` (preserving at least 10p margin per share).
  2. Sets `waivesSmallOrderFee = true`, waiving the £0.50 small-order fee across the whole trolley (with a 1-tap upsell card in `BasketDrawer` if a student is under £8!).
  3. Stores exact paid `share_price_pence` on each allocation so cutoff refunds remain 100% penny-exact.

### 3. Viral Referral Links & Wallet Credits (`auth.ts`, `poolAllocator.ts`, `settlement.ts`)
1. Every student gets a unique `UOB-XXXXXX` referral code. Opening `/?ref=UOB-XXXXXX` saves the code in `localStorage['divly_ref_code']`.
2. When a new student signs in with a valid friend's code, they immediately get **`+50` pence (`£0.50`)** in `users.credit_balance_pence`.
3. At checkout, `creditAppliedPence = Math.min(creditBalancePence, subtotalPence + feePence)` automatically reduces `totalPaidPence` (even supporting `£0.00` instant checkout if credit covers the whole order!).
4. As soon as the friend's first order is paid, their referrer automatically receives **`+100` pence (`£1.00`)** credit (`referral_rewarded = 1` prevents double-claiming). And if an item later auto-refunds at cutoff, `settlement.ts` refunds cash up to `totalPaidPence` and restores any unused credit straight back to `credit_balance_pence`!

### 4. Bayesian Incomplete-Box Buy-Ahead Safety Predictor (`server/services/buyAheadPredictor.ts`)
Instead of blindly refunding 3 happy students when a 52-week Basmati Rice sack is `3/4` full at cutoff, `computeBuyAheadPredictions(db)` calculates whether fronting the 4th bag yourself is safe:
1. **Gamma-Poisson Weekly Demand Rate:** Blends a calm starter guess (`priorAlpha`, `priorBeta`) with observed shares across `cyclesObserved`: $\lambda = (\text{priorAlpha} + \text{claimedShares}) / (\text{priorBeta} + \text{cyclesObserved})$, preventing Week 1 divide-by-zero spikes.
2. **Safe Shelf-Life Horizon (`safeHorizonWeeks`):** `0` if `shelfLifeWeeks < 4` (forces **`AUTO_REFUND`** on perishables); otherwise half the shelf life capped at 6 weeks (`Math.min(Math.floor(shelfLifeWeeks / 2), 6)`).
3. **Poisson Cumulative Sell-Through Probability:** With expected demand $\mu = \lambda \times H$, computes $P(D \ge u) = 1 - \sum_{k=0}^{u-1} \frac{e^{-\mu}\mu^k}{k!}$ — the exact probability that UoB students buy all $u$ unsold bags within the safe window.
4. **Upfront Cash Coverage & Carryover:** Compares `immediateStudentCashPence` against `wholesaleCaseCostPence` (`netOutOfPocketFloatPence = Math.max(0, wholesaleCaseCostPence - immediateStudentCashPence)`). Leaving a `SAFE_BUY_AHEAD` (`score >= 70`) box ticked during **Trigger Weekly Cutoff** marks those students `fulfilled` and adds the $u$ leftover shares into `products.carryover_stock_slots` (`"✓ Instant Stock Held at Hub"` for next week!).

### 5. Live Wholesale API, Camera QR Passes & SSE Live Bars
- **Wholesale & Barcode API (`wholesaleApi.ts`):** Searches live **Open Food Facts UK v2** (`uk.openfoodfacts.org`) with zero API keys (plus optional `QOGITA_API_KEY` / `WHOLESALE_ORDER_WEBHOOK_URL`) and builds 1-click Qogita, Booker, and Bestway SKU links.
- **HMAC QR Passes & Camera Scanner (`qrPass.ts` + `AdminScannerTab.tsx`):** Signs `DV1.<orderId>.<nonce>.<sig>` with `QR_HMAC_SECRET` (`crypto.timingSafeEqual` verification). On Saturday, tap **📷 Start Camera QR Scan** on your phone (uses the browser's built-in `BarcodeDetector` + rear camera, with 6-digit PIN fallback on unsupported desktop browsers).
- **Live SSE Updates (`AppContext.tsx`):** `new EventSource('/api/events')` auto-refreshes open browsers on `pool_updated`, `drop_updated`, `products_updated`, and `requests_updated`.

---

## 3. Common Tasks Recipes (Copy-Paste & Go)

### Recipe 1: Rename Divly, Change Colours, or Print Hall Flyers
- **Brand / University domains:** Edit `src/config/brand.ts` (`BRAND_NAME`, `CAMPUS_NAME`, `ALLOWED_EMAIL_DOMAINS`). Keep all public comparison labels competitor-neutral (`"Supermarket equiv."`).
- **Colours:** Edit the `#059669` emerald utility classes in `src/index.css`.
- **Print A4 Hall Kitchen Flyers:** Visit `/flyer.html` in your browser and press `Ctrl+P` / `Cmd+P` (turn *Background Graphics* ON).

### Recipe 2: Import UK Products by Barcode or Connect Qogita / Webhooks
- **Zero-Key Barcode Import:** In **Admin -> Products**, search any UK brand or EAN-13 barcode (e.g. `Oatly`, `Nongshim`) and click **1-Click Import**. Also check **Student Item Requests** right inside that tab to see what UoB students upvoted!
- **Automated B2B POs (Optional):** Set `QOGITA_API_KEY=...` or `WHOLESALE_ORDER_WEBHOOK_URL=...` in `.env`.

### Recipe 3: Enable Live Stripe (Apple Pay / Google Pay) & Resend Campus OTPs
Add these to `.env` (see **[LAUNCH_IN_14_DAYS.md](./LAUNCH_IN_14_DAYS.md)** Days 2–3 for step-by-step setup):
```env
STRIPE_SECRET_KEY=sk_live_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
PUBLIC_BASE_URL=https://yourdomain.co.uk
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM="Divly UoB <login@yourdomain.co.uk>"
```

### Recipe 4: Deploy to Cloud or Home Proxmox VM + 1-Click Backups
> **Always set in production:** `ALLOW_DEV_LOGIN=false`, a strong `ADMIN_PIN`, and a 64-char hex `QR_HMAC_SECRET` (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). GitHub Actions CI (`.github/workflows/ci.yml`) automatically runs `npx tsc -b`, `npm test`, and `npm run build` on every push to `main`.

- **Railway / Render:** Deploy from GitHub (`railway.json` / `render.yaml` configure Docker + `/api/state` healthchecks) with a persistent volume mounted at **`/app/data`**.
- **Home Proxmox VM / VPS (£0/mo):** `cp .env.example .env && nano .env && docker compose up -d --build`.
- **Backups:** Click **💾 Download DB Backup** inside Admin before every Wednesday cutoff, or copy the raw SQLite file via `docker cp divly-uob:/app/data/divly.sqlite ./backup-$(date +%F).sqlite`.
