# PalletCut (SplitBox) — Unified Goal & Multi-Agent Snapshot
_Updated: 2026-11-18T22:01:01+00:00_

## 1. Unified Goal & Invariants
**Goal:** Deliver & maintain PalletCut (formerly SplitBox) — Dual-Mode (zero-config offline Demo Mode + Supabase/Stripe Live Mode) tactile light-mode UoB bulk-grocery & household-essentials pooling web app (1 active launch hub Vale · Shackleton + 3 coming_soon vote hubs, £ GBP integer-pence sequential FCFS case allocation, £0.00 crate fee >= £9.00 / £0.39 < £9.00, Card Pre-Authorisation Hold cutoff settlement, SVG QR + 4-digi…
- Zero External Asset CDNs (Both Modes): Self-hosted @fontsource fonts, local palletcut-*.svg assets, and local qrcode.react SVG; Demo Mode runs 100% offline via localStorage.
- UoB Drop #1 Hub & GBP (£) Fee Rules: 1 active launch hub (Vale · Shackleton; 3 other UoB hubs as coming_soon votes), £0.00 fee >= £9.00 (£0.39 micro-crate fee < £9.00), Card Pre-Authorisation Hold copy.
- Chronological Sequential Case Allocation: Strictly first-come-first-served across Box #1, Box #2, ... with <100% overflow slices auto-released at Wednesday 23:59 cutoff.
- Tactile Citrus-Crate Craft (Kept for Launch): #F7FAF8 light canvas, 1.5px–2px #0B241C borders, 3px 3px 0px #0B241C hard shadows, radial SVG <SliceMeter /> only, #0B241C ink on #10D48E mint & #FF6B1A tangerine.

## 2. Acceptance Gates & Milestones
- [DONE] `gate-1-build` **Clean TypeScript & Vite Build** — tsc -b && vite build exits 0 with zero TypeScript or bundler errors.
- [DONE] `gate-2-offline` **Zero External Network / CDN Calls** — 0 external http(s) requests on load and checkout/cutoff flows; local @fontsource, SVGs, and £ GBP copy.
- [DONE] `gate-3-allocation` **3/4 + 2 Cross-Box Allocation & Auto-Refund** — Ordering 2 slices at 3/4 records Box #1 (4/4 Locked) + Box #2 (1/4 Pooling -> Auto-Refunded on Trigger Cutoff) with localStorage persistence.
- [DONE] `gate-4-pickup-pass` **QR + 4-Digit PIN Net £ Receipt & Reset** — Post-cutoff Orders/Pickup Pass displays fulfilled vs. auto-refunded slices, net £ charged total, SVG QR + 4-digit PIN, and working Reset.
- [DONE] `gate-5-mobile-375` **375px Zero-Overflow Mobile Layout** — At 375px x 812px viewport, single-column catalog grid with scrollWidth <= 375 and sticky bottom basket bar.
- [DONE] `m1-drop-engine` GBP Drop Engine, Sequential Allocator & UK Campus Catalog (@foundation) — src/types.ts, src/data/catalog.ts, src/store/dropEngine.ts, src/store/DropContext.tsx
- [DONE] `m2-ui-slices` Storefront, Basket, Orders/Pickup Pass, Hub Ops & Investor Views (@ui-builders) — Tactile crate UI + radial SVG <SliceMeter /> + Demo Controls integrated in src/App.tsx
- [DONE] `m3-qa-gate` 5-Gate Offline, GBP & 375px Build Verification (@splitbox-qa) — verify_offline_and_build.sh passing cleanly
- [DONE] `m4-agent-hub` Multi-Agent Communication Bus, O(1) Codebase Indexer & Lifecycle Hooks (@swarm) — Eliminate cold-start scanning and coordinate file locks + handoffs across agents

## 3. Active Agent File Locks
- None (all workspace slices currently unlocked)

## 4. Key Architectural Decisions
- `DEC-001` **100% Offline @fontsource & qrcode.react Override CDN Snippets**: Bundle Space Grotesk, Plus Jakarta Sans, and JetBrains Mono via @fontsource and render QR passes via local qrcode.…
- `DEC-002` **UoB Drop #1 Single Active Hub, GBP (£) Integer-Pence Math & Card Pre-Autho…**: Launch with 1 active hub (Vale · Shackleton; 3 other UoB hubs as coming_soon votes), £0.00 crate fee >= £9.00 (£0.…
- `DEC-003` **PalletCut Brand Rename + Tactile Citrus-Crate Palette Kept for Launch**: Rebrand product identity to PalletCut (palletcut-icon.svg / palletcut-logo.svg) while keeping the tactile #F7FAF8…
- `DEC-004` **Radial SVG <SliceMeter /> Only (No Horizontal Progress Bars)**: Display open-box slice progress exclusively via segmented radial SVG wedges (#10D48E stranger slices, #FF6B1A popp…

## 5. Latest 8 Handoffs / Messages
- `#146` [file_modified] **unifier -> all**: Edited tests/security-storage.test.mjs [files: tests/security-storage.test.mjs]
- `#147` [file_modified] **unifier -> all**: Edited tests/test_agent_hub.py [files: tests/test_agent_hub.py]
- `#148` [file_modified] **session-81a2ba24 -> all**: Edited .agents/hooks.json [files: .agents/hooks.json]
- `#149` [handoff] **editor -> verifier**: Compiled 512-line master FOUNDER_BUSINESS_PLAYBOOK.md synthesizing playbook/01..05 (staged in scratch wh… [files: FOUNDER_BUSINESS_PLAYBOOK.md]
- `#150` [file_modified] **session-81a2ba24 -> all**: Edited AGENTS.md [files: AGENTS.md]
- `#151` [file_modified] **editor -> all**: Edited FOUNDER_BUSINESS_PLAYBOOK.md [files: FOUNDER_BUSINESS_PLAYBOOK.md]
- `#152` [handoff] **editor -> verifier**: Compiled 512-line master FOUNDER_BUSINESS_PLAYBOOK.md in repo root synthesizing playbook/01..05 [files: FOUNDER_BUSINESS_PLAYBOOK.md]
- `#153` [handoff] **growth -> verifier**: Landed verified 10/10 425-line Ch4 UoB Campus GTM, Estates RAMS, Viral Loops & UK SEIS Fundraising manua… [files: playbook/04-uob-campus-gtm-estates-and-pitching.md]

## 6. Quick Lookup & Coordination Commands
- Codebase Atlas: read `.agents/hub/CODEBASE_MAP.md` or run `python3 harness/agent_hub.py query "<symbol_or_topic>"`
- Orient & Inbox: `python3 harness/agent_hub.py brief --agent <name>` | `inbox --agent <name> --ack`
- Claim & Handoff: `python3 harness/agent_hub.py claim --agent <name> --paths <glob>` | `handoff --from <name> --summary "..."`
