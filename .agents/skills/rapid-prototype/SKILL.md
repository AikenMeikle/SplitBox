---
name: rapid-prototype
description: >-
  End-to-end fast-track orchestrator (/rapid-prototype) for building the
  SplitBox prototype in under 1 hour using staged foundation setup, parallel UI
  slice agents, and automated offline QA gates. Activate when asked to build or
  orchestrate the website prototype.
---

# SplitBox Rapid Prototype Orchestrator (`/rapid-prototype`)

Orchestrates the full SplitBox build in minimum wall-clock time by pairing pre-built domain skills with parallel UI slice agents via `run_workflow`.

## Companion Skills (Delegate & Enforce)

Every agent participating in this build MUST read the skill(s) matching its scope:
1. **`splitbox-drop-engine`** (`.agents/skills/splitbox-drop-engine/SKILL.md`) — Sequential case-boundary math, integer-pence GBP escrow/refund cutoff helpers (`resources/allocation.ts`), and UK student catalog rules.
2. **`splitbox-ui-system`** (`.agents/skills/splitbox-ui-system/SKILL.md`) — Ready-to-copy offline Tailwind v4 + `@fontsource` CSS (`resources/splitbox-tokens.css`), radial SVG `<SliceMeter />` (`resources/SliceMeter.tsx`), crate shadows, and contrast guardrails.
3. **`splitbox-qa-gate`** (`.agents/skills/splitbox-qa-gate/SKILL.md`) — Automated zero-CDN + GBP + `npm run build` verification script (`scripts/verify_offline_and_build.sh`) and 5-point acceptance audit.

## Execution Steps

1. **Spec Check (10 seconds):**
   - Confirm `brief.md` and `page-styles.md` (or `page-syles.md`) exist in the workspace root. (If `page-styles.md` is missing and `page-syles.md` exists, copy `page-syles.md` to `page-styles.md`.)
2. **Launch Parallel Multi-Agent Build (`run_workflow`):**
   ```python
   run_workflow(
       ScriptPath="/home/hacksday/Documents/project/.agents/skills/rapid-prototype/scripts/build_prototype.py",
       Description="Build SplitBox foundation, parallel UI slices, and run offline QA gate"
   )
   ```
3. **Start Local Server & Handoff:**
   - Start `npm run dev` with `IsDaemon=true`, verify `localhost` responds via `curl -I`, and summarize the live URL + reviewer test flow (`3/4 + 2` split → Demo Controls Cutoff → QR + 4-digit PIN Pass).
