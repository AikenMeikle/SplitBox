# Divly — GitHub Copilot Instructions

Auto-loaded for GitHub Copilot (available free via `@student.bham.ac.uk` GitHub Student Developer Pack). Before editing files, check **[AGENTS.md](../AGENTS.md)** for the full TypeScript + REST/SSE contract and **[STUDENT_DEV_GUIDE.md](../STUDENT_DEV_GUIDE.md)** for the codebase map and core algorithm walkthroughs. For campus launch operations, see **[LAUNCH_IN_14_DAYS.md](../LAUNCH_IN_14_DAYS.md)**.

## Non-Negotiable Coding Guardrails
- **Zero Public Competitor Names:** Never show `"Aldi"` or any competing supermarket brand name in student-facing UI, seed unit labels, or flyers (`"Save X% vs Supermarkets"` / `"Supermarket equiv."` only). Internal TypeScript field names (`aldiPricePence`, `aldiUnitLabel`) and Admin-only benchmarking labels are fine.
- **Integer GBP Pence (`£`) Everywhere:** Store and calculate all currency in whole GBP pence (`number`, never floats). Format only in UI via `formatPence(pence)` from `src/shared/types.ts`.
- **Single-Repo Node 22 + SQLite Architecture:** Backend in `server/` (`tsx` + Express + built-in `node:sqlite` in WAL mode at `data/divly.sqlite`); Frontend in `src/` (React 19 + TypeScript + Tailwind CSS v4). Keep files concise (~150–320 lines) and clearly commented.
- **Clean Modern Grocery UI:** Crisp `#F9FAFB` / `#FFFFFF` surfaces, `1px solid #E5E7EB` borders, soft shadows, and `#059669` emerald accents. No neo-brutalist black borders or offset shadows.

## Verification Commands
- Start local dev (`:3001` API + `:5173` Vite): `npm run dev`
- Typecheck, tests & production build: `npx tsc -b && npm test && npm run build`
