# SplitBox — Project Brief

## 1. Problem and the User
UK university students living in halls or shared flats pay steep single-unit supermarket prices for groceries and household essentials, yet cannot buy wholesale due to membership fees, high upfront case costs, cramped storage, lack of a car, and awkward friend-group bill splitting. **SplitBox** lets students buy pre-packaged shares of factory multi-pack wholesale cases at wholesale-beating **GBP (`£`)** prices by pooling **anonymously with strangers at the same campus hub**—no car, bulk storage, or friend coordination required.

## 2. Core Workflow
SplitBox runs on a **weekly campus "Drop" cycle** (e.g., Wednesday cutoff for a Saturday campus hub collection) and opens directly as a mocked logged-in student using generic **Case / Share** terminology:
1. **Select Hub & Browse Drop:** Student picks a campus/halls pickup hub (each hub maintains **independent pool counts**; switching hubs switches to that hub's pools and basket) and browses factory-sealed sub-units of shelf-stable groceries and household essentials showing **Bulk Share Price (`£`) vs. Supermarket Price (`£`)** (`£0.00` fees, margin baked in) and live open-case progress (e.g., `3/4 shares claimed`).
2. **Add to Basket & Sequential Allocation:** Student adds shares to a multi-item basket drawer and checks out. Checking out allocates shares strictly **first-come, first-served** across cases (e.g., if a 4-share case has 6 orders at that hub, shares 1–4 lock Case #1 at `4/4` while shares 5–6 sit in Case #2 at `2/4`). The catalog card always displays the **currently open case's progress** (e.g., `2/4 shares claimed`) alongside a badge showing how many full cases are already locked (e.g., `1 case locked`).
3. **Upfront Escrow Checkout:** Student places a simulated upfront payment hold for their basket (`£0.00` delivery/service fees), immediately updating that hub's pool counts.
4. **Demo Simulation & Cutoff Resolution:** An in-app **Demo Controls** bar lets a reviewer:
   - **Simulate Strangers:** Adds `1–2` stranger shares across items at the active hub so some cases reach `100%` while others remain `<100%`.
   - **Trigger Cutoff:** Closes the active drop (disabling catalog *Add to Basket* buttons and clearing any un-submitted basket items), captures `100%` filled cases for fulfilment, and automatically refunds `<100%` overflow shares without cancelling filled items in the same order.
   - **Reset:** Restores initial demo data and re-opens the drop.
5. **Campus Pickup Pass:** Post-cutoff, *My Orders* displays fulfilled vs. auto-refunded shares alongside a client-rendered **QR code + 4-digit PIN** for hub check-in (uncollected orders after the grace window are forfeited/donated without refund).

## 3. Acceptance Criteria
1. **Zero-Login GBP Storefront:** Opening the app loads directly into an active drop with no login wall, a campus pickup hub selector (with independent per-hub pool states), category/status filters, and 10–15 pre-packaged shelf-stable/household multi-pack items displaying `£` share price, `£` retail price, and `X/Y shares claimed` for the current open case (plus a locked-case count badge when `≥1` full cases have filled).
2. **Multi-Item Basket & Sequential Case-Boundary Allocation:** Adding items updates the basket drawer; checking out persists orders to `localStorage` and allocates shares chronologically across cases—ordering 2 shares of an item at `3/4` assigns Share 1 to Case #1 (`4/4` Locked) and Share 2 to Case #2 (`1/4` Pooling).
3. **Single-Reviewer Demo Controls & Cutoff:** The Demo Controls bar provides working *Simulate Strangers*, *Trigger Cutoff*, and *Reset* actions; triggering cutoff locks the storefront, marks `100%` cases *Fulfilled*, marks `<100%` overflow shares *Auto-Refunded* (subtracting them from the final charged `£` total), and renders an SVG QR code + 4-digit PIN pickup pass.
4. **Mobile Viewport Layout:** At a `375px` mobile viewport width, the catalog grid stacks into a single column with no horizontal scrollbar, and the basket drawer remains accessible via a sticky bottom bar.
5. **Simple Local Execution:** After `npm install`, `npm run dev` runs the entire app locally on `localhost` with zero `.env` keys required and `localStorage` state persistence (simple external assets like Google Fonts are permitted).

## 4. Non-Goals / Excluded Features
- **No Backend or Database Setup:** Pure `localStorage` browser state; no server APIs, databases, or WebSockets required.
- **No Real Payments or Auth:** Simulated escrow/refunds only (no Stripe/Open Banking); no `.ac.uk` login or signup screens.
- **No Delivery, Admin, or Social Group Features:** Fixed campus hub pickup only (no couriers/maps), no supplier/warehouse portal, and no private friend-group links or chats.
- **Excluded Inventory:** No prepared meals, refrigerated/frozen cold-chain items, or loose bulk goods requiring weighing/repackaging (catalog uses factory multi-packs divided into whole units).

## 5. Stack Choice
- **React 19 + TypeScript + Vite:** Instant `localhost` dev server and strict typing for sequential case-splitting and escrow/refund math.
- **Tailwind CSS (v4) + Lucide React + Local SVGs:** Clean styling and bundled visuals.
- **React Context (`useReducer` + `localStorage`) + `qrcode.react`:** Deterministic client-side drop state machine and local SVG QR generation.
