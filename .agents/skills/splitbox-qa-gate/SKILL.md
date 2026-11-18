---
name: splitbox-qa-gate
description: Run this before marking any UI, state, or integration task complete, before finishing a build, or before telling the user a SplitBox change works.
---

# SplitBox Offline, Currency & Build Verification (`splitbox-qa-gate`)

## 1. Run the Automated Offline & Build Gate

Execute the project verification script from the workspace root:

```bash
bash .agents/skills/splitbox-qa-gate/scripts/verify_offline_and_build.sh
```

Every check in the script must pass with exit code `0`:
1. **Zero External Runtime Network Calls:** Scans `index.html` and `src/` to block forbidden `http(s)://` links (such as `fonts.googleapis.com`, remote image CDNs, or external QR APIs).
2. **GBP (`£`) Currency Hygiene:** Scans `src/` to reject any stray USD (`$X.XX`) price literals carried over from generic style snippets.
3. **Bundled Local Assets:** Verifies `splitbox-icon.svg` is present in `public/assets/` or `src/assets/`.
4. **Production TypeScript & Vite Build:** Runs `npm run build` (`tsc -b && vite build`) with zero compilation or bundling errors.

## 2. Start Local Dev Server & Verify HTTP 200

1. Start the Vite dev server in the background: `npm run dev`
2. Verify the local storefront and bundled SVG assets return `HTTP 200`:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
   curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/assets/splitbox-icon.svg
   ```

## 3. Functional Acceptance Smoke Check

Confirm these three SplitBox invariants hold before handoff:
- **Cross-Box Boundary Split (`3/4 + 2`):** Claiming `2` slices on a `3/4` pool assigns Slice 1 to `Box #1 (4/4 Locked)` and Slice 2 to `Box #2 (1/4 Pooling)` in `localStorage`.
- **Cutoff Partial Auto-Refund & Pass:** Triggering **Drop Cutoff** in Demo Controls marks `100%` boxes *Fulfilled*, marks `<100%` overflow slices *Auto-Refunded* (subtracted from the final charged `£` total), and renders a local `<QRCodeSVG />` + 4-digit PIN.
- **`375px` Mobile Layout:** Catalog stacks in a single column (`1fr`) with zero horizontal overflow and a sticky bottom basket bar.
