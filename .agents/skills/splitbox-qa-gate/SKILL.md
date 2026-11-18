---
name: splitbox-qa-gate
description: >-
  Fast automated offline/zero-CDN verification, GBP currency check, TypeScript
  + Vite build gate, and SplitBox 5-criteria acceptance checklist. MUST read and
  run before completing integration or handing off the prototype.
---

# SplitBox QA & Acceptance Gate Skill

Use this skill in the final integration/polish phase (or after editing components) to guarantee all 5 acceptance criteria in [brief.md](../../../brief.md) and visual rules in [page-syles.md](../../../page-syles.md) pass in under 60 seconds.

## 1. Run Automated Verification Script First

Execute [scripts/verify_offline_and_build.sh](./scripts/verify_offline_and_build.sh) from the workspace root:

```bash
bash .agents/skills/splitbox-qa-gate/scripts/verify_offline_and_build.sh
```

What this script checks automatically:
1. **Zero External Runtime Network URLs:** Scans `index.html` and `src/` for forbidden `https://` or `http://` links (catches accidental `fonts.googleapis.com`, remote CDNs, or Unsplash URLs while ignoring standard `w3.org` SVG XML namespaces).
2. **GBP (`£`) Currency Hygiene:** Scans `src/` for stray USD `$` price literals (e.g., `$6.90`) left over from HTML reference snippets.
3. **Local Brand Assets:** Confirms `public/assets/splitbox-icon.svg` (or `src/assets/`) exists so navbar/pass logos never 404.
4. **Clean Production Build:** Runs `npm run build` (`tsc` + Vite bundle) and fails on any TypeScript or CSS error.

## 2. 60-Second Functional & Visual Audit Checklist

Verify each item in code (and on `localhost` once `npm run dev` starts):

- [ ] **AC #1 — Zero-Login GBP Storefront:** App opens directly into active campus drop (no login modal/screen), shows hub selector + countdown, category + *"Almost Full (1–2 Slices Left)"* filters, and 10–15 compliant UK shelf-stable/household items in `£` with `<SliceMeter />` radial SVG meters (no horizontal progress bars) and dashed wholesale receipt blocks.
- [ ] **AC #2 — Sequential Case-Boundary Split (`3/4 + 2` Test):** Adding `2` slices of an item at `3/4` assigns Slice 1 to `Box #1 (4/4 Locked)` and Slice 2 to `Box #2 (1/4 Pooling)` and persists across page reloads via `localStorage`.
- [ ] **AC #3 — Demo Controls & Partial Auto-Refund Cutoff:** Collapsible Demo Controls bar has working **Simulate Strangers**, **Trigger Cutoff**, and **Reset** buttons. Triggering Cutoff marks `100%` boxes *Fulfilled*, marks `<100%` overflow slices *Auto-Refunded* (deducted from final charged `£` total without cancelling fulfilled slices in the same order), and renders a local `<QRCodeSVG />` + **4-digit PIN** + forfeiture notice in *My Orders / Pickup Pass*.
- [ ] **AC #4 — `375px` Mobile Layout:** At `375px` width, `.sb-catalog-grid` stacks in `1` column with zero horizontal scrollbar, and a sticky bottom bar opens the Basket Drawer cleanly.
- [ ] **AC #5 — Contrast & Tactile Crate Craft:** `#0B241C` ink text on `#10D48E` mint and `#FF6B1A` tangerine (`#FFFFFF` text only on `#1849D6` cobalt and `#0B241C` ink); hard `2px solid #0B241C` borders + zero-blur offset crate shadows (`3px 3px 0px #0B241C`).
