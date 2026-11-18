# SplitBox — Always-On Workspace Agent Directives & Skill Directory

> **TIMEBOX ALERT (1-Hour Sprint):** Prioritize working functionality, deterministic state math, and tactile SplitBox visual polish on the first pass. Reuse the pre-built code & scripts inside `.agents/skills/` instead of writing boilerplate from scratch.

## 1. Mandatory Project Skills (Read Before Acting!)

All specialized SplitBox skills live in `.agents/skills/`. Whenever your task touches one of the scopes below—whether you are the Manager, a Subagent, a Swarm Worker, or a `run_workflow` Builder—you **MUST** read its `SKILL.md` (and reuse its `resources/` / `scripts/`) before writing code:

| Skill Name | Path to `SKILL.md` | Pre-Built Accelerators Included | When You MUST Read & Use It |
| :--- | :--- | :--- | :--- |
| **`rapid-prototype`** | `.agents/skills/rapid-prototype/SKILL.md` | `scripts/build_prototype.py` (`run_workflow` parallel pipeline) | Orchestrating or building the full prototype end-to-end (`/rapid-prototype`). |
| **`splitbox-drop-engine`** | `.agents/skills/splitbox-drop-engine/SKILL.md` | `resources/allocation.ts` (pence-accurate GBP math, chronological cross-box allocator, cutoff/refund evaluator) | Touching `src/types.ts`, `src/data/`, `src/store/`, basket previews, checkout, or Demo Controls. |
| **`splitbox-ui-system`** | `.agents/skills/splitbox-ui-system/SKILL.md` | `resources/splitbox-tokens.css` (offline Tailwind v4 + `@fontsource` + `--sb-*` crate CSS) & `resources/SliceMeter.tsx` (radial citrus SVG meter) | Styling or building any UI component, navbar, product card, receipt block, drawer, badge, or layout. |
| **`splitbox-qa-gate`** | `.agents/skills/splitbox-qa-gate/SKILL.md` | `scripts/verify_offline_and_build.sh` (zero-CDN check, stray `$` check, asset check, `npm run build`) | Integrating `src/App.tsx`, verifying acceptance criteria, or finishing a build. |

---

## 2. Source-of-Truth Specification Files & Reconciliations

- **Product & Acceptance Spec:** `brief.md` (Authoritative for features, GBP `£` currency, UK student catalog rules, `375px` mobile layout, and 100% offline execution).
- **Visual & Brand Spec:** `page-styles.md` / `page-syles.md` and `identity.md` + `assets/splitbox-*.svg|png` (Authoritative for colors, typography, crate borders/shadows, radial slice meters, and *Box / Slice / Slice Lock / Box Drop* microcopy).

### Non-Negotiable Conflict Resolutions
1. **100% Offline Execution (`brief.md` §3.5 & §4 beats `page-syles.md` §3):** NEVER include `<link href="https://fonts.googleapis.com/...">` or any external runtime `http(s)://` URL. Use local `@fontsource/space-grotesk`, `@fontsource/plus-jakarta-sans`, `@fontsource/jetbrains-mono` packages and local `qrcode.react` (`<QRCodeSVG />`).
2. **GBP (`£`) & UK Campus Context (`brief.md` beats `$` examples in style snippets):** Format every price, retail comparison, savings badge, and refund in **GBP (`£`)** with `£0.00` fees. Catalog must contain 10–15 sealed sub-units of shelf-stable groceries, ambient produce, and household essentials only.
3. **Signature SplitBox Craft:** Light chalk canvas (`#F7FAF8`), crisp `1.5px–2px solid #0B241C` borders, hard zero-blur offset shadows (`3px 3px 0px #0B241C`), `<SliceMeter />` radial SVG meters (never horizontal progress bars), and `#0B241C` ink text on `#10D48E` mint & `#FF6B1A` tangerine surfaces.
