# SplitBox — GitHub Copilot Instructions

Auto-loaded for GitHub Copilot Pro (unlocked via `@student.bham.ac.uk` GitHub Student Developer Pack). Before editing multiple files, check **[AGENTS.md](../AGENTS.md)** for the full routing table and **[docs/ACTION_PLAN_24H.md](../docs/ACTION_PLAN_24H.md)** for the 24-hour UoB MVP roadmap. Read only the relevant spec in `docs/` (`product/mvp-spec.md`, `architecture/fullstack-blueprint.md`, `design/brand-and-ui.md`, or `business/uob-launch-and-pitch.md`).

## Non-Negotiable Coding Guardrails
- **Dual-Mode Support:** Keep `VITE_DEMO_MODE` (`npm run dev` offline `localStorage` fallback + Demo Controls when `.env` keys are missing) working alongside Live **Supabase** (`*.supabase.co`), **Stripe** (`capture_method: 'manual'`), and **Resend** integrations.
- **No External Asset CDNs:** Never reference `fonts.googleapis.com`, remote stock images, or external QR image URLs—always use local `@fontsource/*`, `public/assets/splitbox-*.svg`, and `qrcode.react` (`<QRCodeSVG />`).
- **Integer-Pence GBP (`£`) & UoB Drop #1:** Store/calculate all currency in integer GBP pence (`vatRate: 0 | 0.20`, never floats or `$`). Enforce 1 active launch hub (`Vale · Shackleton`), `£0.00` fee on `£9.00+` crates (`£0.39` below `£9.00`), 1 editable weekly order before Wed `23:59` cutoff, and UK FIR-labelled sealed ambient items.
- **FCFS Allocation & Pre-Auth Copy:** Preserve chronological cross-box slice allocation (`3/4 + 2` → `Box #1` `4/4` Locked + `Box #2` `1/4` Pooling; `SELECT ... FOR UPDATE` in Postgres) and use **`"Card Pre-Authorisation Hold"`** (never `"escrow"` in live checkout).
- **SplitBox UI Craft:** `#F7FAF8` light canvas, `1.5px–2px solid #0B241C` borders, `3px 3px 0px #0B241C` hard shadows, radial SVG `<SliceMeter />` only, `#0B241C` text on `#10D48E` & `#FF6B1A`, and `375px` zero-overflow mobile layout.

## Verification Commands
- Start dev server: `npm run dev`
- Typecheck, unit tests & production build: `npx tsc -b && npm test && npm run build`
- Asset-CDN & GBP QA script: `bash .agents/skills/splitbox-qa-gate/scripts/verify_offline_and_build.sh`
