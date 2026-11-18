# Divly — University of Birmingham Student Bulk-Buying Platform

**Divly** lets University of Birmingham (`@student.bham.ac.uk` / `@bham.ac.uk`) students chip in with other students on campus to split wholesale bulk cases (20kg Basmati sacks, 40-pack noodle cartons, Oatly Barista trays, laundry tubs) at prices **15–35% cheaper than Aldi**.

Students claim individual shares during the week. At the weekly cutoff, every **100% filled case** is locked and fulfilled for Saturday pickup at the UoB campus hub, while any **unfilled overflow slots are automatically refunded** to the penny.

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
- In local development, **1-click Test Login (`Student` | `Admin`)** is enabled in the top bar, and simulated Stripe Test Checkout works immediately with zero API keys.
- Default Admin PIN in local dev: `uob-admin-2026` (override via `ADMIN_PIN` in `.env`).

### Test & Production Build Commands

```bash
# Run automated concurrency, cutoff auto-refund & QR security tests
npm test

# Type-check & build production frontend bundle into dist/
npm run build

# Run single-port production server (serves API + compiled dist/ on PORT=3000)
npm start
```

---

## Core Features

- **Aldi-Beating Shared Case Pools:** Real-time segmented slot bars (`"3 of 4 students chipped in"`) powered by Server-Sent Events (`/api/events`) so open browsers update live whenever someone chips in.
- **Atomic Case-Boundary Allocation:** SQLite `BEGIN IMMEDIATE` transactions guarantee two students checking out at the exact same millisecond never claim the same slot. Overflow orders seamlessly spill from Case #1 into Case #2.
- **Weekly Cutoff & Penny-Exact Auto-Refunds:** One click in the Admin Dashboard settles the drop: `100%` locked cases move to `fulfilled`, incomplete overflow cases move to `auto_refunded`, and partial/full refunds (including small-order fees if zero items fulfilled) are calculated automatically.
- **Tamper-Proof Campus Pickup Passes:** Every paid order receives an `HMAC-SHA256` signed QR pass (`DV1.<orderId>.<nonce>.<sig>`), a `UOB-XXXXXX` pickup code, and a 6-digit PIN verified in constant time at the Saturday Hub scanner.
- **UoB Campus Email Verification:** Built-in 6-digit OTP sign-in restricted to `@student.bham.ac.uk` and `@bham.ac.uk` (prints codes to console in dev; sends real emails via Resend when `RESEND_API_KEY` is set).
- **Dual-Mode Checkout:** Automatically uses real **Stripe Checkout** (Card, Apple Pay, Google Pay + live Stripe Refunds API) when `STRIPE_SECRET_KEY` is configured, or falls back cleanly to an interactive Test Checkout sheet for demos and local dev.
- **No-Code Founder Admin Dashboard:** Live wholesale shopping list (only `100%` locked full cases to buy at Costco/Booker + CSV export), no-code product & Aldi price editor, hub/cutoff settings editor, and Saturday QR/PIN pickup scanner.

---

## Architecture Overview

```text
Browser (React 19 + TypeScript + Tailwind v4)
   │
   ├── REST JSON (/api/*) ───────────────┐
   └── Live SSE Stream (/api/events) ────▼
                              Express Server (Node.js 22 + tsx)
                                 ├── server/services/poolAllocator.ts  (BEGIN IMMEDIATE slot math)
                                 ├── server/services/settlement.ts     (Cutoff & auto-refund math)
                                 ├── server/services/qrPass.ts         (HMAC-SHA256 pickup passes)
                                 ├── server/services/auth.ts           (@student.bham.ac.uk OTPs)
                                 └── server/services/stripeService.ts  (Stripe Checkout & Refunds)
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

- **[STUDENT_DEV_GUIDE.md](./STUDENT_DEV_GUIDE.md)** — **Start here if you're maintaining or customizing Divly!** Explains every file, walks through the 4 core algorithms in plain English, and gives copy-paste recipes for common tasks.
- **[AGENTS.md](./AGENTS.md)** — Complete API & TypeScript data contract.
- **[FOUNDER_BUSINESS_PLAYBOOK.md](./FOUNDER_BUSINESS_PLAYBOOK.md)** — Campus operations, wholesale supplier strategy, and UoB launch playbook.
