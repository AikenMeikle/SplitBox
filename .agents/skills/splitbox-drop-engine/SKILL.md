---
name: splitbox-drop-engine
description: >-
  Deterministic SplitBox state machine, sequential first-come-first-served
  case-boundary slice allocation, GBP pence-accurate escrow/auto-refund cutoff
  math, QR pickup pass generation, and compliant UK campus catalog schema. MUST
  read before implementing src/types.ts, src/data/, src/store/, checkout, or
  Demo Controls logic.
---

# SplitBox Drop Engine & Sequential Allocation Skill

Use this skill whenever designing or touching `src/types.ts`, `src/data/`, `src/store/`, basket previews, escrow checkout, or the Demo Controls bar (`Simulate Strangers`, `Trigger Cutoff`, `Reset`).

## 1. Drop-In Pure Allocation & Cutoff Helpers

Copy or adapt [resources/allocation.ts](./resources/allocation.ts) directly into `src/store/` or `src/utils/allocation.ts` so there are zero edge-case bugs under the 1-hour deadline:

- **Integer Pence Math (`formatGBP(pence)`):** Store all prices in integer pence (`slicePricePence`, `retailPricePence`) to eliminate floating-point drift on multi-slice refunds and savings totals.
- **Chronological Sequential Allocation (`allocateSlicesChronologically`):**
  - Every item maintains an ordered ledger of claimed slices (`owner: 'stranger' | 'student'`, `orderId?`, `sliceIndex`, `boxNumber`).
  - `boxNumber = Math.floor(globalZeroBasedSliceIndex / slicesPerBox) + 1`
  - `slotInBox = (globalZeroBasedSliceIndex % slicesPerBox) + 1`
  - **Acceptance Test (`brief.md` §3.2):** If `slicesPerBox = 4` and `3` stranger slices exist (`3/4`), ordering `2` slices assigns:
    - Slice 1 → `Box #1` (`4/4` — **Box Locked!**)
    - Slice 2 → `Box #2` (`1/4` — **Pooling / Waiting for 3 Strangers**)
- **Basket Cross-Box Preview (`previewBasketAllocation`):** Lets the Basket Drawer show the student *before* checkout exactly which slices immediately lock a box vs. which open a new overflow box (`£0.00` platform/delivery fees).
- **Cutoff Resolution (`resolveDropCutoff`):**
  - At cutoff, a box `b` is **Filled (`100%`)** iff total slices in `b === slicesPerBox`.
  - Every student slice in a `100%` box transitions to `'FULFILLED'`.
  - Every student slice in a `<100%` partial overflow box transitions to `'AUTO_REFUNDED'`—its `slicePricePence` is subtracted from the final charged total while all `'FULFILLED'` slices in the same order remain active!
  - Generates a deterministic Pickup Pass (`pickupCode`: e.g. `BOX-409`, `pin`: 4-digit PIN e.g. `4829`, plus JSON/text QR payload rendered locally via `qrcode.react`'s `<QRCodeSVG />`) and displays the forfeiture grace-window rule.

## 2. UK Student Starter Catalog Rules (`brief.md` §3.1 & §4)

1. **10–15 Items Strictly Within Allowed Categories:**
   - Categories: `Pantry & Snacks`, `Drinks`, `Ambient Produce`, `Household Essentials`.
   - **Strictly Excluded:** No chilled/refrigerated dairy/meat, no frozen items, no hot/prepared meals, and no loose bulk items requiring weighing/scooping. Use **shelf-stable** sealed sub-units only (e.g., Barista Oat Milk ambient cartons, tinned chopped tomatoes 6-pack, nakd/protein bar multipacks, basmati rice 2kg sealed bags, easy-peeler clementines net, 9-roll bamboo loo roll sub-packs, dishwasher/laundry pods tub).
2. **Seeded Initial Pool States for 1-Click Reviewer Testing:**
   - Pre-seed items at varied fill ratios so filters and boundary tests work out of the box:
     - At least 2–3 items at `N-1 / N` (e.g., **`3/4`**, **`5/6`**, **`7/8`**) so *"Almost Full (1–2 Slices Left)"* filter and the **`3/4 + 2 slices` boundary test** work immediately on page load!
     - At least 1 item already having `1` locked box + open `Box #2` (e.g., `6` claimed on a `4`-slice box → `Box #1` locked, `Box #2` at `2/4`).
3. **UK Campus Pickup Hubs (3–4 Realistic Hubs):**
   - E.g., *North Quad Student Union (Sat 12:00–15:00)*, *Fallowfield Oak House Reception (Sat 13:00–16:00)*, *Victoria Park Halls Courtyard (Sat 11:00–14:00)*.
4. **`localStorage` Versioning & Reset:**
   - Namespace key (e.g., `splitbox_prototype_v1`) and wire **Reset Prototype** in Demo Controls to clear `localStorage` and restore initial seeded state cleanly.
