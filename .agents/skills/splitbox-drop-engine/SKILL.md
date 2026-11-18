---
name: splitbox-drop-engine
description: >-
  Deterministic SplitBox state machine, sequential first-come-first-served
  case-boundary slice allocation, GBP pence-accurate pre-auth hold/cutoff
  settlement math, QR pickup pass generation, and compliant UoB campus catalog
  schema. MUST read before implementing src/types.ts, src/data/, src/store/,
  checkout, Supabase RPCs, or Demo Controls logic.
---

# SplitBox Drop Engine & Sequential Allocation Skill

Use this skill whenever designing or touching `src/types.ts`, `src/data/`, `src/store/`, `DropRepository` adapters, basket previews, Stripe manual-capture pre-auth checkout, or the Demo Controls bar (`Simulate Strangers`, `Trigger Cutoff`, `Reset`). Authoritative specs: [docs/product/mvp-spec.md](../../../docs/product/mvp-spec.md) and [docs/architecture/fullstack-blueprint.md](../../../docs/architecture/fullstack-blueprint.md).

## 1. Pure Allocation & Cutoff Settlement Invariants

Reference [resources/allocation.ts](./resources/allocation.ts) and `src/store/dropEngine.ts` to preserve zero-drift allocation across both Demo Mode (`localStorage`) and Live Mode (Supabase Postgres `SELECT ... FOR UPDATE`):

- **Integer Pence Math (`formatGBP(pence)`):** Store all prices, convenience-retail benchmarks, crate fees, holds, and refunds in integer GBP pence (`slicePricePence`, `retailPricePence`, `vatRate: 0 | 0.20`) to prevent floating-point drift.
- **Chronological Sequential Allocation (`allocateSlicesChronologically`):**
  - Every hub-product pool maintains a strictly ordered ledger of claimed slices across `Box #1`, `Box #2`, …:
    - `boxNumber = Math.floor(globalZeroBasedSliceIndex / slicesPerBox) + 1`
    - `slotInBox = (globalZeroBasedSliceIndex % slicesPerBox) + 1`
  - **Acceptance Gate ([docs/product/mvp-spec.md](../../../docs/product/mvp-spec.md)):** If `slicesPerBox = 4` and `3` slices are claimed (`3/4`), ordering `2` slices assigns:
    - Slice 1 → `Box #1` (`4/4` — **Box Locked!**)
    - Slice 2 → `Box #2` (`1/4` — **Pooling / Waiting for 3 Strangers**)
- **Crate Fee & Pre-Auth Hold Rules:**
  - `£0.00` fee on crates `≥ £9.00` (`900` pence); transparent `£0.39` (`39` pence) small-crate card-cover fee below `£9.00`; 1 editable weekly order per student prior to Wednesday `23:59` cutoff.
  - Always label payment holds as **`"Card Pre-Authorisation Hold (£0.00 Captured Until Box Locks)"`** (Stripe `capture_method: 'manual'`), never `"escrow"` in live production UI.
- **Cutoff Settlement (`resolveDropCutoff`):**
  - Every slice in a `100%` filled box transitions to `'FULFILLED'` (captured).
  - Every slice in a `<100%` partial overflow box transitions to `'AUTO_REFUNDED'` (released uncaptured for `£0.00` while preserving fulfilled slices in the same order).
  - Generates a Pickup Pass (`UOB-BOX-XXX`, 4-digit PIN, and HMAC-signed payload in Live Mode rendered locally via `qrcode.react` `<QRCodeSVG />`) **only** when `fulfilledSliceCount > 0`.

## 2. UoB Campus Catalog & Hub Rules ([docs/product/mvp-spec.md](../../../docs/product/mvp-spec.md))

1. **Compliant Sealed Ambient Items Only:**
   - Seed 10–15 factory-sealed, individually **UK FIR 14-allergen labelled** sub-units of ambient groceries, drinks, and household essentials (`0%`-VAT essentials prioritized, with explicit `vatRate: 0 | 0.20`).
   - **Strictly Excluded:** No chilled/refrigerated dairy/meat, no frozen goods, no prepared meals, and no loose bulk goods requiring weighing/decanting.
2. **UoB Campus Hubs & Launch Defaults:**
   - Default Drop #1 active launch hub: **`Vale · Shackleton`** (`status: 'active'`), with additional UoB hubs (`Guild · Mermaid Sq`, `Selly Oak · Bristol Rd`, `Pritchatts Park`) supported per-hub in Demo Mode and configurable as `'coming_soon'` demand votes in Live Mode.
3. **Dual-Mode Persistence & Reset:**
   - Demo Mode persists defensively under `localStorage` (`splitbox_uob_drop_v1`) with 1-click **Reset Prototype**; Live Mode delegates atomically to Supabase Postgres RPCs (`claim_sequential_slices`).
