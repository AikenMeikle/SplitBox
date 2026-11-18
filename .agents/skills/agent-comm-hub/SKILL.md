---
name: agent-comm-hub
description: >-
  Multi-agent communication bus, Unified Goal tracker, O(1) codebase context
  indexer, file-slice lock protocol, and handoff workflow eliminating redundant
  file reads and edit collisions across main agents, subagents, workflows, and swarms.
---

# SplitBox Multi-Agent Communication & Unified Goal Hub (`/agent-comm-hub`)

Every agent working in `/home/hacksday/Documents/project`—whether a main IDE session, `invoke_subagent` worker, `run_workflow` slice builder, Native `/swarm` member, or standalone SDK agent—shares a persistent, `flock`-safe coordination bus in `.agents/hub/` backed by `harness/agent_hub.py`, `harness/codebase_indexer.py`, and `.agents/hooks.json`.

---

## 1. Zero-Redundant-Read Agent Workflow (4 Mandatory Steps)

### Step 1: Orient in 1 Step (Never Scan 30 Files Cold)
- Read `.agents/hub/SNAPSHOT.md` + `.agents/hub/CODEBASE_MAP.md` (already auto-injected at `SessionStart` via `.agents/hooks.json`), or run:
  ```bash
  python3 harness/agent_hub.py brief --agent <name>
  python3 harness/agent_hub.py query "<symbol_or_feature>"
  ```
- Inspect **only** the exact target files and line ranges (`path#Lline`) returned by `query` (e.g., `DropContext`, `SliceMeter`, `CatalogItem`, `--sb-bg`) instead of scanning `src/` from scratch.

### Step 2: Align on Unified Goal & Claim File Slices
- Check current milestones and active file leases (`goal show` / `locks`), then register your agent and claim disjoint file slices before editing:
  ```bash
  python3 harness/agent_hub.py goal show
  python3 harness/agent_hub.py locks
  python3 harness/agent_hub.py register --agent <name> --role "<role>" --focus "<task>"
  python3 harness/agent_hub.py claim --agent <name> --paths "<files_or_globs>" --reason "<task>"
  ```
- `PreToolUse` hooks (`harness/hub_hooks.py`) automatically guard `write_file` and `edit_file` against overlapping unexpired locks held by another session or agent.

### Step 3: Communicate Decisions & Cross-Agent Dependencies
- Record non-obvious architectural, schema, or spec resolutions **once** via `decision` so no future agent re-researches them:
  ```bash
  python3 harness/agent_hub.py decision --author <name> --title "<title>" \
    --summary "<resolution>" --rationale "<why>" --tags "<csv>"
  ```
- Coordinate with peers asynchronously via `post` and `inbox`:
  ```bash
  python3 harness/agent_hub.py post --from <me> --to <peer|all> --msg "<update_or_question>" --files "<csv>"
  python3 harness/agent_hub.py inbox --agent <me> --ack
  ```
- **Native `/swarm` Bridge:** When operating inside a Native `/swarm`, pair live `@peer` swarm board wakeups (`post_message`) with persistent `agent_hub.py decision` / `handoff` entries so cross-session IDE agents, `run_workflow` pipelines, and verifiers inherit swarm outcomes automatically.

### Step 4: Handoff & Release
- When your slice is verified, record a structured `handoff` and release all claimed locks:
  ```bash
  python3 harness/agent_hub.py handoff --from <name> --to <peer|all> \
    --summary "<what_changed>" --files "<csv>" --next "<follow_up>"
  python3 harness/agent_hub.py release --agent <name> --all
  ```
- `PostToolUse` hooks automatically run incremental `codebase_indexer.update_single_file(Path)` and refresh `CODEBASE_MAP.md` + `SNAPSHOT.md` on every workspace `write_file` / `edit_file`.

---

## 2. CLI Cheat Sheet (`agent_hub.py` & `codebase_indexer.py`)

All commands accept `--json` and `--hub-dir <path>` (or env `SPLITBOX_HUB_DIR` for isolated tests; defaults to `.agents/hub`).

### `harness/agent_hub.py` Commands

| Action | Command | Purpose |
| :--- | :--- | :--- |
| **Bootstrap** | `python3 harness/agent_hub.py init` | Idempotently seeds `.agents/hub/*.json(l)` & `SNAPSHOT.md`. |
| **1-Step Brief** | `python3 harness/agent_hub.py brief [--agent <id>] [--compact]` | Prints `SNAPSHOT.md` + unread inbox items for `<id>` / `all`. |
| **View Goal** | `python3 harness/agent_hub.py goal show` | Displays the Unified Goal, invariants, and 5 acceptance gates. |
| **Update Goal** | `python3 harness/agent_hub.py goal set --title "<t>" --summary "<s>"` | Updates top-level Unified Goal metadata. |
| **Milestones** | `python3 harness/agent_hub.py goal milestone --id <id> --status <todo\|in_progress\|review\|done\|blocked> [--owner <id>] [--note "<text>"]` | Updates milestone/gate ownership and progress status. |
| **Register** | `python3 harness/agent_hub.py register --agent <id> --role "<role>" [--focus "<text>"] [--conv <cid>]` | Registers/heartbeats an agent in `agents.json` (`agents` lists all). |
| **Claim Locks** | `python3 harness/agent_hub.py claim --agent <id> --paths "<paths_or_globs>" [--reason "<text>"] [--ttl 45]` | Acquires TTL-bounded exclusive file/glob slice leases. |
| **Check / List** | `python3 harness/agent_hub.py locks` / `check-lock --path <path> [--agent <id>] [--conv <cid>]` | Lists active leases; `check-lock` exits `0` if safe, `2` if locked by another agent. |
| **Release** | `python3 harness/agent_hub.py release --agent <id> [--paths "<paths>" \| --all]` | Releases specific paths or all locks held by `<id>`. |
| **Record Decision** | `python3 harness/agent_hub.py decision --author <id> --title "<t>" --summary "<s>" [--rationale "<r>"] [--tags "<csv>"]` | Persists architectural/spec decision (`decisions` lists all). |
| **Message Bus** | `python3 harness/agent_hub.py post --from <id> [--to <peer\|all>] [--channel main] --msg "<text>" [--files "<csv>"]` | Posts a targeted or broadcast event to `events.jsonl`. |
| **Inbox & Board** | `python3 harness/agent_hub.py inbox --agent <id> [--since <seq>] [--ack]` / `board [--limit 20]` | Reads unread messages (advancing cursor with `--ack`) or recent board feed. |
| **Handoff** | `python3 harness/agent_hub.py handoff --from <id> [--to <peer\|all>] --summary "<s>" [--files "<csv>"] [--next "<n>"]` | Logs completed slice summary, touched files, and next actions. |
| **Symbol Query** | `python3 harness/agent_hub.py query "<terms>" [--limit 8]` / `reindex` | Queries `codebase_index.json` for `file#Lline` contracts or rebuilds index. |

### `harness/codebase_indexer.py` & `npm run hub:*` Shortcuts

| Command | Equivalent / Behavior |
| :--- | :--- |
| `python3 harness/codebase_indexer.py build [--json]` | Full scan (<100ms) writing `codebase_index.json` & `CODEBASE_MAP.md` (`npm run hub:index`). |
| `python3 harness/codebase_indexer.py update <file_path>` | Incremental (<50ms) single-file update & atomic `CODEBASE_MAP.md` re-render. |
| `python3 harness/codebase_indexer.py query "<terms>" [--limit 8]` | Ranked search across TS/TSX exports, React props, `--sb-*` CSS tokens, and spec headings. |
| `npm run hub:brief` / `npm run hub:board` / `npm run hub:locks` | Quick npm aliases for `brief`, `board`, and `locks` (`npm run hub -- <subcommand>` for full CLI). |
| `npm run hub:test` | Runs `python3 -m unittest discover -s tests -p 'test_*.py' -v` in isolated temp hub dirs. |

---

## 3. Lifecycle Hooks & Harness Integration

- **`.agents/hooks.json` + `harness/hub_hooks.py`**:
  - `SessionStart`: Injects `[SPLITBOX UNIFIED GOAL & AGENT HUB]` (`SNAPSHOT.md`, unread handoffs, and `CODEBASE_MAP.md` pointer) into every new conversation automatically.
  - `PreToolUse` (`write_file|edit_file`): Denies conflicting edits to workspace paths locked by another active `conversationId` / `agent_id`.
  - `PostToolUse` (`write_file|edit_file`): Incrementally updates `codebase_index.json` + `CODEBASE_MAP.md`, logs deduplicated `file_modified` events, and regenerates `SNAPSHOT.md`.
- **`full_tool_harness.py` & `sdk_agent_harness.py`**:
  - Pass `"owns": ["src/components/basket/*"]` and `"agent_id"` in workflow task dicts to pre-claim slices and auto-inject `SNAPSHOT.md` into spawned workers.
