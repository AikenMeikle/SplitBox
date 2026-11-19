# CLAUDE.md — Coding Assistant Entry Point

Welcome! If you are an AI coding assistant (Claude Code, Cursor, GitHub Copilot, Codex, or Antigravity) or a developer opening this repository, read these files first:

1. **[AGENTS.md](./AGENTS.md)** — Authoritative technical specification, canonical TypeScript interfaces (`src/shared/types.ts`), REST + SSE API contract (`/api/*`), integer GBP pence rules, and clean modern grocery UI guidelines.
2. **[STUDENT_DEV_GUIDE.md](./STUDENT_DEV_GUIDE.md)** — Plain-English developer handbook written for a 1st-year CS student, including a file-by-file codebase map, walkthroughs of the core backend/realtime algorithms, and copy-paste operational & deployment recipes.
3. **[LAUNCH_IN_14_DAYS.md](./LAUNCH_IN_14_DAYS.md)** — Day 1 → Day 14 University of Birmingham campus launch checklist (council registration, Stripe Apple Pay, Resend DNS, wholesale accounts, `/flyer.html` hall posters, Wednesday cutoff, and Saturday hub handover).

## Non-Negotiable Ground Rules
- **Zero Public Competitor Names:** Never display `"Aldi"` or competing supermarket names in student-facing UI, seeded `aldiUnitLabel` values, or flyers (use `"Save X% vs Supermarkets"` / `"Supermarket equiv."`). Internal TypeScript property identifiers (`aldiPricePence`, `aldiUnitLabel`) and Admin-only benchmarking labels are fine.
- **Money is always integer GBP pence (`number`)**: Never use floating-point pounds in database columns, API payloads, or React calculations. Format at display time using `formatPence(pence)` from `src/shared/types.ts`.
- **Single-repo full-stack architecture**: Node.js 22 (`tsx` + Express + built-in `node:sqlite` in WAL mode) in `server/`, React 19 + TypeScript + Tailwind CSS v4 in `src/`.
- **Commands**: `npm run dev` (dev `:3001` + `:5173`), `npm test` (backend test suite), `npm run build && npm start` (prod `:3000`).
