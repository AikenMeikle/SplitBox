# Divly — University of Birmingham Student Bulk-Buying Platform

**Divly** lets University of Birmingham (`@student.bham.ac.uk` / `@bham.ac.uk`) students chip in with other students on campus to split wholesale bulk cases (20kg Basmati sacks, 40-pack noodle cartons, Oatly Barista trays, laundry tubs) at prices **15–35% cheaper than Aldi**.

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

Open **http://localhost:5173** in your browser.
- In local development, **1-click Test Login (`Student` | `Admin`)** is enabled in the top bar, simulated Stripe Test Checkout works immediately, and **Open Food Facts UK live barcode/product import** works out of the box with zero API keys.
- Default Admin PIN in local dev: `uob-admin-2026` (override via `ADMIN_PIN` in `.env`).

### Test & Production Build Commands

```bash
# Run automated concurrency, closer-bonus, buy-ahead predictor, refund & QR security tests
npm test

# Type-check & build production frontend bundle into dist/
npm run build

# Run single-port production server (serves API + compiled dist/ on PORT=3000)
npm start
```

---

## Core Features

- **Aldi-Beating Shared Case Pools:** Real-time segmented slot bars (`"3 of 4 students chipped in"`) powered by Server-Sent Events (`/api/events`) so open browsers update live whenever someone chips in.
- **Almost-Full Closer Bonus & Fee Waiver:** Solves early low-density campus cold-start by spotlighting boxes that are `50%+` full (or `1–2` spots away from locking) with an extra **6%–10% Closer Bonus** (margin-clamped above wholesale unit cost) AND **£0.00 Free Hub Pickup** across the student's entire trolley.
- **Atomic Case-Boundary Allocation:** SQLite `BEGIN IMMEDIATE` transactions guarantee two students checking out at the exact same millisecond never claim the same slot. Overflow orders seamlessly spill from Case #1 into Case #2.
- **Bayesian Incomplete-Box Buy-Ahead Safety Predictor:** Evaluates incomplete open boxes at cutoff using a **Gamma-Poisson weekly demand model**, **Poisson cumulative sell-through probability `P(D >= u)`** within half the item's shelf life, and **upfront student cash coverage float math** — letting the founder safely underwrite high-demand shelf-stable boxes (`SAFE_BUY_AHEAD`) and roll leftover stock (`carryoverStockSlots`) into next week instead of refunding students.
- **Live UK Wholesale & Open Food Facts Barcode API:** Search real UK groceries by name or EAN-13 barcode right inside Admin using **Open Food Facts UK v2** (works out of the box with zero API keys!), optionally connect `QOGITA_API_KEY` or `WHOLESALE_ORDER_WEBHOOK_URL` for automated B2B purchase orders, and open 1-click **Qogita / Booker / Bestway** SKU links.
- **Weekly Cutoff & Penny-Exact Auto-Refunds:** One click in Admin settles the drop (`locked_box` + approved buy-ahead boxes -> `fulfilled`; remaining `pooling` -> `auto_refunded`) with penny-exact Stripe or simulated refunds.
- **Tamper-Proof Campus Pickup Passes & UoB OTP Auth:** `HMAC-SHA256` signed QR passes (`DV1.<orderId>.<nonce>.<sig>`), `UOB-XXXXXX` codes, 6-digit PINs, and `@student.bham.ac.uk` / `@bham.ac.uk` email verification.

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
                                 ├── server/services/settlement.ts        (Cutoff, carryover & auto-refunds)
                                 ├── server/services/qrPass.ts            (HMAC-SHA256 pickup passes)
                                 ├── server/services/auth.ts              (@student.bham.ac.uk OTPs)
                                 └── server/services/stripeService.ts     (Stripe Checkout & Refunds)
                                         │
                                         ▼
                              Built-in SQLite (WAL mode)
                              data/divly.sqlite (1 persistent file)
```

---

## Deploying to Production

Divly runs as a single lightweight container with a persistent volume mounted at `/app/data` so `divly.sqlite` survives restarts and new deployments:

- **Home Proxmox VM / VPS (Docker Compose):** Copy `.env.example` to `.env`, set strong `ADMIN_PIN` and `QR_HMAC_SECRET` values, and run `docker compose up -d --build`.
- **Railway:** Push to GitHub, create a project from your repo (`railway.json` auto-configures the build & `/api/state` healthcheck), attach a Volume mounted at `/app/data`, and add your `.env` variables.
- **Render:** Connect your GitHub repo via Blueprint (`render.yaml` configures the Docker web service, `/api/state` healthcheck, and a 1 GB persistent disk at `/app/data`).

---

## Documentation Map

- **[STUDENT_DEV_GUIDE.md](./STUDENT_DEV_GUIDE.md)** — **Start here if you're maintaining or customizing Divly!** Explains every file, walks through all core algorithms (including Closer Bonuses, Bayesian Buy-Ahead math, and Live Wholesale APIs) in plain English, and gives copy-paste recipes.
- **[AGENTS.md](./AGENTS.md)** — Complete API & TypeScript data contract.
- **[FOUNDER_BUSINESS_PLAYBOOK.md](./FOUNDER_BUSINESS_PLAYBOOK.md)** — Campus operations, wholesale supplier strategy, and UoB launch playbook.
