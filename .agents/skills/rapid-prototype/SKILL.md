---
name: rapid-prototype
description: >-
  End-to-end fast-track orchestrator (/rapid-prototype) for building or
  extending SplitBox slices using staged foundation setup, parallel UI slice
  agents, and automated QA gates. Activate when asked to orchestrate multi-slice
  prototype builds.
---

# SplitBox Rapid Prototype Orchestrator (`/rapid-prototype`)

Orchestrates parallel SplitBox slice builds in minimum wall-clock time by pairing pre-built domain skills with parallel UI slice agents via `run_workflow`.

## Companion Skills (Delegate & Enforce)

Every agent participating in this build MUST read the skill(s) matching its scope:
1. **`splitbox-drop-engine`** (`.agents/skills/splitbox-drop-engine/SKILL.md`) — Sequential case-boundary math, integer-pence GBP pre-auth/cutoff helpers (`resources/allocation.ts`), and UoB catalog rules.
2. **`splitbox-ui-system`** (`.agents/skills/splitbox-ui-system/SKILL.md`) — Ready-to-copy offline Tailwind v4 + `@fontsource` CSS (`resources/splitbox-tokens.css`), radial SVG `<SliceMeter />` (`resources/SliceMeter.tsx`), crate shadows, and contrast guardrails.
3. **`splitbox-qa-gate`** (`.agents/skills/splitbox-qa-gate/SKILL.md`) — Automated asset-CDN + GBP + `npm run build` verification script (`scripts/verify_offline_and_build.sh`) and 5-gate acceptance audit.

## Execution Steps

1. **Spec Check (10 seconds):**
   - Confirm `docs/product/mvp-spec.md` and `docs/design/brand-and-ui.md` exist in `docs/` (see [AGENTS.md](../../../AGENTS.md) for the full routing table).
2. **Launch Parallel Multi-Agent Build (`run_workflow`):**
   ```python
   run_workflow(
       ScriptPath="/home/hacksday/Documents/project/.agents/skills/rapid-prototype/scripts/build_prototype.py",
       Description="Build SplitBox foundation, parallel UI slices, and run QA gate"
   )
   ```
3. **Start Local Server & Handoff:**
   - Start `npm run dev` with `IsDaemon=true`, verify `localhost` responds via `curl -I`, and summarize the live URL + reviewer test flow (`3/4 + 2` split → Cutoff Settlement → QR + 4-digit PIN Pass).
