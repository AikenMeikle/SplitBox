# SplitBox — Agent Instructions (`agents.md`)

Operational rules for AI coding agents building and modifying **SplitBox**, a 100% local UK university bulk-grocery & household-essentials pooling web prototype.

---

## 1. Source of Truth & Conflict Resolution

Read these workspace files before writing code. When documents disagree, apply the overrides below:

| File | Role | Mandatory Agent Overrides |
| :--- | :--- | :--- |
| [brief.md](file:///home/hacksday/Documents/project/brief.md) | Product scope, core workflow, 5 pass/fail acceptance criteria, non-goals, stack | **Highest authority** on scope, state logic, UK context, and offline rules. |
| [page-syles.md](file:///home/hacksday/Documents/project/page-syles.md) | CSS tokens, typography, radial SVG slice meter, receipt cards, lifecycle badges | *(Note exact filename spelling: `page-syles.md`, not `page-styles.md`.)* **Override 1:** Replace all `$` / US copy in code snippets with **GBP (`£`)** and UK halls/campus hubs. **Override 2:** **Do NOT** insert the `<link href="https://fonts.googleapis.com/...">` snippet; bundle fonts locally via `@fontsource` packages. |
| [identity.md](file:///home/hacksday/Documents/project/identity.md) | Brand voice, logo usage rules, domain vocabulary | Adopt **Box** (bulk case), **Slice** (student share), **Box Pool** (active pool), **Slice Lock** (escrow hold), and **Box Drop** (scheduled campus pickup) alongside clear share counts (`X/Y`). |
| `assets/splitbox-*.{svg,png}` | Official "Citrus Crate" horizontal lockup, icon, and raster logo | Serve locally (e.g. copy or import `splitbox-icon.svg` and `splitbox-logo.svg`); maintain `0.25W` clear space and keep the popped wedge at top-right. |

---

## 2. Tech Stack, Setup & Commands

- **Stack:** React 19 + TypeScript + Vite, Tailwind CSS v4 (plus custom CSS variables from `page-syles.md`), `lucide-react`, `qrcode.react`, and self-hosted `@fontsource/space-grotesk`, `@fontsource/plus-jakarta-sans`, `@fontsource/jetbrains-mono`.
- **Standard Commands:**
  - Install: `npm install`
  - Dev server: `npm run dev` (must work completely offline with zero `.env` variables)
  - Typecheck & production build check: `npx tsc -b && npm run build`

### Recommended Project Layout
```text
src/
  assets/          # Local SplitBox SVGs & bundled product category illustrations
  components/      # Navbar, HubSelector, SplitCard, SliceMeterSvg, BasketDrawer,
                   # StickyMobileBasketBar, OrdersPickupView, DemoControlsBar
  data/            # Seeded UK catalog (10–15 items) & UK campus pickup hubs
  state/           # DropContext + reducer + deterministic sequential allocation + localStorage sync
  types/           # Strict TypeScript interfaces for CatalogItem, SliceAllocation, Order, DropState
  styles/          # CSS custom properties (--sb-*) and tactile crate utility classes
```

---

## 3. Domain & State-Machine Invariants

1. **Zero-Login Entry:** Boot directly into an active weekly **Box Drop** as a mocked UK university student with a selectable campus/halls pickup hub and `£0.00` delivery/service fees.
2. **Catalog Constraints:** Seed **10–15 items** strictly limited to **sealed, pre-packaged sub-units** of shelf-stable food/drinks, ambient produce, and household/dorm essentials. Never add prepared meals, refrigerated/frozen items, or loose bulk goods requiring weighing.
3. **Chronological Sequential Allocation (First-Come, First-Served):**
   - Track pledged slices across numbered boxes (`Box #1`, `Box #2`, …) in strict chronological order.
   - **Boundary Rule:** If an item has `totalSlices = 4` and `3/4` slices are already claimed in `Box #1`, a checkout of `2` slices **must** assign Slice 1 to `Box #1` (`4/4` — *Box Locked*) and Slice 2 to `Box #2` (`1/4` — *Pooling*).
4. **Demo Controls & Cutoff Resolution (`OPEN` → `CUTOFF_RESOLVED`):**
   - Provide an always-accessible **Demo Controls** bar with three deterministic actions:
     - **Simulate Strangers:** Adds stranger slice claims to open pools and locks any boxes that hit `100%`.
     - **Trigger Cutoff:** Transitions all `100%` filled boxes to **Fulfilled** and marks all `<100%` overflow slices **Auto-Refunded**, deducting refunded slices from the student's final charged `£` total while preserving fulfilled slices in the same order. Generates a client-side SVG QR code (`qrcode.react`) + **4-digit Pickup PIN** (plus grace-window forfeiture notice).
     - **Reset:** Clears `localStorage` (`splitbox_state_v1`) and restores initial seeded pools.
5. **Defensive `localStorage` Hydration:** Wrap `localStorage` reads/writes in `try/catch` and validate schema version on load so corrupted state falls back cleanly to initial seed data.

---

## 4. Visual & Accessibility Guardrails

- **High-Craft Light Mode Only:** Canvas `#F7FAF8` (`--sb-bg-canvas`), card surface `#FFFFFF`, primary ink `#0B241C`. Never ship dark mode or generic SaaS blue/gray cards.
- **Tactile Crate Framing (Zero Blur):** Use `1.5px`–`2px` solid `#0B241C` borders and hard offset shadows (`3px 3px 0px #0B241C`). Soft/blurry CSS `box-shadow` values are **forbidden**.
- **Radial Segmented Slice Meter (No Horizontal Progress Bars):** Render pool progress dynamically in SVG around center `(44, 44)` (`R = 32`), coloring funded stranger wedges `#10D48E`, the user's locked/active wedge `#FF6B1A` popped outward (`transform="translate(3, -3)"`), and open wedges `#EDF7F2`.
- **Perforated Wholesale Receipt & Tabular Numerics:** Every product card must show a dashed monospace comparison block (*Supermarket Retail* struck through vs. *Your SplitBox Slice* in `£` + `SAVE X%`). Apply `JetBrains Mono` + `font-variant-numeric: tabular-nums` to all `£` prices, `X/Y` ratios, percentages, timers, and PINs.
- **Strict Text Contrast:**
  - On Botanical Mint (`#10D48E`) and Zesty Tangerine (`#FF6B1A`): **always** use Deep Forest Ink (`#0B241C`) text—never white.
  - On Electric Cobalt (`#1849D6`) and Deep Forest Ink (`#0B241C`): **always** use Pure White (`#FFFFFF`) text.
- **375px Mobile Layout:** At `375px` width, `.sb-catalog-grid` must stack into a single column (`1fr`) with zero horizontal overflow (`document.documentElement.scrollWidth <= window.innerWidth`), and the basket drawer trigger must stay reachable via a sticky bottom bar.

---

## 5. Hard Guardrails (Never Do)

- **Zero External Network Calls at Runtime:** No `fetch`/`XHR` to remote servers, no Google Fonts CDN `<link>`, no Unsplash/Pexels/placeholder image URLs, no external QR APIs, and no analytics scripts.
- **No Out-of-Scope Screens:** Do not build login/signup walls, `.ac.uk` verification modals, Stripe/card-number forms, delivery maps, group-chat/invite-friend flows, or warehouse admin portals.

---

## 6. Pre-Completion Verification Checklist

Before finishing any implementation task, verify all five gates pass:
1. `npx tsc -b && npm run build` exits with code `0` and zero TypeScript errors.
2. DevTools Network tab records **0 external (non-localhost) requests** on load and throughout checkout/cutoff flows.
3. Ordering `2` slices of an item at `3/4` records `Box #1 (4/4 Locked)` and `Box #2 (1/4 Pooling)`, survives page reload via `localStorage`, and auto-refunds only the `Box #2` slice when *Trigger Cutoff* is clicked immediately.
4. Post-cutoff *My Orders / Pickup Pass* displays fulfilled vs. auto-refunded slices, accurate net `£` charged total, an inline `<svg>` QR code, and a 4-digit PIN; *Reset* restores the initial state.
5. At `375px × 812px` viewport, `document.documentElement.scrollWidth <= 375`, catalog cards render in 1 column, and the sticky bottom basket bar opens the basket drawer.
