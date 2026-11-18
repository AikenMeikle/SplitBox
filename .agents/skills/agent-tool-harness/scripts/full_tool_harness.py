# Reusable run_workflow Full-Tool & Unified-Goal Hub Harness
# Ensures every spawned child agent runs as a full-capability main agent (type_name="self"),
# inherits the live `.agents/hub/SNAPSHOT.md` Unified Goal & Codebase Map pointers,
# pre-claims `owns` file slices in `.agents/hub/locks.json`, and follows the O(1) query + handoff protocol.

import os
import pathlib
import re
import sys

_ws_tuple = globals().get("WORKSPACES") or ()
WORKSPACE_ROOT = pathlib.Path(_ws_tuple[0] if _ws_tuple else os.getcwd()).resolve()
HUB_DIR = pathlib.Path(
    os.environ.get("SPLITBOX_HUB_DIR") or (WORKSPACE_ROOT / ".agents" / "hub")
).resolve()

_harness_dir = str(WORKSPACE_ROOT / "harness")
if _harness_dir not in sys.path:
    sys.path.insert(0, _harness_dir)

try:
    import agent_hub as _agent_hub
except Exception:
    _agent_hub = None


def _slugify_agent_id(role_name, index_num):
    slug = re.sub(r"[^a-z0-9]+", "-", str(role_name or "worker").lower()).strip("-")
    if not slug:
        slug = "worker"
    return f"{slug[:28]}-{index_num}"


def _normalize_owns_list(raw_owns):
    if not raw_owns:
        return []
    if isinstance(raw_owns, str):
        return [p.strip() for p in raw_owns.replace(",", " ").split() if p.strip()]
    result = []
    for item in raw_owns:
        for p in str(item).replace(",", " ").split():
            if p.strip() and p.strip() not in result:
                result.append(p.strip())
    return result


def _load_hub_snapshot_text():
    snap_path = HUB_DIR / "SNAPSHOT.md"
    if _agent_hub is not None and not snap_path.exists():
        try:
            _agent_hub.init_hub(hub_dir=HUB_DIR, workspace_root=WORKSPACE_ROOT)
        except Exception:
            pass
    if snap_path.exists():
        try:
            lines = snap_path.read_text(encoding="utf-8").strip().splitlines()
            if len(lines) > 72:
                lines = lines[:71] + ["_...(run `python3 harness/agent_hub.py brief` for full snapshot)..._"]
            return "\n".join(lines)
        except Exception:
            pass
    return (
        "Unified Goal: Deliver & maintain SplitBox — 100% offline UK university bulk-grocery & "
        "household-essentials pooling web app (£ GBP integer-pence math, sequential case-boundary "
        "allocation, cutoff auto-refunds, local SVG QR + 4-digit PIN pass, and 375px mobile layout)."
    )


HUB_SNAPSHOT_TEXT = _load_hub_snapshot_text()

TOOL_HARNESS_PREAMBLE = f"""[FULL-TOOL HARNESS ACTIVE]
You are running with full native Antigravity tool capabilities inherited (`type_name="self"`):
- File System: `read_file`, `write_file`, `edit_file`
- Shell & Daemons: `run_command`, `manage_task`
- Research & MCP: `search_web`, `list_resources`, `read_resource`
- Multi-Agent: `invoke_subagent` (use `TypeName="self"`), `define_subagent` (set `EnableWriteTools=True, EnableSubagentTools=True, EnableMCPTools=True`), `run_workflow`, `swarm`

Act directly using these tools without waiting for the prompt to name specific tools. Read `AGENTS.md` if needed.

[UNIFIED GOAL & HUB SNAPSHOT]
{HUB_SNAPSHOT_TEXT}

[WORKER COORDINATION PROTOCOL — ZERO-REDUNDANT-READ]
1. O(1) Context Lookup First: Do NOT cold-scan 20–30 source files! Read `.agents/hub/CODEBASE_MAP.md` or run `python3 harness/agent_hub.py query "<symbol_or_topic>"` to jump directly to exact `file#Lline` contracts.
2. File Ownership & Locks: Check active leases in `.agents/hub/locks.json` (`python3 harness/agent_hub.py locks`) before touching shared files outside your assigned slice.
3. Decisions & Handoff: Record non-obvious architectural decisions once via `python3 harness/agent_hub.py decision ...`, and on completion publish a handoff (`python3 harness/agent_hub.py handoff ...`) + release your locks (`python3 harness/agent_hub.py release ...`).
"""

raw_args = args if isinstance(args, dict) else {}
mode = raw_args.get("mode", "parallel")
tasks = raw_args.get("tasks", [])
default_model = raw_args.get("model", "inherit")

if not tasks:
    raise RuntimeError(
        "Pass Args={'mode': 'parallel'|'pipeline', 'tasks': [{'role': '...', 'agent_id': '...', 'owns': ['src/...'], 'prompt': '...'}]} to full_tool_harness.py"
    )

indexed_tasks = list(enumerate(tasks, 1))


async def spawn_full_tool_agent(indexed_item):
    idx, t = indexed_item
    role = t.get("role", f"Full-Tool Worker {idx}")
    agent_id = (t.get("agent_id") or "").strip() or _slugify_agent_id(role, idx)
    owns_paths = _normalize_owns_list(t.get("owns"))
    task_prompt = t["prompt"]
    model_tier = t.get("model", default_model)
    workspace_mode = t.get("workspace", "inherit")
    out_schema = t.get("schema", {"type": "string"})

    # Register worker & pre-claim `owns` paths in `.agents/hub/` before spawning
    # (Leave conversation_id="" so the parent workflow's CONVERSATION_ID does not block the child's PreToolUse hook)
    preclaimed = False
    if _agent_hub is not None:
        try:
            _agent_hub.register_agent(
                agent_id=agent_id,
                role=role,
                focus=f"Workflow task #{idx}",
                conversation_id="",
                hub_dir=HUB_DIR,
                workspace_root=WORKSPACE_ROOT,
            )
            if owns_paths:
                claim_res = _agent_hub.claim_locks(
                    agent_id=agent_id,
                    paths=owns_paths,
                    reason=f"Workflow ({mode}): {role}",
                    conversation_id="",
                    hub_dir=HUB_DIR,
                    workspace_root=WORKSPACE_ROOT,
                )
                preclaimed = bool(claim_res.get("ok"))
                if claim_res.get("conflict"):
                    log(f"[Hub Lock Notice] {agent_id} hit existing lock conflict on {owns_paths}: {claim_res.get('conflicts')}")
        except Exception as exc:
            log(f"[Hub Pre-Claim Warning] {agent_id}: {exc}")

    owns_csv = ", ".join(owns_paths)
    if owns_paths:
        ownership_section = f"""## Worker Hub Identity & Exclusive Slice Ownership
- **Hub Agent ID:** `{agent_id}` (`{role}`)
- **Pre-Claimed Exclusive Paths (`owns`):** `{owns_csv}` (already claimed in `.agents/hub/locks.json` for `{agent_id}`)
- **Strict Boundary:** Edit ONLY files matching `{owns_csv}`. Do NOT edit files outside your owned slice without checking `python3 harness/agent_hub.py locks` and coordinating via `post`.
- **Fast Context:** Run `python3 harness/agent_hub.py query "<topic>"` instead of scanning the full repo.
- **Required Completion Step:** Before calling `finish`, run:
  `python3 harness/agent_hub.py handoff --from {agent_id} --summary "<concise summary>" --files "{owns_csv}" --next "<follow-up or ready for QA>"`
  and `python3 harness/agent_hub.py release --agent {agent_id} --all`."""
    else:
        ownership_section = f"""## Worker Hub Identity & Coordination
- **Hub Agent ID:** `{agent_id}` (`{role}`)
- **Fast Context:** Run `python3 harness/agent_hub.py query "<topic>"` (or inspect `.agents/hub/CODEBASE_MAP.md`) instead of full-repo scanning.
- **Locks & Handoff:** Claim files before editing (`python3 harness/agent_hub.py claim --agent {agent_id} --paths "<paths>" --reason "{role}"`), then on completion run `python3 harness/agent_hub.py handoff --from {agent_id} --summary "<concise summary>" --files "<edited_files>"` and `python3 harness/agent_hub.py release --agent {agent_id} --all`."""

    composed_prompt = f"{TOOL_HARNESS_PREAMBLE}\n{ownership_section}\n\n## Assigned Task\n{task_prompt}"

    try:
        return await agent(
            prompt=composed_prompt,
            schema=out_schema,
            role=role,
            type_name="self",
            workspace=workspace_mode,
            model=model_tier,
        )
    finally:
        if preclaimed and _agent_hub is not None:
            try:
                _agent_hub.release_locks(
                    agent_id=agent_id,
                    release_all=True,
                    hub_dir=HUB_DIR,
                    workspace_root=WORKSPACE_ROOT,
                )
            except Exception:
                pass


phase(f"Executing {len(indexed_tasks)} Hub-Coordinated Full-Tool Agent(s) ({mode})")
if mode == "pipeline":
    results = await pipeline(indexed_tasks, spawn_full_tool_agent)
else:
    results = await parallel(indexed_tasks, spawn_full_tool_agent)

for idx, res in enumerate(results, 1):
    log(f"[Agent {idx}] {res}")

print({"completed": len(results), "results": results})
