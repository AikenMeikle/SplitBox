# SplitBox — User Guide & Codebase Documentation

**SplitBox** is a UK university campus wholesale-splitting web application designed for University of Birmingham (UoB) students. Instead of paying steep convenience-store prices or buying entire bulk cases alone, students claim pre-packaged **Slices** (sealed sub-units) of wholesale **Boxes** (cases) in **GBP (`£`)** with **`£0.00` delivery or platform fees**, pooling anonymously with other students at the same campus pickup hub.

---

## 1. How to Start the Website

SplitBox runs 100% locally in your browser with zero external backend servers, databases, or `.env` API keys required. All fonts, icons, QR code generators, and state persistence run offline via bundled packages and browser `localStorage`.

### Prerequisites
- **Node.js** (v18+ recommended)
- **npm** (included with Node.js)

### Quick Start (Development Server)

1. **Install dependencies** (first time only):
   ```bash
   npm install
   ```

2. **Start the local Vite development server**:
   ```bash
   npm run dev
   ```

3. **Open the website in your browser**:
   - Visit the local URL printed in the terminal (typically `http://localhost:5173`).
   - The app opens directly into an active campus Drop as an authenticated student—no login or signup wall required.

### Production Build & Preview (Optional)

To compile TypeScript and verify the production bundle locally:
```bash
npm run build
npm run preview
```

---

## 2. How to Use the Website

SplitBox operates around a **weekly campus Drop cycle** (Wednesday `23:59` cutoff for Saturday campus hub collection).

### Step 1: Choose Your Campus Pickup Hub
- In the top navigation bar (or Hub Hero banner), select one of the **4 University of Birmingham pickup hubs**:
  - **The Vale Village — Shackleton Hub** (`Sat 11:00–14:00`)
  - **Guild of Students — Mermaid Square** (`Sat 12:00–15:00`)
  - **Selly Oak — Bristol Road Hub** (`Sat 13:00–16:00`)
  - **Pritchatts Park — Social Space Hub** (`Sat 10:30–13:00`)
- Each hub shows its collection window and walking distance from nearby student halls/houses.

### Step 2: Browse & Filter Wholesale Pools
- Browse **14 shelf-stable grocery, ambient produce, drink, and dorm household pools**.
- Filter items using:
  - **Category Pills**: *All*, *Pantry & Cooking*, *Drinks & Oat Milk*, *Snacks & Study Fuel*, or *Household & Dorm*.
  - **Pool Status Tabs**:
    - `All Pools`: Every wholesale item in the active Drop.
    - `Closing Soon (1–2 Left)`: Boxes that only need 1 or 2 more slices to lock at 100%.
    - `Locked by Me`: Pools where you already have slices in your basket or locked in escrow.
  - **Search Input**: Search by product name, brand (e.g., *Oatly*, *Mutti*, *Nongshim*), or unit description.

### Step 3: Read Product Cards & the Radial `<SliceMeter />`
Each product crate card displays:
- **Exact Sub-Unit Breakdown**: What 1 Slice equals (e.g., `1 Slice = 3 × 1L Sealed Ambient Cartons (from 12 × 1L Box)`).
- **Price & Savings**: The **SplitBox Slice Price (`£`)** compared against the **Selly Oak Express single-unit retail benchmark (`£`)**, plus the percentage saved.
- **Radial `<SliceMeter />`**: A circular segmented dial showing how many slices of the currently active Box are filled:
  - **Cobalt wedges**: Slices already claimed by anonymous campus strangers.
  - **Mint wedges**: Slices locked by you in completed orders.
  - **Dashed Tangerine wedges**: Live preview of slices currently sitting in your un-checked-out basket.
  - **Full Box Badge**: When 1 or more boxes have already reached `100%`, a badge indicates how many full boxes are locked (e.g., `1 BOX LOCKED · POOLING BOX #2`).

### Step 4: Add Slices to Your Basket & Check Out (Escrow Hold)
1. Click **Lock 1 Slice** (or use the `+` / `-` steppers) on any product card to add slices to your basket.
2. Open the **Slice Basket Drawer** (via the top-right Basket button or the sticky mobile bottom bar).
3. Review the **Sequential Case-Boundary Allocation Preview**:
   - Slices are allocated strictly **first-come, first-served** across box boundaries.
   - *Example*: If Box #1 is at `3/4` and you order `2` slices, **Slice 1** fills Box #1 (`4/4 — LOCKS BOX #1!`), and **Slice 2** starts Box #2 (`1/4 — Pooling in Box #2`).
4. Click **Place Upfront Escrow Hold (`£X.XX`)**:
   - Places a simulated upfront payment hold with **`£0.00` service/delivery fees**.
   - Immediately updates the active Box counts and persists your order to `localStorage`.

### Step 5: Test the Full Lifecycle with the Demo Controls Bar
At the bottom of the screen, the **Single-Reviewer Demo Controls** toolbar lets you simulate the entire Wednesday-to-Saturday lifecycle in seconds:

1. **Simulate Strangers (`+1–2 Slices`)**:
   - Simulates other students at your hub claiming 1–2 slices across several pools so you can watch open boxes reach `100%` (*Box Locked*) while others remain partially filled.
2. **Trigger Wednesday Cutoff**:
   - Closes the active Drop and disables *Add to Basket* buttons.
   - Automatically settles every slice you ordered:
     - **`100%` Full Boxes → `FULFILLED`**: Captured for Saturday hub collection.
     - **`<100%` Partial Overflow Boxes → `AUTO-REFUNDED`**: Automatically refunded in full (`£`) without cancelling your fulfilled slices in the same order.
   - Automatically switches to the **My Orders & Pickup Pass** view.
3. **Reset Demo**:
   - Clears `localStorage`, restores the initial Wednesday seed pools, and re-opens the Drop.

### Step 6: Collect with Your Campus Pickup Pass (`My Orders` View)
- Switch between **Drop Storefront** and **My Orders & Pass** in the top navigation bar at any time.
- **While the Drop is Open**: View your active slices grouped into *Locked Full Boxes (Guaranteed)* vs. *Pooling Boxes (Waiting for Strangers)*.
- **After Cutoff is Triggered**:
  - View your **Final Charged Total (`£`)** and **Automatic Refund Total (`£`)** on a perforated itemised receipt.
  - Present your client-rendered **SVG QR Code** and **4-Digit Backup PIN** at your chosen UoB campus hub during the Saturday pickup window (note the grace-window forfeiture policy displayed on the pass).

---

## 3. Codebase Overview

```text
project/
├── index.html                        # Offline HTML entry point & SVG favicon
├── package.json                      # Scripts & local dependencies (React 19, Tailwind v4, Fontsource, QRCode)
├── vite.config.ts                    # Vite + React + Tailwind v4 configuration
├── public/
│   └── assets/                       # Local SplitBox brand SVGs (logo, radial mark, icons)
└── src/
    ├── main.tsx                      # React root & local @fontsource font imports (Space Grotesk, Plus Jakarta Sans, JetBrains Mono)
    ├── index.css                     # SplitBox design tokens (--sb-*), crate borders, hard offset shadows, receipt perforations
    ├── types.ts                      # Core TypeScript interfaces (CatalogItem, ClaimedSlice, BoxSummary, PickupPass, etc.)
    ├── App.tsx                       # Top-level shell combining Navbar, HubHero, Storefront/Orders views, BasketDrawer, and DemoBar
    ├── data/
    │   └── catalog.ts                # 4 UoB Campus Hubs, 14 UK GBP wholesale catalog items, and integer-pence math helpers
    ├── store/
    │   ├── dropEngine.ts             # Pure deterministic allocator, sequential cross-box math, cutoff/refund resolver, & localStorage I/O
    │   └── DropContext.tsx           # React Context + useReducer provider exposing state selectors and actions via useDrop()
    └── components/
        ├── storefront/
        │   ├── index.ts              # Barrel exports for storefront components
        │   ├── Navbar.tsx            # Sticky top header with hub selector, view switcher, drop status badge, and basket button
        │   ├── StorefrontView.tsx    # UoB campus pickup hub hero banner, category/status/search filter bar, and catalog grid
        │   ├── SplitCard.tsx         # Tactile crate card with radial SliceMeter, GBP savings, and slice stepper controls
        │   └── SliceMeter.tsx        # Reusable segmented radial SVG progress dial (stranger, user-locked, and basket-preview wedges)
        ├── basket/
        │   ├── index.ts              # Barrel exports for basket components
        │   ├── BasketDrawer.tsx      # Slide-over multi-item basket with case-boundary allocation preview & £0.00 fee escrow receipt
        │   └── MobileBasketBar.tsx   # Sticky bottom bar for 375px mobile viewports
        └── orders/
            ├── index.ts              # Barrel exports for orders & demo components
            ├── OrdersPickupView.tsx  # Pre-cutoff escrow ledger & post-cutoff fulfilled vs. auto-refunded breakdown
            ├── PickupPassCard.tsx    # Perforated campus collection pass with offline <QRCodeSVG />, 4-digit PIN, and forfeiture notice
            ├── SettlementReceipt.tsx # Perforated GBP settlement receipt comparing escrow hold, auto-refunds, and captured total
            └── DemoControlsBar.tsx   # Single-reviewer toolbar (Simulate Strangers, Trigger Cutoff, Reset Demo)
```

### Key Architectural Highlights
- **Integer Pence Math (`src/data/catalog.ts` & `src/store/dropEngine.ts`)**: All currency calculations convert GBP pounds to integer pence (`toPence` / `fromPence`) before adding, subtracting, or computing percentages—eliminating floating-point rounding drift.
- **Deterministic Sequential Allocation (`src/store/dropEngine.ts`)**: Every product pool is stored as an ordered chronological ledger of `ClaimedSlice` records. Box numbers (`1, 2, 3...`) and slot positions (`1..totalSlicesPerBox`) are derived deterministically from each slice's index in the ledger.
- **Zero-Config Persistence**: All state transitions automatically sync to `localStorage` under the key `splitbox_uob_drop_state_v1`, surviving page reloads until reset via the **Reset Demo** button.
