# Divly — University of Birmingham Student Bulk-Buying Platform

> **🚀 Launching Divly for Real? Start Here:**
> - **[SETUP_AND_COSTS.md](./SETUP_AND_COSTS.md)** — **Complete GBP (`£`) Cost Breakdown (`£0/mo` Proxmox vs `~£4/mo` Railway, under `£45` Day-1 total)** + **30-Minute Production Setup Checklist** (`.env` secrets, Stripe UK Apple Pay/Google Pay, Resend OTP DNS & live deploy).
> - **[LAUNCH_IN_14_DAYS.md](./LAUNCH_IN_14_DAYS.md)** — **Day 1 → Day 14 University of Birmingham campus launch playbook**.

**Divly** lets University of Birmingham (`@student.bham.ac.uk` / `@bham.ac.uk`) students chip in with other students on campus to split factory-sealed wholesale bulk cases (20kg Basmati sacks, 40-pack noodle cartons, UHT oat milk trays, laundry tubs) at prices **15–35% lower than UK supermarket prices**.

Students claim individual shares during the week. At the weekly cutoff, every **100% filled case** (plus any shelf-stable cases safely underwritten by the founder) is fulfilled for Saturday pickup at the UoB campus hub, while unfilled risky overflow slots are **automatically refunded** to the penny.

---

## Quickstart (Local Development)

> **Prerequisite:** **Node.js 22+** (uses Node 22's built-in `node:sqlite` engine — zero external database server or C++ build tools needed).

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Copy environment template if customizing secrets or keys
cp .env.example .env

# 3. Start both backend API (:3001) and Vite React frontend (:5173)
npm run dev
```

Open **http://localhost:5173** in your browser (and **http://localhost:5173/flyer.html** for the printable A4 campus hall poster).
- In local development, **1-click Test Login (`Student` | `Admin`)** is enabled in the top bar, simulated Stripe Test Checkout works immediately, and **Open Food Facts UK live barcode/product import** works out of the box with zero API keys.
- Default Admin PIN in local dev: `uob-admin-2026` (override via `ADMIN_PIN` in `.env`).

### Test, CI & Production Build Commands

```bash
# Run automated concurrency, closer-bonus, referral, buy-ahead, refund & QR security tests
npm test

# Type-check & build production frontend bundle into dist/ (verified automatically by GitHub Actions CI)
npx tsc -b && npm run build

# Run single-port production server (serves API + /flyer.html + compiled dist/ on PORT=3000)
npm start
```

---

## Core Features

- **Supermarket-Beating Shared Case Pools:** Real-time segmented slot bars (`"3 of 4 students chipped in"`) powered by Server-Sent Events (`/api/events`) so open browsers update live across campus.
- **Almost-Full Closer Bonus & Fee Waiver:** Concentrates early campus traffic into finishing open boxes (`50%+` full or `1–2` spots left) with an extra **6%–10% Closer Bonus** (margin-clamped above wholesale unit cost) AND **£0.00 Free Hub Pickup** across the student's entire trolley.
- **Campus Viral Referral & Wallet Credit Loop:** Every student gets a personal `?ref=UOB-XXXXXX` invite link (`🎁 Give £0.50, Get £1.00`): invited hallmates receive an instant **£0.50 welcome credit** applied automatically at checkout, and referrers earn **£1.00 wallet credit** once their friend's first order confirms.
- **Student "Suggest & Upvote Next Week's Drop" Board:** Students submit and upvote bulk items they want stocked next (`RequestBoardSection.tsx`), letting the founder validate demand before buying stock and mark top-voted requests `Stocked` in 1 click.
- **Bayesian Incomplete-Box Buy-Ahead Safety Predictor:** Scores incomplete open boxes (`0–100`) using a **Gamma-Poisson weekly demand model**, **Poisson sell-through probability `P(D >= u)`**, and **upfront student cash float math** so the founder can safely underwrite shelf-stable `3/4` boxes (`SAFE_BUY_AHEAD`) and roll leftover stock (`carryoverStockSlots`) into next week instead of refunding students.
- **Live UK Wholesale & Barcode API:** Search real UK groceries by name or EAN-13 barcode in Admin via **Open Food Facts UK v2** (zero API keys needed!), optionally connect `QOGITA_API_KEY` or `WHOLESALE_ORDER_WEBHOOK_URL` for automated B2B purchase orders, and open 1-click **Qogita / Booker / Bestway** SKU links.
- **Saturday Hub Ops Power-Tools:** `HMAC-SHA256` signed QR passes (`DV1.<orderId>.<nonce>.<sig>`) verified via **live phone camera QR scanning** (`BarcodeDetector` in `AdminScannerTab.tsx`) or 6-digit PIN, **printable tear-off Saturday Kraft bag packing labels**, **1-click JSON database backups** (`/api/admin/backup`), UK legal compliance footer (FIR 2014 sealed ambient goods & Consumer Contracts Regs 2013), and a print-ready A4 hall poster (`/flyer.html`).

---

## Architecture Overview

```text
Browser (React 19 + TypeScript + Tailwind v4)
   │
   ├── REST JSON (/api/*) ───────────────┐
   └── Live SSE Stream (/api/events) ────▼
                              Express Server (Node.js 22 + tsx)
                                 ├── server/services/poolAllocator.ts     (BEGIN IMMEDIATE slot math)
                                 ├── server/services/buyAheadPredictor.ts (Gamma-Poisson rollover risk)
                                 ├── server/services/wholesaleApi.ts      (Open Food Facts UK + Qogita B2B)
                                 ├── server/services/settlement.ts        (Cutoff, credits & auto-refunds)
                                 ├── server/services/qrPass.ts            (HMAC-SHA256 pickup passes)
                                 ├── server/services/auth.ts              (@student.bham.ac.uk OTP + referrals)
                                 └── server/services/stripeService.ts     (Stripe Checkout & Refunds)
                                         │
                                         ▼
                              Built-in SQLite (WAL mode)
                              data/divly.sqlite (1 persistent file + 1-click JSON backup)
```

---

## Deploying to Production

Divly runs as a single lightweight container with a persistent volume mounted at `/app/data` so `divly.sqlite` survives restarts and new deployments:

- **Home Proxmox VM / VPS (Docker Compose):** Copy `.env.example` to `.env`, set strong `ADMIN_PIN` and `QR_HMAC_SECRET` values, and run `docker compose up -d --build`.
- **Railway:** Push to GitHub, create a project from your repo (`railway.json` auto-configures the build & `/api/state` healthcheck), attach a Volume mounted at `/app/data`, and add your `.env` variables.
- **Render:** Connect your GitHub repo via Blueprint (`render.yaml` configures the Docker web service, `/api/state` healthcheck, and a 1 GB persistent disk at `/app/data`).

---

## Documentation Map

- **[SETUP_AND_COSTS.md](./SETUP_AND_COSTS.md)** — **Complete itemized GBP (`£`) launch cost breakdown (`£0/mo` Proxmox vs `~£4/mo` Railway) & 30-minute production setup checklist** before taking real student payments.
- **[LAUNCH_IN_14_DAYS.md](./LAUNCH_IN_14_DAYS.md)** — **Step-by-step Day 1 → Day 14 University of Birmingham launch checklist** (council food registration, Stripe Apple Pay, Resend DNS, Booker Aston / Qogita setup, `/flyer.html` hall seeding, Wednesday cutoff, and Saturday hub handover).
- **[MARKETING_CAMPAIGN.md](./MARKETING_CAMPAIGN.md)** — **Single-location initial user marketing campaign (0 → 100 students)** (cold-start Closer Bonus hooks, WhatsApp peer-locking loops, kitchen tastings, and Saturday hub viral flywheels).
- **[STUDENT_DEV_GUIDE.md](./STUDENT_DEV_GUIDE.md)** — **Start here if you're maintaining or customizing Divly!** Explains every file, walks through all core algorithms in plain English, and gives copy-paste recipes.
- **[AGENTS.md](./AGENTS.md)** — Complete API & TypeScript data contract.
- **[FOUNDER_BUSINESS_PLAYBOOK.md](./FOUNDER_BUSINESS_PLAYBOOK.md)** — Extended campus operations, wholesale supplier strategy, and UoB growth playbook.
