# CLAUDE.md — Coding Assistant Entry Point

Welcome! If you are an AI coding assistant (Claude Code, Cursor, GitHub Copilot, Codex, or Antigravity) or a developer opening this repository, read these two files first:

1. **[AGENTS.md](./AGENTS.md)** — Authoritative technical specification, canonical TypeScript interfaces (`src/shared/types.ts`), REST + SSE API contract (`/api/*`), integer GBP pence rules, and clean modern grocery UI guidelines.
2. **[STUDENT_DEV_GUIDE.md](./STUDENT_DEV_GUIDE.md)** — Plain-English developer handbook written for a 1st-year CS student, including a file-by-file codebase map, walkthroughs of the 4 core backend/realtime algorithms, and step-by-step operational & deployment recipes.

## Non-Negotiable Ground Rules
- **Money is always integer GBP pence (`number`)**: Never use floating-point pounds in database columns, API payloads, or React calculations. Format at display time using `formatPence(pence)` from `src/shared/types.ts`.
- **Single-repo full-stack architecture**: Node.js 22 (`tsx` + Express + built-in `node:sqlite` in WAL mode) in `server/`, React 19 + TypeScript + Tailwind CSS v4 in `src/`.
- **Clean grocery design**: Keep crisp light surfaces (`#F9FAFB` / `#FFFFFF`), subtle `1px solid #E5E7EB` borders, and `#059669` emerald accents. Keep files modular (~150–350 lines) and clearly commented.
- **Commands**:
  - `npm run dev` — Start Express API (`:3001`) + Vite HMR frontend (`:5173`)
  - `npm test` — Run backend concurrency, settlement refund & HMAC QR security tests
  - `npm run build && npm start` — Build `dist/` and serve full production app on `:3000`
