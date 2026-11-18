# Divly Student Developer Guide

Welcome! This guide was written so you can own, debug, customize, and deploy **Divly** completely on your own — even if you're in your 1st year of Computer Science and this is your first live full-stack web app.

There is **no hidden magic** in this repo. Everything lives in plain TypeScript files (~150–300 lines each), uses **one SQLite file** (`data/divly.sqlite`) for storage, and stores all money in **whole GBP pence** (`199` = `£1.99`) so you never hit weird JavaScript decimal bugs like `0.1 + 0.2 = 0.30000000000000004`.

---

## 1. Folder-by-Folder Map (Every File Explained)

### Backend (`server/`) — Runs on Node.js 22
The backend handles the database, logins, payments, case math, and admin tools.

- **`server/index.ts`** — The main door to the server. Creates the Express web server, registers every `/api/...` route (like `/api/state`, `/api/checkout/create`, `/api/admin/cutoff`), handles Stripe webhooks, and serves the built React website (`dist/`) when deployed in production.
- **`server/db.ts`** — Opens the SQLite database file (`data/divly.sqlite`) using Node 22's built-in `node:sqlite`. Turns on `WAL` (Write-Ahead Logging) mode so reads and writes are super fast, and creates all tables (`settings`, `products`, `users`, `otp_codes`, `sessions`, `orders`, `pool_allocations`) if they don't exist yet.
- **`server/seed.ts`** — Runs automatically on first boot when the database is empty. Inserts the default UoB Shackleton Hub settings, 12 Aldi-beating bulk products, and a few starter pool slots so your local dev store isn't blank.
- **`server/services/poolAllocator.ts`** — **The Case-Splitting Engine.** Assigns incoming student orders into numbered slots (`0, 1, 2...`), calculates which box and slot each item belongs to, and locks boxes as soon as they reach `100%` full.
- **`server/services/settlement.ts`** — **The Weekly Cutoff & Refund Engine.** Runs when you click *"Trigger Weekly Cutoff"* in Admin. Marks `100%` locked boxes as `fulfilled`, marks leftover half-empty boxes as `auto_refunded`, and refunds students automatically.
- **`server/services/qrPass.ts`** — **The Saturday Pickup Pass Engine.** Generates unique `UOB-XXXXXX` codes, 6-digit backup PINs, and cryptographically signed QR strings (`DV1...`) so nobody can fake a screenshot at pickup. Also blocks an order from being collected twice.
- **`server/services/auth.ts`** — Checks that student emails end in `@student.bham.ac.uk` or `@bham.ac.uk`, generates 6-digit login codes (OTPs), sends them via Resend (or prints them in your terminal during local dev), and checks your `ADMIN_PIN`.
- **`server/services/stripeService.ts`** — Talks directly to Stripe's official API for real Card / Apple Pay / Google Pay checkouts and refunds when `STRIPE_SECRET_KEY` is set, or switches cleanly to the built-in Test Checkout modal when `STRIPE_SECRET_KEY` is empty.
- **`server/services/realtime.ts`** — Keeps a list of open browser tabs connected to `/api/events` and sends a tiny nudge (`pool_updated`, `drop_updated`, `products_updated`) whenever someone buys a share or an admin updates a product.

### Shared Types (`src/shared/`) — Used by BOTH Backend & Frontend
- **`src/shared/types.ts`** — Defines the exact shape of a `Product`, `Order`, `DropSettings`, and `AdminSummary`, plus `formatPence(pence)` (`450` -> `"£4.50"`). Because both `server/` and `src/` import this same file, TypeScript warns you immediately if frontend and backend ever disagree!

### Frontend (`src/`) — Runs in the Student's Browser (React 19 + Tailwind v4)
- **`src/main.tsx`** — Bootstraps React and attaches `<App />` to `index.html`.
- **`src/App.tsx`** — Top-level page shell: renders `<Navbar />`, switches between Shop (`StorefrontView`), Orders (`OrdersView`), and Admin (`AdminView`), and mounts `<BasketDrawer />` + `<AuthModal />`.
- **`src/index.css`** — Styling and colour theme (Tailwind CSS v4 + clean fonts, white cards, soft grey backgrounds, and grocery emerald `#059669` buttons/badges).
- **`src/vite-env.d.ts`** — Tells TypeScript how Vite imports assets and CSS.
- **`src/config/brand.ts`** — Your one-file brand control panel (`BRAND_NAME`, `BRAND_TAGLINE`, `CAMPUS_NAME`, and `ALLOWED_EMAIL_DOMAINS`).
- **`src/lib/api.ts`** — Helper function `apiFetch('/api/...')` that attaches the logged-in user's token (`localStorage['divly_auth_token']`) to requests and converts server errors into readable messages.
- **`src/context/AppContext.tsx`** — The "brain" of the React app (`useApp()`). Stores `products`, `settings`, `user`, `orders`, and `basket` (`localStorage['divly_basket']`), handles Stripe redirects back to the site, and listens for live updates from `/api/events`.
- **`src/components/Navbar.tsx`** — Top navigation bar with the Divly logo, UoB hub badge, live ticking countdown to weekly cutoff, tab buttons, Sign In / Dev Login bar, and trolley button.
- **`src/components/StorefrontView.tsx`** — Main shop screen: 3-step banner, search box, category filter pills, sort dropdown (*Biggest Saving vs Aldi*, *Almost Full*, *Lowest Price*), product grid, and sticky mobile trolley bar.
- **`src/components/ProductCard.tsx`** — Individual grocery card showing the *"Save X% vs Aldi"* badge, Divly share price vs crossed-out Aldi price, segmented progress bar (*"3 of 4 students chipped in"*), WhatsApp share button, and `+ Chip In` stepper.
- **`src/components/AuthModal.tsx`** — Popup modal for `@student.bham.ac.uk` 6-digit email code sign-in, Admin PIN login, and 1-click Dev Login buttons (only shown in local dev).
- **`src/components/BasketDrawer.tsx`** — Slide-out right trolley showing how close you are to free £0.00 hub pickup, which slots will lock a full case immediately vs open a new case, total savings vs Aldi, and the Checkout / Test Checkout sheet.
- **`src/components/OrdersView.tsx`** — Shows a student's orders, live slot statuses, pence-exact refund breakdown, and their scannable Saturday QR Pickup Pass + `UOB-XXXXXX` code + 6-digit PIN.
- **`src/components/AdminView.tsx`** — Wrapper for your 3 Founder Admin tabs inside `src/components/admin/`:
  - **`src/components/admin/AdminWholesaleTab.tsx`** — Shows how many **100% full cases** to buy at Costco/Booker (with CSV download), profit KPIs, the **Trigger Weekly Cutoff** & **Start New Weekly Drop** buttons, and the Hub/Fee settings form.
  - **`src/components/admin/AdminProductsTab.tsx`** — Add, edit, or delete products, share prices, case sizes, and Aldi comparison prices without writing code.
  - **`src/components/admin/AdminScannerTab.tsx`** — Saturday Hub scanner: paste/scan a QR string, `UOB-XXXXXX` code, 6-digit PIN, or student email to verify their pass and mark it **Collected ✅**.

---

## 2. Plain-English Walkthrough of the 4 Core Algorithms

### Algorithm 1: Atomic Case-Splitting (`server/services/poolAllocator.ts`)
**The problem:** Suppose a bulk rice sack splits into `caseSize = 4` bags, and 3 bags are already taken (`Slots 0, 1, 2`). What happens if Alice buys **2 bags** at the exact same millisecond Bob buys **1 bag**?

1. **`BEGIN IMMEDIATE` lock:** Before reading slot counts, SQLite runs `BEGIN IMMEDIATE`. That tells SQLite: *"Let me finish assigning Alice's slots completely before Bob's checkout starts reading."* It takes less than 1 millisecond, so nobody notices any delay, and two students can **never** grab the same slot! (As a backup safety net, the table also has a `UNIQUE(drop_cycle_number, product_id, global_slot_index)` constraint.)
2. **Simple division & remainder math:** Every claimed share gets the next whole number `slot = 0, 1, 2, 3, 4...`:
   - `boxNumber = Math.floor(slot / caseSize) + 1`
   - `slotInBox = (slot % caseSize) + 1`
   - So for Alice's 2 bags (`slot = 3` and `slot = 4` with `caseSize = 4`):
     - `slot = 3`: `Math.floor(3 / 4) + 1 = Box #1`, `(3 % 4) + 1 = Slot 4 of 4`!
     - `slot = 4`: `Math.floor(4 / 4) + 1 = Box #2`, `(4 % 4) + 1 = Slot 1 of 4`!
3. **Instant box locking:** Whenever `slotInBox === caseSize` (the final slot of a box is filled), we immediately update all 4 rows in `Box #1` from `'pooling'` to `'locked_box'`. Once a box is `'locked_box'`, those students are 100% guaranteed their groceries!

### Algorithm 2: Weekly Cutoff & Penny-Exact Refunds (`server/services/settlement.ts`)
**The problem:** At Thursday night cutoff, `Box #1` has 4/4 slots (`locked_box`), while `Box #2` only got 1/4 slots (`pooling`). You obviously won't buy a whole wholesale case just to sell 1 bag. How do we settle everyone's money fairly without losing a single penny?

Inside one atomic database transaction:
1. Every `'locked_box'` slot becomes `'fulfilled'` (you buy these cases at the wholesaler).
2. Every leftover `'pooling'` slot becomes `'auto_refunded'` (unfilled overflow).
3. For each paid order in this drop cycle, we check how many of its items were `fulfilled`:
   - **Case A — Partial fulfilment (at least 1 item fulfilled):** The student still comes to Saturday pickup, so they keep their fulfilled items (and any £0.50 small-order fee if applicable), and we refund the exact sum of their `auto_refunded` shares (`order.status = 'settled'`).
   - **Case B — Zero items fulfilled:** If *nothing* in their order filled a case, charging them a £0.50 small-order fee for nothing would be unfair! So we refund **100% of `totalPaidPence`**, including the fee (`order.status = 'refunded'`).
4. **Conservation check:** Before saving, the code verifies `totalPaidPence === netChargedPence + refundedPence`. Every single penny paid is either kept for fulfilled goods or refunded. If `STRIPE_SECRET_KEY` is live, it also triggers the real Stripe refund automatically.

### Algorithm 3: Tamper-Proof QR Pickup Passes (`server/services/qrPass.ts`)
**The problem:** What stops a cheeky student from editing a QR code text string to put someone else's `orderId` in it?

When an order is paid, the server creates a token shaped like:
`DV1.<orderId>.<randomNonce>.<signature>`

- `<signature>` is computed using **`HMAC-SHA256`**, which mixes `DV1.<orderId>.<randomNonce>` with your secret `QR_HMAC_SECRET` (a password stored only on your server, never sent to browsers).
- Even if someone knows the `orderId`, they cannot guess the 64-character `<signature>` without knowing `QR_HMAC_SECRET`.
- At Saturday pickup (`POST /api/admin/scan/verify`), the server recalculates the expected signature and compares it using `crypto.timingSafeEqual` (which compares every byte in constant time so attackers can't guess characters by measuring response speed). Finally, clicking **Mark Collected** sets `collected_at` so the same QR pass cannot be scanned a second time 10 minutes later!

### Algorithm 4: Live Pool Bars via Server-Sent Events (`src/context/AppContext.tsx`)
**The problem:** When someone in Shackleton Hall chips in on Shin Ramyun, how does everyone else's screen jump from `2/4` to `3/4` automatically without refreshing the page?

Instead of complicated WebSockets, we use **Server-Sent Events (`SSE`)**, which is built right into every browser:
1. When `<AppProvider>` loads, it runs `const es = new EventSource('/api/events')`. That opens a lightweight one-way connection to `server/services/realtime.ts`.
2. Whenever a checkout finishes or an admin edits products/settings, the server calls `broadcastEvent('pool_updated')`.
3. Every connected browser receives that tiny message and calls `refreshState()` (fetching fresh `/api/state` JSON) — updating every progress bar across campus in real time, and automatically reconnecting if a student walks through a Wi-Fi dead spot!

---

## 3. Common Tasks Recipes (Copy-Paste & Go)

### Recipe 1: How do I rename Divly or change colours?
- **Rename the brand or expand to another university:** Open `src/config/brand.ts` and edit `BRAND_NAME`, `BRAND_TAGLINE`, `CAMPUS_NAME`, or `ALLOWED_EMAIL_DOMAINS` (for example, adding `'@warwick.ac.uk'`). Also update `<title>` in `index.html` and replace `public/logo.svg` / `public/icon.svg` if you design a new logo.
- **Change the brand colour:** Open `src/index.css`. The supermarket emerald green (`#059669` / `emerald-600`) powers the primary buttons and *"Save vs Aldi"* pills. Changing the CSS variables / `.btn-primary` colour in `src/index.css` updates buttons across the whole app.

### Recipe 2: How do I add products or change pickup times without touching code?
1. Open the website and click **Admin** (or sign in via **Sign In -> Admin Login** using your `ADMIN_PIN`).
2. **To add/edit products:** Open the **Products & Aldi Prices** tab -> click **Add Product** (or **Edit** on any row). Enter prices in pounds (the form converts to pence safely), set `Case Size` (how many student shares make 1 wholesale box), and click Save. Every student's screen updates immediately!
3. **To change cutoff time, hub address, or the £8 free-pickup threshold:** Open the **Wholesale & Drop Controls** tab, scroll to **Hub & Fee Settings**, edit the fields, and click **Save Settings**.

### Recipe 3: How do I switch from Test Checkout to real Stripe (Card, Apple Pay & Google Pay)?
Divly already has real Stripe built in — you don't need to rewrite a single line of code:
1. Create a UK Stripe account at [dashboard.stripe.com](https://dashboard.stripe.com) and turn on **Apple Pay** & **Google Pay** under *Settings -> Payment methods*.
2. Copy your Secret Key (`sk_test_...` first to test, then `sk_live_...` when going live) into `.env`:
   ```env
   STRIPE_SECRET_KEY=sk_live_your_key_here
   PUBLIC_BASE_URL=https://yourdomain.co.uk
   ```
3. In Stripe Dashboard -> *Developers -> Webhooks*, add endpoint `https://yourdomain.co.uk/api/webhooks/stripe` listening to the **`checkout.session.completed`** event, and copy the Signing Secret (`whsec_...`) into:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
   ```
4. Restart the server. Divly automatically detects `STRIPE_SECRET_KEY`, hides the simulated Test Checkout modal, and redirects students to real Stripe Checkout (and issues real Stripe refunds on cutoff)!

### Recipe 4: How do I connect Resend for real `@student.bham.ac.uk` OTP login emails?
1. Sign up free at [resend.com](https://resend.com) (free tier gives 3,000 emails/month — plenty for hundreds of UoB students).
2. Add and verify your domain (e.g. `divly.co.uk`) in Resend's DNS settings, then create an API key (`re_...`).
3. Add these two lines to `.env` (or your cloud host's Environment Variables):
   ```env
   RESEND_API_KEY=re_your_api_key_here
   EMAIL_FROM="Divly UoB <login@yourdomain.co.uk>"
   ```
4. Restart the server — students will now receive crisp 6-digit login codes straight in their `@student.bham.ac.uk` inbox!

### Recipe 5: How do I deploy to Railway, Render, or my home Proxmox VM in 10 minutes?

> **Before going live anywhere:** Always set `ALLOW_DEV_LOGIN=false`, pick a strong `ADMIN_PIN`, and generate a random `QR_HMAC_SECRET` by running:
> `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

#### Option A: Railway (Easiest Cloud Deploy — ~5 mins)
1. Push this repo to a private **GitHub** repository.
2. Go to [railway.com](https://railway.com) -> **New Project -> Deploy from GitHub repo** (`railway.json` automatically configures the `Dockerfile` and `/api/state` healthcheck).
3. **Important — Keep SQLite safe:** Right-click your service in Railway -> **Attach Volume** -> set Mount Path to **`/app/data`**. That keeps `/app/data/divly.sqlite` permanent across deploys!
4. Open the **Variables** tab and paste the variables from `.env.example` (`ADMIN_PIN`, `QR_HMAC_SECRET`, `ALLOW_DEV_LOGIN=false`, `PUBLIC_BASE_URL`, plus optional Stripe/Resend keys). Generate a Railway domain or attach your custom domain!

#### Option B: Render (1-Click Blueprint)
1. Push your repo to GitHub, then go to [dashboard.render.com/blueprints](https://dashboard.render.com/blueprints) -> **New Blueprint Instance** and select your repo.
2. Render reads `render.yaml`, automatically sets up Docker, `/api/state` healthchecks, and a **1 GB persistent disk at `/app/data`**, and prompts you for `ADMIN_PIN`, `PUBLIC_BASE_URL`, and optional Stripe/Resend keys.

#### Option C: Your Own Home Proxmox VM or VPS (Docker Compose — £0/mo hosting!)
1. Spin up an Ubuntu/Debian VM or LXC (with Docker installed) on Proxmox, clone your repo, and run:
   ```bash
   cp .env.example .env
   nano .env                  # Set ADMIN_PIN, QR_HMAC_SECRET, ALLOW_DEV_LOGIN=false
   docker compose up -d --build
   ```
2. Your app is now running at `http://<vm-ip>:3000` with SQLite stored safely inside the persistent `divly_sqlite_data` Docker volume! Point **Cloudflare Tunnel (`cloudflared`)** or Caddy/Nginx reverse proxy at `http://localhost:3000` for instant HTTPS without opening router ports.
3. **Easy Backup Tip:** Because your entire database is one SQLite file inside `/app/data`, backing up your whole company before Saturday pickup is a single command:
   ```bash
   docker cp divly-uob:/app/data/divly.sqlite ./backup-$(date +%F).sqlite
   ```
