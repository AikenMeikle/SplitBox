import os

REQUIRED_DOCS = (
    "docs/product/mvp-spec.md",
    "docs/design/brand-and-ui.md",
)
missing = [f for f in REQUIRED_DOCS if not os.path.exists(f)]
if missing:
    raise RuntimeError(f"Missing required spec file(s): {', '.join(missing)}")

SLICE_PLAN_SCHEMA = {
    "type": "object",
    "required": ["summary", "slices"],
    "properties": {
        "summary": {
            "type": "string",
            "description": "Exact exported types from src/types.ts, hooks/actions from src/store/, and shared components created.",
        },
        "slices": {
            "type": "array",
            "minItems": 3,
            "maxItems": 3,
            "items": {
                "type": "object",
                "required": ["id", "title", "owned_dir", "exports", "requirements"],
                "properties": {
                    "id": {"type": "string"},
                    "title": {"type": "string"},
                    "owned_dir": {"type": "string"},
                    "exports": {"type": "array", "items": {"type": "string"}},
                    "requirements": {"type": "string"},
                },
            },
        },
    },
}

# ---------------------------------------------------------------------------
# Phase 1: Foundation, Design Tokens & Deterministic Drop Engine
# ---------------------------------------------------------------------------
phase("1. Foundation, Design Tokens & Drop State Engine")
log("Scaffolding Vite + React 19 + Tailwind v4 + Fontsource, CSS tokens, and DropContext...")

foundation = await agent(
    prompt="""You are the Lead Frontend Architect for SplitBox.

MANDATORY FIRST STEP — Read these skills and specs immediately:
- `.agents/skills/splitbox-drop-engine/SKILL.md` AND `.agents/skills/splitbox-drop-engine/resources/allocation.ts`
- `.agents/skills/splitbox-ui-system/SKILL.md`, `.agents/skills/splitbox-ui-system/resources/splitbox-tokens.css`, AND `.agents/skills/splitbox-ui-system/resources/SliceMeter.tsx`
- `docs/product/mvp-spec.md`, `docs/design/brand-and-ui.md`, and `docs/architecture/fullstack-blueprint.md`

YOUR TASKS (Execute fast by reusing the drop-in skill resources!):
1. Scaffold Vite + React 19 + TypeScript + Tailwind CSS v4 (`@tailwindcss/vite` + `tailwindcss`) in the workspace root if not yet initialized, and install `lucide-react`, `qrcode.react`, `@fontsource/space-grotesk`, `@fontsource/plus-jakarta-sans`, and `@fontsource/jetbrains-mono`. Ensure `index.html` has ZERO external font/asset CDN links and uses local `/assets/splitbox-icon.svg` favicon.
2. Copy `assets/splitbox-*` into `public/assets/`.
3. Copy `.agents/skills/splitbox-ui-system/resources/splitbox-tokens.css` into `src/index.css` and copy `.agents/skills/splitbox-ui-system/resources/SliceMeter.tsx` into `src/components/common/SliceMeter.tsx` so all UI slices can import it cleanly without touching each other's folders.
4. Copy `.agents/skills/splitbox-drop-engine/resources/allocation.ts` into `src/utils/allocation.ts` and build:
   - `src/types.ts`: Complete TypeScript contracts for Products, CampusHubs, BasketItems, Orders, ClaimedSliceRecord, PickupPass, and DropState.
   - `src/data/catalog.ts`: Compliant UoB student items in GBP pence (strictly sealed shelf-stable groceries, ambient produce, household essentials) + UoB campus pickup hubs, pre-seeded with stranger slices including at least two `N-1/N` pools (e.g. `3/4` and `7/8`) and one multi-box item.
   - `src/store/DropContext.tsx`: Deterministic `useReducer` + `localStorage` Demo Mode context exposing basket actions, cross-box basket preview, pre-auth Slice Lock checkout, `simulateStrangers()`, `triggerCutoff()` (with partial auto-release + Pickup Code + 4-digit PIN), and `resetPrototype()`.
5. Verify `npx tsc --noEmit` passes with zero errors.
6. Return the exact 3 disjoint UI slices (`src/components/storefront`, `src/components/basket`, `src/components/orders`) and all exported hook/type signatures so 3 parallel UI builders can code simultaneously without touching shared files.""",
    schema=SLICE_PLAN_SCHEMA,
    role="Foundation & Drop Engine Architect",
    type_name="self",
    model="pro",
)

log(f"Foundation locked: {foundation['summary']}")

# ---------------------------------------------------------------------------
# Phase 2: Parallel UI Slice Construction
# ---------------------------------------------------------------------------
phase("2. Parallel UI Slice Builders")

slices_overview = "\n".join(
    f"- {s['title']} (`{s['owned_dir']}`): exports {', '.join(s['exports'])}"
    for s in foundation["slices"]
)

slice_results = await parallel(
    foundation["slices"],
    lambda s: agent(
        prompt=f"""You are a Senior SplitBox UI Engineer building ONE isolated slice in parallel.

MANDATORY FIRST STEP — Read `.agents/skills/splitbox-ui-system/SKILL.md` AND inspect `src/types.ts`, `src/utils/allocation.ts`, `src/components/common/SliceMeter.tsx`, `src/store/DropContext.tsx`, and `src/index.css`.

Foundation Contract Summary:
{foundation['summary']}

YOUR EXCLUSIVE SLICE:
- Title: {s['title']}
- Owned Directory: `{s['owned_dir']}`
- Required Named Exports (re-export from `{s['owned_dir']}/index.ts`): {', '.join(s['exports'])}
- Requirements: {s['requirements']}

STRICT PARALLEL RULES:
1. ONLY create or edit files inside `{s['owned_dir']}/`. NEVER edit `package.json`, `src/types.ts`, `src/store/`, `src/utils/`, `src/components/common/`, `src/index.css`, or `src/App.tsx`, and do NOT run `npm install`.
2. Obey all `splitbox-ui-system` rules: GBP `£` via `formatGBP()`, `SliceMeter` radial SVG wedges (no horizontal progress bars), dashed `.sb-card__receipt`, `2px solid #0B241C` crate borders + zero-blur offset shadows, `#0B241C` ink text on `#10D48E` mint & `#FF6B1A` tangerine, `375px` single-column responsiveness, and zero external asset CDNs.""",
        schema={"type": "string"},
        role=f"UI Builder: {s['title']}",
        type_name="self",
        model="inherit",
    ),
)

for res in slice_results:
    log(res)

# ---------------------------------------------------------------------------
# Phase 3: Integration, Automated QA Gate & Polish
# ---------------------------------------------------------------------------
phase("3. App Integration & Automated QA Gate")

final_report = await agent(
    prompt=f"""You are the Lead Integrator & QA Engineer finalizing SplitBox.

MANDATORY FIRST STEP — Read `.agents/skills/splitbox-qa-gate/SKILL.md` and `docs/product/mvp-spec.md`.

Completed UI Slices:
{slices_overview}

YOUR TASKS:
1. Wire the complete application inside `src/App.tsx` (wrapping with `DropProvider`, sticky campus navbar, view switching between Active Drop Storefront and My Orders / Pickup Pass, responsive Basket Drawer + `375px` mobile sticky bottom bar, and persistent collapsible Demo Controls bar).
2. Run `bash .agents/skills/splitbox-qa-gate/scripts/verify_offline_and_build.sh` and fix any TypeScript, import, CSS, stray `$`, or forbidden external asset URL error until the script exits 0.
3. Audit every checkbox in `.agents/skills/splitbox-qa-gate/SKILL.md` (`3/4 + 2` sequential split, cutoff partial auto-refund + `<QRCodeSVG />` + 4-digit PIN, `375px` layout, and contrast rules) and polish any visual rough edges.
4. Return a crisp verification summary.""",
    schema={"type": "string"},
    role="Integrator & QA Gate",
    type_name="self",
    model="inherit",
)

log("SplitBox build & QA gate passed!")
print(final_report)
