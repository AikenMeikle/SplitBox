# SplitBox — Full-Stack UoB MVP Product & Acceptance Specification

> **Related Docs:** [24-Hour Sprint Action Plan](../ACTION_PLAN_24H.md) · [Full-Stack Technical Blueprint](../architecture/fullstack-blueprint.md) · [Brand & UI System](../design/brand-and-ui.md) · [UoB Launch, Compliance & Pitch Guide](../business/uob-launch-and-pitch.md) · [Master Agent Directives](../../AGENTS.md)

---

## 1. Problem, User & Value Proposition

University of Birmingham (**UoB**) students living in halls (*The Vale Village*, *Pritchatts Park*, *Jarratt Hall*) or *Selly Oak* shared houses pay steep single-unit convenience markups for everyday groceries and household essentials. Buying wholesale alone is blocked by trade-card requirements, upfront bulk case outlays, cramped shared-kitchen storage, lack of a car, and awkward group-chat bill chasing.

**SplitBox** lets verified UoB students claim pre-packaged, factory-sealed **Slices** (sub-units) of wholesale **Boxes** (cases) in **GBP (`£`)**, pooling **anonymously with fellow students collecting at the same campus hub**—unlocking bulk unit economics with dorm-sized portions and zero inventory or flake risk.

---

## 2. Dual-Mode Execution Architecture

SplitBox runs from a single React 19 + TypeScript codebase supporting two clean runtime modes via the `DropRepository` adapter ([`docs/architecture/fullstack-blueprint.md`](../architecture/fullstack-blueprint.md)):

| Capability | Live Production Mode (`VITE_DEMO_MODE=false` + `.env`) | Offline Demo Mode (`VITE_DEMO_MODE=true` or no `.env` keys) |
| :--- | :--- | :--- |
| **Authentication** | Passwordless Magic Link / OTP restricted to `@student.bham.ac.uk` & `@bham.ac.uk` (Supabase Auth) + verified UK mobile number | Zero-login instant boot into a mocked UoB student session |
| **Pool Ledger & Locking** | Supabase Postgres ACID `claim_sequential_slices` RPC (`SELECT ... FOR UPDATE` row lock + 10m `soft_reserved` checkout lease + Realtime `<SliceMeter />`) | Deterministic client-side state persisted to `localStorage` (`splitbox_uob_drop_v1`) across independent per-hub ledgers |
| **Payments & Cutoff** | Stripe `PaymentIntents` (`capture_method: 'manual'`) pre-authorisation holds; automated Thursday `09:00` one-shot `capture()` / `cancel()` | Simulated GBP pre-authorisation holds + top-docked **Demo Controls** (`Simulate Strangers`, `Trigger Cutoff`, `Reset`) |
| **Pickup Pass & Ops** | Per-student HMAC-SHA256 signed QR token (`sb1.<pass_uuid>.<nonce>.<sig>`) + CSPRNG PIN + `/ops/scan` offline `IndexedDB` Hub Marshall scanner PWA | Offline `<QRCodeSVG />` pass + 4-digit check-in/proxy PIN + interactive in-app **Hub Ops** scanner & Booker PO manifest |
| **External Network Rules** | **Permitted:** `*.supabase.co`, `js.stripe.com`, `api.stripe.com`, Resend (server-side). **Forbidden:** External font, stock-image, or QR CDNs | **100% Offline:** `0` external `http(s)://` requests at load or runtime; works on stage with Wi-Fi disabled |

> **Shared Bundled Asset Rule:** Both modes bundle `@fontsource/space-grotesk`, `@fontsource/plus-jakarta-sans`, `@fontsource/jetbrains-mono`, local brand SVGs (`public/assets/splitbox-*.svg`), and local `qrcode.react` (`<QRCodeSVG />`).

---

## 3. Weekly Drop Lifecycle & Sequential Allocation

### 3.1 Weekly 72–96h Drop Cadence (7-Day Card Hold Safe)
Standard Visa/Mastercard online Customer-Initiated (`CIT`) manual-capture holds expire after **7 calendar days**. SplitBox bounds every weekly cycle inside a **~3.6-day maximum hold window**:

1. **Sunday `18:00` (`Europe/London`) — Drop Opens:** Active UoB hub pools open for slice claims.
2. **Sunday `18:00` – Wednesday `23:59` — Editable Weekly Crate:** Students claim slices, view live `<SliceMeter />` progress, and place (or update) a **Card Pre-Authorisation Hold**.
3. **Wednesday `23:59` — Drop Cutoff:** Storefront locks new claims for the current Drop and clears un-submitted basket drafts.
4. **Thursday `06:30–08:30` — Wholesale Pick Confirmation:** Founder picks `100%` locked cases at **Booker Wholesale Aston Cross (`B6 5RQ`)** (and verified ambient trade/surplus suppliers), verifying physical depot availability before capturing a single penny.
5. **Thursday `09:00` — Atomic Partial/Full Capture & Release:**
   - Slices in **`100%` filled boxes** settle as `FULFILLED` and are captured via `stripe.paymentIntents.capture(pi_id, { amount_to_capture })`.
   - Slices in **`<100%` partial overflow boxes** (or stocked-out SKUs) settle as `AUTO_REFUNDED`—released uncaptured via partial capture or `paymentIntents.cancel(pi_id)` at **`£0.00` Stripe fee**, without cancelling fulfilled slices in the same order.
6. **Saturday Hub Window (`11:00–14:00` at `Vale · Shackleton`) — Pop-Up Collection:** Students scan their QR Pickup Pass (or delegate via Flatmate Proxy PIN) and collect sealed sub-units from reusable folding crates.

### 3.2 Sequential First-Come-First-Served (FCFS) Case-Boundary Math
Every `(dropId, hubId, productId)` pool allocates slots chronologically across `Box #1`, `Box #2`, …:
- `boxNumber = Math.floor(zeroBasedSlotIndex / totalSlicesPerBox) + 1`
- `slotInBox = (zeroBasedSlotIndex % totalSlicesPerBox) + 1`
- **Canonical Boundary Rule (`3/4 + 2`):** If a 4-slice box has `3/4` slices claimed and a student checks out `2` slices:
  - **Slice 1 → `Box #1` (`4/4` — Box Locked!)**
  - **Slice 2 → `Box #2` (`1/4` — Opens New Box Pool)**
- Catalog cards always display the **currently open Box's progress** (`1/4 slices claimed`) on the radial `<SliceMeter />`, paired with a locked-box counter badge (`✓ 1 BOX LOCKED`) whenever `≥ 1` full boxes have locked.

---

## 4. UoB Drop #1 Business, Margin & Legal Invariants

### 4.1 Single Active Launch Hub + Multi-Hub Expansion Schema
- **Active Drop #1 Hub (`status: 'active'`):** **`Vale · Shackleton`** (`vale-shackleton`, Shackleton Forecourt `B15 3SZ`, `Sat 11:00–14:00`) launches first with **`£0` hired staff cost** (run by the founder + 1 flatmate).
- **Expansion Hubs (`status: 'active' | 'coming_soon'`):** `CampusHub` ([`src/types.ts`](../../src/types.ts)) supports **`Selly Oak · Bristol Rd`** (`B29 6BQ`), **`Pritchatts Park`** (`B15 2SA`), and **`Guild · Mermaid Sq`** (`B15 2TU`). In Live Drop #1, `'coming_soon'` hubs collect `"Vote Next Hub"` `@student.bham.ac.uk` demand signals; in Offline Demo Mode, hubs expose independent per-hub pool ledgers for pitching multi-hub isolation.

### 4.2 Crate Fee Threshold (`£9.00`) & Editable Single Weekly Pledge
- **`£0.00` Crate Fee on Baskets `≥ £9.00` (`900` pence):** Preserves headline zero-fee wholesale value on normal 2–3 slice crates (where Stripe UK's `1.5% + 20p` drops to `~3.2%` of GMV / `<15%` of gross margin).
- **Transparent `£0.39` (`39` pence) Small-Crate Card-Cover Fee Below `£9.00`:** Protects wholesale unit economics on tiny 1-slice checkouts against fixed `20p` card processing charges. *(Fairness invariant: if cutoff partial-box releases reduce an originally `≥ £9.00` order below `£9.00`, no retroactive `£0.39` fee is ever added.)*
- **1 Editable Weekly Order Per Student:** Prior to Wednesday `23:59`, adding or removing slices updates the student's single active weekly pledge/hold rather than creating multiple fragmented orders with duplicate `20p` capture fees.

### 4.3 Compliant Ambient Catalog, UK FIR Sub-Packs & Explicit VAT (`vatRate: 0 | 0.20`)
- **10–15 Sealed Ambient Multi-Pack SKUs ([`src/data/catalog.ts`](../../src/data/catalog.ts)):** Prioritize **`0%` zero-rated** shelf-stable food & drink staples for Drop #1, alongside `CatalogItem` schema support for **`vatRate: 0 | 0.20`** (or `vatRatePercent: 0 | 20`) so ex-VAT wholesale costs vs inc-VAT student slice prices compute exact post-VAT net margins on standard-rated household/confectionery/RTD items.
- **Mandatory UK FIR & GB CLP Inner-Pack Compliance:**
  - Every food/drink sub-unit (`1 Slice`) handed to a student must be factory-sealed and individually labelled under **UK Food Information Regulations 2014 (FIR)**: English legal name, ingredients with **14 Annex II allergens emphasised in bold**, net metric quantity, Best Before date, batch/lot prefix, and physical UK FBO address. Unlabelled catering inner-packs (*"Not for individual resale"*) are strictly blocked.
  - Household chemical sub-units must retain factory **GB CLP** child-resistant closures, tactile hazard triangles, and UFI warnings.
- **Excluded Inventory:** Zero chilled/refrigerated/frozen cold-chain items, zero prepared meals, zero fragile loose fresh produce in Drop #1, and zero loose bulk goods requiring weighing or decanting.
- **Substantiated Retail Benchmarks & Anonymised Social Proof:** Savings badges (`SAVE X%`) and receipt rows must cite **dated, verifiable local prices** (e.g., *Sainsbury's Local `B29 6BE`*, *Tesco Express `B29 6BD`*, or *Aldi Selly Oak `B29 6AE`* price-floor checks) with metric unit prices (`£1.40/L`, `£0.95/L`) and zero fictitious struck-through delivery fees. Live campus activity tickers must anonymise to hub/village level (`"Student at Vale Hub"`—never flat or kitchen numbers).

### 4.4 Payment Hold Terminology, Guarded Passes & CCR 2013 Uncollected Rules
1. **Never Claim Unregulated "Escrow":** All production UI, checkout buttons, receipts, and T&Cs must say **"Card Pre-Authorisation Hold (£0.00 Captured Until Box Locks)"** (avoiding regulated escrow/payment-institution characterisation under UK FCA PSR 2017 / EMR 2011).
2. **Suppress Empty Pickup Passes (`fulfilledSliceCount === 0`):** If 100% of a student's ordered slices remain in `<100%` boxes at cutoff, release the entire pre-auth hold (`£0.00` captured), display a clear release confirmation, and **do not** render a Saturday QR Pickup Pass for `0` slices.
3. **Flatmate Delegation & CCR 2013 Restocking Policy:**
   - Every active Pickup Pass exposes a **"Delegate Pass to a Flatmate"** option (proxy PIN / link) plus automated `T-24h`, `T-2h`, and `T-30m` collection reminders.
   - Under **UK Consumer Contracts Regulations 2013 (Reg 28)** and **Consumer Rights Act 2015 (s.62)**, unopened non-perishable ambient groceries and household goods are *not* confiscated 100% after a 30-minute window. Uncollected ambient orders roll over to the next Drop or refund minus a transparent, pre-agreed **`£2.00` restocking/handling fee** (Guild Community Pantry donation applies only where explicitly opted in by the student or on perishable goods).

---

## 5. Core Acceptance Gates

| Gate ID | Acceptance Criterion | Verification Requirement (Demo & Live Modes) |
| :--- | :--- | :--- |
| **`gate-1-build`** | **Zero-Error TypeScript & Vite Production Build** | `npx tsc -b && npm run build` exits `0` with zero TypeScript, CSS, or bundler warnings/errors. |
| **`gate-2-offline-gbp`** | **Zero Forbidden CDNs & Pence-Exact GBP (`£`) Math** | Zero external font/image/QR CDNs (`0` external `http(s)` calls in Demo Mode; only Supabase/Stripe/Resend in Live Mode). All prices, `£9.00` threshold / `£0.39` small-crate fee, VAT margins, and hold releases compute in integer GBP pence (`toPence`/`fromPence`) with `£` formatting and zero `$` leaks. |
| **`gate-3-allocation`** | **Sequential `3/4 + 2` Cross-Box Allocation & Cutoff** | Ordering `2` slices on a `3/4` pool assigns Slice 1 → `Box #1` (`4/4` Locked) and Slice 2 → `Box #2` (`1/4` Pooling), persisted across reloads (`localStorage` in Demo Mode; concurrency-safe `SELECT ... FOR UPDATE` RPC under simultaneous checkouts in Live Mode). Triggering cutoff marks `Box #1` `FULFILLED` and `Box #2` `AUTO_REFUNDED` while keeping `Box #1` intact. |
| **`gate-4-pickup-pass`** | **Guarded QR + PIN Pass, Net `£` Receipt & Scanner** | Post-cutoff Orders view displays fulfilled vs released slices, net `£` captured total, and Flatmate Delegation. Renders `<QRCodeSVG />` + PIN pass **iff** `fulfilledSliceCount > 0` (HMAC-signed one-time check-in via `/ops/scan` in Live Mode; instant `Reset` restores clean seed state in Demo Mode). |
| **`gate-5-mobile-375`** | **`375px` Single-Column Zero-Overflow Mobile Layout** | At `375px × 812px` viewport, catalog cards stack in a single `1fr` column with `document.documentElement.scrollWidth <= 375` and an unobstructed sticky bottom crate bar. |
