# SplitBox UoB — 24-Hour Full-Stack Build & Campus Launch Runbook

> **Founder Profile & Constraint Envelope:** 1st-year Computer Science student at the **University of Birmingham (UoB)** (`@student.bham.ac.uk`), operating on a **`£0.00/month` fixed software budget**, with **24 hours of Antigravity multi-agent `/swarm` access right now**, transitioning after Hour 24 to **free student AI tools** (GitHub Copilot Pro via GitHub Student Developer Pack, free Claude / ChatGPT / Gemini web tiers, and Cursor free tier).

---

## 1. Executive Strategy — Why This 24-Hour Sequence Maximizes Leverage

You already have a polished, tactile React 19 + Tailwind v4 frontend (`StorefrontView`, `SplitCard`, radial `<SliceMeter />`, `BasketDrawer`, `OrdersPickupView`, `PickupPassCard`, `HubOpsView`, and `InvestorPitchView`). Right now, however, every pool count, payment hold, cutoff refund, and QR scan lives inside a single browser's `localStorage` (`splitbox_uob_drop_v1`).

**The core leverage rule for the next 24 hours:**
- **Spend 100% of your 24-hour multi-agent `/swarm` window on complex, multi-file backend & distributed-systems plumbing** — ACID row-locked PostgreSQL slice allocation (`SELECT ... FOR UPDATE`), passwordless `@student.bham.ac.uk` Magic Link authentication, Stripe `capture_method: 'manual'` pre-authorisation holds + idempotent webhooks, Thursday `09:00` automated partial-capture/cancel settlement, HMAC-SHA256 QR passes, an offline-capable `/ops/scan` Hub Marshall PWA (`IndexedDB`), and multi-client concurrency tests.
- **Do NOT burn multi-agent swarm hours tweaking static copy, colours, or SKU lists.** Once the dual-mode `DropRepository` adapter (`LocalDemoRepository` + `SupabaseRepository`) and automated test suite are in place by Hour 24, maintaining SplitBox with free single-file AI tools (GitHub Copilot Pro in VS Code or free Claude/ChatGPT web sessions) takes minutes per week.
- **Preserve Zero-Config Demo Mode (`VITE_DEMO_MODE=true`):** Whenever Supabase/Stripe `.env` keys are absent or `VITE_DEMO_MODE=true` is set, the app automatically boots into `LocalDemoRepository` (`localStorage` + `DemoControlsBar`). This guarantees `npm run dev` works offline in 2 seconds for live UoB Guild, UoB Elevate, and investor pitches without touching production student data.

### Locked-In UoB Drop #1 Business & Engineering Rules

| Rule Area | Locked-In Drop #1 Decision | Why It Protects Margin & Legal Compliance |
| :--- | :--- | :--- |
| **1 Active Launch Hub** | **`Vale · Shackleton`** (`vale-shackleton`, Sat `12:00–14:00` 2-hour table run by founder + 1 flatmate at **`£0.00` wage cost**). Secondary UoB hubs (`Selly Oak · Bristol Rd`, `Pritchatts Park`, `Guild · Mermaid Sq`) render with `status: 'coming_soon'` + **"Vote Next Hub"** email demand capture. | Concentrates 100% of early UoB liquidity into one pool so boxes hit `4/4` (`100%`) reliably instead of fragmenting orders across 4 half-empty hubs, while saving `£176/drop` in marshall wages. |
| **`£9.00+` Free Crate & 1 Editable Order** | **`£0.00` fee on crates `≥ £9.00`** (`900` pence); transparent **`£0.39` micro-crate card-cover fee below `£9.00`** (`39` pence). Each student gets **1 editable weekly order** up until Wednesday `23:59` cutoff. | Stripe UK charges `1.5% + 20p` per captured domestic card transaction. Consolidating a student's weekly slices onto one editable `PaymentIntent` prevents multiple `20p` fixed fees from eroding wholesale gross margin (~`21%–26%`). |
| **`0%`-VAT, FIR-Labelled Ambient SKUs First** | Launch Drop #1 with **`0%` zero-rated**, factory-sealed ambient sub-units carrying individual English **UK FIR 14-allergen** labels, while supporting `vatRate: 0 | 0.20` in the catalog/DB schema. | Avoids cold-chain EHO risk, prevents losing `1/6th` of gross price to unmodelled `20%` standard-rated output VAT, and ensures every sub-unit handed to a student is legally compliant for standalone resale. |
| **72–96h Weekly Drop Cycle (7-Day Card Hold Safe)** | **Open Sunday `18:00`** → **Cutoff Wednesday `23:59`** → **Booker Aston (`B6 5RQ`) pick Thursday `06:30–08:30`** → **Stripe `capture()` / `cancel()` settlement Thursday `09:00`** → **Shackleton pickup Saturday `12:00–14:00`**. | Sunday `18:00` to Thursday `09:00` is **87 hours (~3.6 days)** — safely inside Visa/Mastercard's **7-day (`168h`)** manual-capture authorisation expiry. Cancelling unfulfilled holds costs **`£0.00` in Stripe fees**, and settling *after* the Booker pick handles depot stockouts cleanly. |
| **FCA-Compliant Pre-Auth Copy** | Replace unregulated `"escrow"` checkout Claims with **"Card Pre-Authorisation Hold (£0.00 Captured Until Box Locks)"**. | Avoids implying FCA-regulated escrow/payment-institution custody under UK Payment Services Regulations 2017 while communicating the exact zero-risk guarantee to students. |

---

## 2. Free `£0/Month` Student Infrastructure & Perks Setup (30 Mins — Do While Agents Code)

Complete these 5 setup steps in your browser **while Sprint Block 1 runs** so your live keys are ready by Hour 4. Fixed monthly infrastructure cost: **`£0.00/month`**.

- [ ] **1. GitHub Student Developer Pack (`£0.00/mo` — 5 mins to apply)**
  - Sign in at `https://education.github.com/pack` and add/verify your **`@student.bham.ac.uk`** email address + upload a photo of your UoB student ID card.
  - Enable **GitHub Copilot Pro (`£0.00/mo` while enrolled)** inside VS Code — this becomes your primary daily AI pair-programmer after Hour 24.
  - Claim your **1 free custom domain** (`Namecheap` `.me` or `Name.com` perk, e.g. `splitboxuob.me`) and enable free GitHub Actions CI on your private repository.

- [ ] **2. Supabase Free Tier (`£0.00/mo` — 8 mins)**
  - Create a new project named `splitbox-uob` in **`eu-west-2` (London)** for UK GDPR data residency and `<15ms` round-trip latency from Birmingham (`500 MB` Postgres database, `50,000` monthly active users, `500,000` Edge Function invocations/month, and Realtime WebSockets included at `£0.00/mo`).
  - In **Authentication → Providers → Email**, enable **Email OTP / Magic Link** (disable password requirement if using pure Magic Links).
  - Copy three keys from **Project Settings → API**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] **3. Stripe UK Account (`£0.00/mo` fixed — 8 mins)**
  - Create a UK Stripe account (`Individual / Sole Trader`) and toggle **Test Mode** on immediately so Sprint Block 3 can run end-to-end with test card `4242 4242 4242 4242` while bank verification completes.
  - In **Settings → Payment Methods**, enable **Cards**, **Apple Pay**, and **Google Pay** (UK domestic consumer cards cost `1.5% + £0.20` *only when captured*; uncaptured manual holds cancelled via `paymentIntents.cancel()` incur **`£0.00`** Stripe fees).
  - Copy `VITE_STRIPE_PUBLISHABLE_KEY` (`pk_test_...`) and server-only `STRIPE_SECRET_KEY` (`sk_test_...`). Once Sprint Block 3 deploys the webhook Edge Function, register its URL for `payment_intent.amount_capturable_updated`, `payment_intent.canceled`, and `payment_intent.payment_failed` to obtain `STRIPE_WEBHOOK_SECRET` (`whsec_...`).

- [ ] **4. Resend Free Tier (`£0.00/mo` for `3,000` emails/mo — 5 mins)**
  - Create a free account at `https://resend.com` and add your free student domain (`SPF` + `DKIM` DNS records on Cloudflare).
  - Connect Resend's SMTP credentials in **Supabase → Project Settings → Authentication → SMTP Settings**. *(Critical: Supabase's built-in dev mailer caps Magic Links at 2 emails/hour; custom Resend SMTP lifts that cap immediately at `£0.00/mo` so 100+ Shackleton students can sign in on Sunday evening.)*
  - Copy `RESEND_API_KEY` (`re_...`) for Thursday `09:00` settlement receipt & QR Pickup Pass emails.

- [ ] **5. Cloudflare Pages (`£0.00/mo` unlimited static bandwidth — 4 mins)**
  - Connect your GitHub repository to **Cloudflare Pages** (Build command: `npm run build`, Build output directory: `dist`).
  - Add client environment variables (`VITE_DEMO_MODE=false`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`) in Production, while leaving a second preview alias (`demo.splitboxuob.me` with `VITE_DEMO_MODE=true`) for instant offline pitch demos.

### Environment Variables Template (`.env.example` vs Supabase Secrets)

```bash
# .env.local (Frontend Vite Client — safe public keys only)
VITE_DEMO_MODE=false
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Server-Only Secrets (set via: npx supabase secrets set KEY=VALUE)
# NEVER prefix these with VITE_ or commit them to Git!
SUPABASE_SERVICE_ROLE_KEY=eyJ...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PICKUP_PASS_HMAC_SECRET=<32-byte-hex-from-openssl-rand-hex-32>
RESEND_API_KEY=re_...
ADMIN_CUTOFF_BEARER_TOKEN=<32-byte-hex-admin-secret>
```

---

## 3. Hour-by-Hour 24h Antigravity Build Roadmap (5 Sprint Blocks)

Execute these 5 sequential Sprint Blocks across your 24-hour Antigravity window. Each block ends with a hard verification gate and a **ready-to-copy-paste `/swarm` prompt**. Reference architectural contracts live in [docs/architecture/fullstack-blueprint.md](./architecture/fullstack-blueprint.md) and product rules in [docs/product/mvp-spec.md](./product/mvp-spec.md).

---

### Sprint Block 1 (Hours 1–3): Domain Model, VAT/Margin Math, `£9` Crate Rule, 1-Hub Config & `DropRepository` Adapter

**Objectives & File Deliverables:**
1. **Dual-Mode Environment & Repository Interface (`src/lib/env.ts`, `src/repositories/DropRepository.ts`, `src/repositories/LocalDemoRepository.ts`):**
   - Implement `isDemoMode()` returning `true` whenever `import.meta.env.VITE_DEMO_MODE === 'true'` OR `VITE_SUPABASE_URL` is absent.
   - Wrap existing deterministic `src/store/dropEngine.ts` logic cleanly behind `LocalDemoRepository` so `DropContext.tsx` talks to the `DropRepository` contract with zero UI breakage.
2. **UoB Drop #1 Rules in `src/types.ts`, `src/data/catalog.ts`, and `src/store/dropEngine.ts`:**
   - Set **`Vale · Shackleton`** (`vale-shackleton`, Sat `12:00–14:00`, `£0.00` staff wage cost) as the **1 active launch hub** (`status: 'active'`), keeping `Selly Oak · Bristol Rd`, `Pritchatts Park`, and `Guild · Mermaid Sq` visible with `status: 'coming_soon'` and a `"Vote Next Hub"` counter.
   - Enforce the **`£9.00+` Free Crate Rule**: `platformFeePence = subtotalPence >= 900 ? 0 : 39` (`£0.00` at `≥ £9.00`, transparent `£0.39` micro-crate card-cover fee below `£9.00`) + **1 editable weekly order per student** before Wednesday `23:59` cutoff.
   - Standardise `vatRate: 0 | 0.20` across `CatalogItem` with ex-VAT net margin helpers (`outputVatPence = vatRate === 0.20 ? Math.round(slicePricePence / 6) : 0`), prioritizing `0%`-VAT, individually FIR-labelled ambient essentials.
3. **Compliant Pre-Auth & Uncollected Restocking UX (`BasketDrawer.tsx`, `OrdersPickupView.tsx`, `PickupPassCard.tsx`):**
   - Replace `"escrow"` checkout copy with **"Card Pre-Authorisation Hold (£0.00 Captured Until Box Locks)"**.
   - Suppress collectable QR Pickup Pass rendering when `fulfilledSliceCount === 0` (show `"100% Hold Released — £0.00 Charged"` receipt instead).
   - Add `"Delegate Pass to a Flatmate"` proxy PIN display and CCR 2013-compliant `£2.00` uncollected ambient restocking policy.

**Verification Gate (End of Hour 3):**
- `npm run verify` (`npm test` + zero-CDN offline audit + `tsc -b && vite build`) exits `0` with `VITE_DEMO_MODE` auto-enabled when `.env.local` is absent.

#### Copy-Paste `/swarm` Prompt — Sprint Block 1
```text
/swarm Execute Sprint Block 1 (Hours 1–3) from docs/ACTION_PLAN_24H.md, following AGENTS.md, docs/product/mvp-spec.md, and docs/architecture/fullstack-blueprint.md.

Spawn parallel full-tool workers on disjoint file slices plus a read-only verifier:
1. `domain-adapter` (owns `src/types.ts`, `src/data/catalog.ts`, `src/lib/env.ts`, `src/repositories/DropRepository.ts`, `src/repositories/LocalDemoRepository.ts`):
   - Implement `isDemoMode()` (auto-true when `VITE_DEMO_MODE=true` or `VITE_SUPABASE_URL` is unset) and the async `DropRepository` interface backed by `LocalDemoRepository`.
   - Configure `Vale · Shackleton` (`vale-shackleton`, Sat 12:00–14:00, £0 staff cost) as the 1 `status: 'active'` launch hub and `Selly Oak · Bristol Rd`, `Pritchatts Park`, `Guild · Mermaid Sq` as `status: 'coming_soon'` with "Vote Next Hub" support.
   - Add explicit `vatRate: 0 | 0.20` ex-VAT net margin math, `£0.00` crate fee at `>= £9.00` (`900` pence) vs `£0.39` (`39` pence) micro-crate card-cover fee below `£9.00`, and 1 editable weekly order per student before Wed `23:59` cutoff.
2. `store-and-copy` (owns `src/store/dropEngine.ts`, `src/store/DropContext.tsx`, `src/components/basket/BasketDrawer.tsx`, `src/components/orders/OrdersPickupView.tsx`, `src/components/orders/PickupPassCard.tsx`, `src/components/storefront/Navbar.tsx`):
   - Wire `DropContext` to `DropRepository`, support editing an existing pre-cutoff weekly order, render "Vote Next Hub" pills on `coming_soon` hubs, replace unregulated "escrow" checkout wording with "Card Pre-Authorisation Hold (£0.00 Captured Until Box Locks)", suppress QR pass generation when `fulfilledSliceCount === 0`, and surface flatmate proxy delegation + CCR 2013 `£2.00` uncollected ambient restocking copy.
3. `block1-verifier` (owns `tests/` updates if needed, verifies everything):
   - Run `npm run verify` (`npm test` + offline/GBP check + `npx tsc -b && npm run build`) and confirm 0 errors, integer-pence accuracy on the `£9.00` / `£0.39` boundary, and 375px mobile layout integrity.
```

---

### Sprint Block 2 (Hours 4–8): Supabase Postgres Migrations, ACID `claim_sequential_slices` RPC, `@student.bham.ac.uk` Auth & Realtime `<SliceMeter />`

**Objectives & File Deliverables:**
1. **Production SQL Schema & RLS (`supabase/migrations/0001_splitbox_core.sql`, `0002_rls_and_auth.sql`, `supabase/seed.sql`):**
   - Create `hubs`, `drops`, `products`, `hub_product_pools`, `orders`, `claimed_slices`, `pickup_passes`, `stripe_webhook_events`, and `hub_votes` exactly matching [docs/architecture/fullstack-blueprint.md](./architecture/fullstack-blueprint.md).
   - Enforce integer pence columns, partial unique index `UNIQUE (drop_id, hub_id, user_id) WHERE status NOT IN ('cancelled_by_student')` (1 active weekly order per student), and `UNIQUE (pool_id, global_slot_index) WHERE status IN ('soft_reserved','preauth_locked','fulfilled')`.
   - Lock down Row-Level Security (RLS): anonymous visitors can read aggregate `hub_product_pools` counts (zero student emails or flat numbers exposed); authenticated `@student.bham.ac.uk` / `@bham.ac.uk` users can read only their own `orders`, `claimed_slices`, and `pickup_passes`.
2. **ACID Cross-Box Allocator RPC (`supabase/migrations/0003_claim_slices_rpc.sql`):**
   - Implement `claim_sequential_slices` PL/pgSQL `SECURITY DEFINER` RPC acquiring `SELECT ... FOR UPDATE` locks on `hub_product_pools` ordered deterministically by `product_id ASC` (deadlock-free), sweeping expired 10-minute `soft_reserved` holds (`reserved_until < now()`), compacting active slots if an unconfirmed hold expired, and allocating sequential `global_slot_index`, `box_number = (idx / slices_per_box) + 1`, and `slot_index_in_box = idx % slices_per_box` across case boundaries (`3/4 + 2 → Box #1 4/4 + Box #2 1/4`).
3. **UoB Magic Link Auth & Realtime Adapter (`src/lib/supabaseClient.ts`, `src/components/auth/UobMagicLinkModal.tsx`, `src/repositories/SupabaseRepository.ts`):**
   - Install `@supabase/supabase-js`, validate `/^[a-z0-9._%+-]+@(student\.)?bham\.ac\.uk$/i` before calling `signInWithOtp`, and subscribe to `postgres_changes` on `hub_product_pools` so `<SliceMeter />` radial wedges update live across campus browsers.

**Verification Gate (End of Hour 8):**
- SQL migrations apply cleanly (`npx supabase db reset` or against Supabase London project), `SupabaseRepository` compiles with `0` TypeScript errors, and `VITE_DEMO_MODE=true` still passes `npm run verify` with zero network calls.

#### Copy-Paste `/swarm` Prompt — Sprint Block 2
```text
/swarm Execute Sprint Block 2 (Hours 4–8) from docs/ACTION_PLAN_24H.md and docs/architecture/fullstack-blueprint.md.

Spawn parallel full-tool workers on disjoint slices plus a verifier:
1. `sql-architect` (owns `supabase/config.toml`, `supabase/migrations/0001_splitbox_core.sql`, `supabase/migrations/0002_rls_and_auth.sql`, `supabase/migrations/0003_claim_slices_rpc.sql`, `supabase/seed.sql`):
   - Write complete Postgres DDL for `hubs`, `drops`, `products`, `hub_product_pools`, `orders`, `claimed_slices`, `pickup_passes`, `stripe_webhook_events`, and `hub_votes` with integer pence CHECK constraints and RLS policies restricting student auth to `@student.bham.ac.uk` / `@bham.ac.uk`.
   - Implement deadlock-free PL/pgSQL `claim_sequential_slices` and `release_expired_soft_holds` RPCs using `SELECT ... FOR UPDATE` on `hub_product_pools`, 10-minute `soft_reserved` holds (`reserved_until`), and deterministic cross-box indexing (`box_number`, `slot_index_in_box`).
2. `supabase-client-ui` (owns `package.json`, `src/lib/supabaseClient.ts`, `src/repositories/SupabaseRepository.ts`, `src/components/auth/UobMagicLinkModal.tsx`, `src/store/DropContext.tsx`):
   - Add `@supabase/supabase-js`, build `UobMagicLinkModal` (passwordless OTP gated to `@student.bham.ac.uk` / `@bham.ac.uk`), implement `SupabaseRepository` with Realtime `hub_product_pools` subscriptions feeding `<SliceMeter />`, and keep `LocalDemoRepository` untouched when `isDemoMode()` is true.
3. `block2-verifier` (verifies SQL syntax, RLS coverage, TypeScript build, and Demo Mode fallback):
   - Audit every SQL constraint and RPC edge case against `docs/architecture/fullstack-blueprint.md` and run `npx tsc -b && npm run build` + `npm test`.
```

---

### Sprint Block 3 (Hours 9–14): Stripe Manual-Capture Pre-Auth Checkout, Idempotent Webhooks & Thursday `09:00` Settlement

**Objectives & File Deliverables:**
1. **Pre-Auth Edge Function (`supabase/functions/create-or-update-preauth/index.ts`):**
   - Verifies student Supabase JWT, calls `claim_sequential_slices` to reserve/update the student's 1 weekly order in `soft_reserved` status, computes server-side `subtotal_pence + micro_crate_fee_pence` (`0` if `≥ 900`, `39` if `< 900`), and creates or updates a Stripe `PaymentIntent` (`currency: 'gbp'`, `capture_method: 'manual'`, deterministic `idempotencyKey`) returning `clientSecret`.
2. **Idempotent Stripe Webhook (`supabase/functions/stripe-webhook/index.ts`):**
   - Verifies `Stripe-Signature` header via `stripe.webhooks.constructEventAsync`, inserts `event.id` into `stripe_webhook_events` (`ON CONFLICT DO NOTHING` for strict idempotency), promotes `soft_reserved` slices to `preauth_locked` on `payment_intent.amount_capturable_updated`, and releases slots immediately on `payment_intent.canceled` or `payment_intent.payment_failed`.
3. **Thursday `09:00` Post-Booker Settlement Function (`supabase/functions/settle-drop-cutoff/index.ts`):**
   - Triggered by the founder at Thursday `09:00` right after picking locked wholesale cases at Booker Aston (`B6 5RQ`). Accepts optional `stockShortageOverrides: Record<productId, actualPickedBoxes>` in case Booker had fewer cases on the shelf than locked.
   - Evaluates each order's slices (`fulfilled` if `box_number <= effective_locked_boxes`, else `released_unfilled`):
     - **100% Fulfilled Order:** `stripe.paymentIntents.capture(pi_id)` for full `preauth_hold_pence`.
     - **Mixed Full + Partial Overflow Order:** `stripe.paymentIntents.capture(pi_id, { amount_to_capture: captured_total_pence })` — Stripe captures only fulfilled slices (+ `£0.39` fee if captured subtotal `< £9.00`) and automatically releases the uncaptured overflow hold back to the student's bank with `£0.00` refund fee.
     - **0 Fulfilled Slices:** `stripe.paymentIntents.cancel(pi_id)` — releases 100% of the hold (including any `£0.39` micro-fee) and pays **`£0.00` in Stripe fees**.
   - Dispatches itemised GBP settlement emails via Resend API.
4. **Live Stripe PaymentElement UI (`src/components/basket/StripePreAuthSheet.tsx` & `BasketDrawer.tsx`):**
   - Mounts `@stripe/react-stripe-js` `<PaymentElement />` (Apple Pay / Google Pay / UK Debit Card) only when `isDemoMode() === false`.

**Verification Gate (End of Hour 14):**
- Test checkout with Stripe `4242...` card places an `uncaptured` hold in Stripe Dashboard, promotes slices to `preauth_locked`, and running `settle-drop-cutoff` on a `3/4 + 2` cross-box order captures only `Box #1` (`1` slice) while releasing `Box #2` (`1` overflow slice).

#### Copy-Paste `/swarm` Prompt — Sprint Block 3
```text
/swarm Execute Sprint Block 3 (Hours 9–14) from docs/ACTION_PLAN_24H.md and docs/architecture/fullstack-blueprint.md.

Spawn parallel full-tool workers on disjoint slices plus a verifier:
1. `edge-payments` (owns `supabase/functions/_shared/*`, `supabase/functions/create-or-update-preauth/index.ts`, `supabase/functions/stripe-webhook/index.ts`):
   - Build `create-or-update-preauth` computing integer-pence totals server-side (`£0.00` fee `>= 900p`, `39p` `< 900p`), enforcing 1 editable weekly order per student, and creating/updating a Stripe `PaymentIntent` with `capture_method: 'manual'`.
   - Build `stripe-webhook` with `constructEventAsync` signature verification, `stripe_webhook_events` idempotency deduplication, and atomic `soft_reserved -> preauth_locked` promotion on `payment_intent.amount_capturable_updated`.
2. `edge-settlement` (owns `supabase/functions/settle-drop-cutoff/index.ts`, `supabase/migrations/0004_settlement_rpc.sql`):
   - Build the Thursday `09:00` post-Booker settlement job supporting `stockShortageOverrides`, executing full `capture()`, partial `capture({ amount_to_capture })` on mixed cross-box orders, and `cancel()` (`£0.00` Stripe fee) when `fulfilled_slice_count === 0`, plus Resend settlement receipt emails.
3. `checkout-stripe-ui` (owns `package.json`, `src/components/basket/StripePreAuthSheet.tsx`, `src/components/basket/BasketDrawer.tsx`, `.agents/skills/splitbox-qa-gate/scripts/verify_offline_and_build.sh`):
   - Integrate `@stripe/stripe-js` and `@stripe/react-stripe-js` lazily when `!isDemoMode()`, keeping Demo Mode 100% offline with zero runtime `js.stripe.com` loads during offline demos.
4. `block3-verifier` (audits pence rounding, Stripe fee/cancel edge cases, webhook replay idempotency, and runs `npm run verify`).
```

---

### Sprint Block 4 (Hours 15–19): Cryptographic HMAC-Signed Pickup Pass, Offline `/ops/scan` Marshall PWA & Booker PO CSV Export

**Objectives & File Deliverables:**
1. **HMAC-SHA256 QR Token Issuance (`supabase/functions/_shared/hmacPass.ts` & `PickupPassCard.tsx`):**
   - Mint compact, server-signed QR tokens in the format `sb1.<pass_uuid>.<nonce>.<hmac_sha256_b64url>` using `PICKUP_PASS_HMAC_SECRET` during `settle-drop-cutoff` (only for orders with `fulfilled_slice_count > 0`).
   - Support one-click **"Rotate / Delegate Pass to Flatmate"** (regenerates `qr_nonce` + `proxy_pin_display`, invalidating any old screenshot).
2. **Offline-First `/ops/scan` Mobile Scanner PWA (`src/lib/offlineManifestStore.ts`, `src/components/ops/LiveScannerPwaView.tsx`, `supabase/functions/marshall-manifest/index.ts`, `supabase/functions/redeem-pass/index.ts`):**
   - Authenticated Marshall route (`/ops/scan` or `ops` view toggle) that pre-fetches the Saturday `Vale · Shackleton` manifest over hall Wi-Fi into `IndexedDB`: `{ pass_uuid, pickup_code, student_display_name, item_packing_list, expected_qr_sha256, salted_pin_hash, salted_proxy_pin_hash, collection_status }`.
   - Stores **`expected_qr_sha256 = SHA-256(qr_token)`** (never exposing `PICKUP_PASS_HMAC_SECRET` to the browser!) so when a student presents `sb1.<pass_uuid>.<nonce>.<sig>` offline at Shackleton with zero mobile signal, WebCrypto computes `SHA-256(rawScan)` in `<5ms`, blocks double-scan replays immediately in `IndexedDB`, displays the exact sub-units & FIR Lot numbers to hand over, and queues `{ scan_id, pass_uuid, scanned_at }` for background sync when Wi-Fi returns.
3. **Booker Aston (`B6 5RQ`) Purchase Order CSV Export & Printable Pick-Sheet (`src/components/ops/WholesaleManifestSection.tsx`):**
   - Add **Download Booker Aston PO (`.csv`)** (locked `100%` cases only, Booker SKU code, case count, case weight kg, ex-VAT cost, VAT rate, inc-VAT cash-and-carry checkout total, and blank `lot_code_picked` column for Thursday `06:30` depot traceability) + printable Saturday student bag-packing sheet.

**Verification Gate (End of Hour 19):**
- Offline scanner test passes in Chrome DevTools `Network: Offline` mode: valid `sb1.*` QR verifies in `<20ms`, forged signature fails with `SIGNATURE_MISMATCH`, scanning the same QR twice fails with `ALREADY_COLLECTED`, and toggling back online flushes the queued check-in idempotently.

#### Copy-Paste `/swarm` Prompt — Sprint Block 4
```text
/swarm Execute Sprint Block 4 (Hours 15–19) from docs/ACTION_PLAN_24H.md and docs/architecture/fullstack-blueprint.md.

Spawn parallel full-tool workers on disjoint slices plus a verifier:
1. `hmac-pass-backend` (owns `supabase/functions/_shared/hmacPass.ts`, `supabase/functions/marshall-manifest/index.ts`, `supabase/functions/redeem-pass/index.ts`, `supabase/functions/rotate-proxy-pass/index.ts`):
   - Implement `sb1.<pass_uuid>.<nonce>.<sig>` HMAC-SHA256 signing using `PICKUP_PASS_HMAC_SECRET`, `marshall-manifest` returning `expected_qr_sha256` + salted PIN digests (never leaking the HMAC secret to client devices), and idempotent `redeem-pass` sync.
2. `offline-scanner-pwa` (owns `src/lib/offlineManifestStore.ts`, `src/components/ops/LiveScannerPwaView.tsx`, `src/components/ops/HubMarshallScannerCard.tsx`, `public/manifest.webmanifest`):
   - Build `IndexedDB` manifest cache + offline check-in outbox, WebCrypto `SHA-256` constant-time offline QR & 4-digit PIN / Proxy PIN verification, camera `BarcodeDetector` scan trigger, instant double-scan replay lock, and automatic reconnect sync.
3. `booker-po-export` (owns `src/components/ops/WholesaleManifestSection.tsx`, `src/components/orders/PickupPassCard.tsx`):
   - Add 1-click Booker Aston (`B6 5RQ`) locked-case PO `.csv` download (with ex-VAT / `0%` vs `20%` VAT cash-and-carry totals and FIR Lot code column) plus printable Saturday Shackleton packing sheet.
4. `block4-verifier` (tests forged `sb1.*` tokens, offline `IndexedDB` double-scan replay rejection, CSV math accuracy, and runs `npm run verify`).
```

---

### Sprint Block 5 (Hours 20–24): Concurrency/Race-Condition Tests, Live Cloud Deployment & Post-24h Handoff

**Objectives & File Deliverables:**
1. **Automated Full-Stack & Concurrency Test Suite (`tests/allocation_concurrency.test.mjs`, `tests/stripe_settlement_math.test.mjs`, `tests/hmac_pass_offline_sync.test.mjs`, `.github/workflows/ci.yml`):**
   - Simulate **25 concurrent student checkouts** racing on `oatly-barista` starting at `3/4`: prove zero duplicate `(pool_id, global_slot_index)` assignments, exact chronological case spill (`Box #1` through `Box #7`), and gap-free recovery when an unconfirmed 10-minute `soft_reserved` checkout expires.
   - Test every pence-boundary in Thursday `09:00` settlement (`£8.99` + `£0.39` fee vs `£9.00` + `£0.00` fee, mixed full/overflow partial capture, `0`-fulfilled full cancellation at `£0.00` fee, and Booker depot stock-shortage override).
   - Add `.github/workflows/ci.yml` running `npm run verify` automatically on every GitHub push/PR (free via GitHub Student Pack).
2. **Production Cloud Cutover & End-to-End Rehearsal:**
   - Run `npx supabase db push` and `npx supabase functions deploy` to the London (`eu-west-2`) Supabase project, set production secrets, connect the Stripe webhook endpoint, and deploy `main` to Cloudflare Pages.
   - Execute a complete 10-minute **Sunday-to-Saturday Dress Rehearsal** in Stripe Test Mode from a `375px` smartphone (`@student.bham.ac.uk` Magic Link → `3/4 + 2` slice pre-auth hold → Wednesday cutoff → Booker CSV export → Thursday `09:00` partial capture → offline airplane-mode QR check-in).

**Verification Gate (End of Hour 24):**
- All unit, concurrency, settlement, HMAC, and offline Demo Mode tests pass (`0` failures); GitHub Actions CI is green; both Live Mode (`splitboxuob.me`) and Demo Mode (`demo.splitboxuob.me` / local `npm run dev`) run cleanly.

#### Copy-Paste `/swarm` Prompt — Sprint Block 5
```text
/swarm Execute Sprint Block 5 (Hours 20–24) from docs/ACTION_PLAN_24H.md and docs/architecture/fullstack-blueprint.md.

Spawn parallel full-tool workers on disjoint slices plus a final release verifier:
1. `concurrency-and-math-tests` (owns `tests/allocation_concurrency.test.mjs`, `tests/stripe_settlement_math.test.mjs`, `tests/hmac_pass_offline_sync.test.mjs`, `scripts/run-tests.mjs`):
   - Write comprehensive tests covering 25-client concurrent cross-box slot contention, 10-minute `soft_reserved` hold expiration, `£9.00` / `£0.39` micro-crate fee & partial-capture pence math, Booker stock-shortage overrides, HMAC `sb1.*` forgery rejection, and offline `IndexedDB` replay prevention.
2. `ci-and-deploy-config` (owns `.github/workflows/ci.yml`, `public/_redirects`, `.env.example`, `supabase/README.md`):
   - Add GitHub Actions CI running `npm run verify` on every PR, Cloudflare Pages SPA `_redirects`, complete `.env.example`, and a 10-command deployment & rollback runbook in `supabase/README.md`.
3. `release-qa-verifier` (runs full `npm run verify`, audits security/RLS/secret boundaries, verifies zero hardcoded secrets or forbidden CDNs, and confirms `375px` mobile readiness).
```

---

## 4. Parallel Real-World UoB Launch Checklist (Post-24h Physical Steps Before Drop #1)

Your software will be live after Hour 24, but running a legal, safe, profitable UK student food drop at UoB requires completing these **6 non-code steps** before opening Drop #1 on a Sunday evening. Full regulatory details live in [docs/business/uob-launch-and-pitch.md](./business/uob-launch-and-pitch.md).

- [ ] **T-28 Days — Free Birmingham City Council Food Business Registration (`£0.00` · Mandatory Legal Gate)**
  - Submit your **Food Business Operator (FBO)** registration at `https://www.gov.uk/food-business-registration` selecting **Birmingham City Council** at least **28 days before Drop #1**.
  - Even though SplitBox distributes 100% factory-sealed ambient groceries with zero cooking or cold storage, assimilated Regulation (EC) 852/2004 legally requires registration for any regular food distribution/retail operation. State clearly on the form: *"Online pre-ordered ambient, factory-sealed grocery case-splitting with weekly 2-hour collection point; zero unpackaged handling or chilled/frozen goods."*

- [ ] **T-21 Days — UoB Elevate Incubator, Insurance & `Vale · Shackleton` Table Sign-Off (`£0` Equity-Free Grant)**
  - Book a free startup advising session with **UoB Elevate / B-Enterprising** (student enterprise hub at **The Exchange, 3 Centenary Square** & campus careers centre) to apply for **`£500–£2,500` in equity-free student enterprise funding** (covers **`£5M` Public & Product Liability insurance** at ~`£65–£95/yr`, folding trestle table, and collapsible crates).
  - Present SplitBox's **Estates Compliance Strip** guarantees (100% ambient sealed goods, zero hall-reception parcel handling, 2-hour Saturday window, zero leftover clutter) to Vale Village Accommodation / Guild Student Groups to approve the Saturday `Vale · Shackleton` concourse table. *(Zero-delay backup if Estates takes >2 weeks: host Drop #1 from your own or a flatmate's private Selly Oak front forecourt off Bristol Rd / Dawlish Rd.)*

- [ ] **T-14 Days — Booker Wholesale Aston (`B6 5RQ`) Trade Card & Physical UK FIR 14-Allergen Inner-Pack Check**
  - Open a free trade account at **Booker Wholesale Aston (`85–87 Aston Cross Industrial Estate, Rocky Lane, Birmingham B6 5RQ`)** using your sole-trader UTR / HMRC confirmation and Food Business Registration receipt.
  - **Physically open/inspect every Drop #1 candidate SKU in-depot before listing it:** Under the **UK Food Information Regulations 2014 (FIR)**, every individual **Slice sub-unit** handed to a student MUST carry its own factory-printed English ingredients list, **bolded 14 Annex II allergens**, net quantity, Best Before date, Lot code, and UK FBO address. **Reject** any catering multipack printed *"Not for individual resale"* where allergen declarations appear only on the outer wholesale shrink-wrap/carton.
  - Start with **6–8 high-velocity `0%`-VAT ambient staples** (e.g., Oatly Barista `12×1L` split into `4 × 3L` slices, Mutti/Heinz tinned multipacks, Laila/Tilda `2kg` sealed rice bags, Indomie `5-pack` bundles, rolled oats, TRS sealed spice trios). Consider **voluntary UK VAT registration** once recurring drops start — because `0%`-rated food charges `0%` output VAT while letting you reclaim `20%` input VAT on zip-van hire, crates, and packaging.

- [ ] **T-7 Days — Dated Local Convenience & Supermarket Receipt Audit (ASA / CAP Code Rule 3.33 & DMCCA 2024)**
  - Visit **Sainsbury's Local (`584 Bristol Rd, Selly Oak, B29 6BE`)** and **Tesco Express (`526 Bristol Rd, Selly Oak, B29 6BD`)** (and **Aldi Selly Oak, `560 Bristol Rd, B29 6AE`** for discount comparisons).
  - Photograph shelf-edge price labels showing exact product weight/volume and keep dated paper/digital receipts in a local `compliance-audit/` folder before displaying any `"Save X% vs Sainsbury's Local B29 (Checked [Date])"` badge. Never display fictional store names or strike-through delivery fees SplitBox has never charged.

- [ ] **T-5 Days — Statutory ICO Data Protection Registration (`£40/year` or `£35/yr` Direct Debit)**
  - Register online at `https://ico.org.uk/for-organisations/data-protection-fee/` (`Tier 1 micro-organisation`, 10 mins). Required under the Data Protection (Charges and Information) Regulations 2018 before storing real `@student.bham.ac.uk` student emails and order records. Keep hall activity tickers strictly anonymised to hub level (`"A student at Vale · Shackleton locked Slice 3/4"` — never publish flat or room numbers).

- [ ] **T-2 Days — 1-Flatmate End-to-End Dry Run (`Vale · Shackleton`, 45 mins)**
  - Rehearse the exact physical Thursday-to-Saturday sequence with 1 mate: export the Booker Aston `.csv` PO, label 10 test bags by `UOB-BOX-XXXX` code, switch your phone to **Airplane Mode** outside Shackleton, and time 10 offline `/ops/scan` QR + 4-digit PIN handovers (target: **`<20 seconds` per student**).

---

## 5. How to Work With Free AI Tools After Hour 24

Once your 24-hour Antigravity swarm access ends, this repository is pre-wired so **free, smaller-context AI tools** never get confused, hallucinate USD `$` prices, or break offline Demo Mode:

### Automatic Context Entrypoints Already Wired in Repo Root
1. **GitHub Copilot Pro in VS Code (`£0/mo` via `@student.bham.ac.uk` Student Pack):** Automatically loads [.github/copilot-instructions.md](../.github/copilot-instructions.md) on every chat message and inline edit.
2. **Cursor (Free Tier) & OpenAI Codex:** Automatically load [AGENTS.md](../AGENTS.md) at session start.
3. **Claude Code / Claude Projects:** Automatically loads [CLAUDE.md](../CLAUDE.md), which routes straight to [AGENTS.md](../AGENTS.md) and `docs/`.

### The "1 Spec Doc + 1 Source File" Rule for Free Web AI Chats (Claude / ChatGPT / Gemini Free Tiers)
Free web chat tiers have tighter context windows and no automatic repo indexing. Instead of pasting 15 files, attach **only the 1 matching `docs/` file + the 1–2 source files you are changing**:

| Weekly Founder Task | 1 Doc File to Attach | 1–2 Code Files to Attach |
| :--- | :--- | :--- |
| Add/swap a Booker SKU, update dated receipt benchmarks, or adjust `£9.00` / `£0.39` crate fees | [docs/product/mvp-spec.md](./product/mvp-spec.md) | `src/data/catalog.ts` (+ `supabase/seed.sql`) |
| Debug a Postgres `SELECT ... FOR UPDATE` query, Stripe webhook, or Thursday `09:00` settlement edge case | [docs/architecture/fullstack-blueprint.md](./architecture/fullstack-blueprint.md) | Target file in `supabase/migrations/` or `supabase/functions/` |
| Tweak a card badge, `<SliceMeter />` state, or `375px` mobile drawer layout | [docs/design/brand-and-ui.md](./design/brand-and-ui.md) | Target `.tsx` file in `src/components/` + `src/index.css` |
| Prepare a UoB Elevate grant pitch, Estates table request, or VAT/FIR compliance check | [docs/business/uob-launch-and-pitch.md](./business/uob-launch-and-pitch.md) | None needed (`demo.splitboxuob.me` runs live!) |

### 4 Habits That Keep Solo Student Maintenance Effortless
1. **Always run `npm run verify` before `git push`:** Catches any accidental floating-point currency bug, broken TypeScript type, stray `$` symbol, or forbidden font/image CDN link in `<15 seconds`.
2. **Never delete `LocalDemoRepository`:** Keeping `VITE_DEMO_MODE=true` working means you can demo SplitBox on projector Wi-Fi at UoB Guild or Elevate without touching live student orders.
3. **Keep all money in integer pence (`INTEGER` in SQL, `toPence`/`fromPence` in TS):** Never store `DECIMAL` pounds in Stripe/settlement math where `1/3` VAT or partial captures could drift by `£0.01`.
4. **Promote a 2nd Hub Only When `Vale · Shackleton` Hits `≥80%` Box Lock Rate + `≥100` Weekly Votes:** Check `SELECT hub_id, count(*) FROM hub_votes GROUP BY 1;` in Supabase Studio on Thursdays before flipping `selly-oak-bristol` from `coming_soon` to `active`.
