---
name: agent-tool-harness
description: >-
  Full-tool agent harness ensuring spawned subagents, custom agents, workflow
  workers, and SDK agents automatically receive write, edit, terminal command,
  task, MCP, and orchestration tools plus automatic SplitBox Unified Goal,
  O(1) Codebase Map, and file-lock/handoff hub coordination. MUST read before
  spawning subagents, defining custom agents, or writing workflows.
---

# Full-Tool Agent Harness & Hub Lifecycle Integration (`/agent-tool-harness`)

By default in Antigravity, several agent-spawning paths restrict tools to **read-only** AND start each worker cold without shared project state:
- Custom `.agents/agents/*.md` files **without** a `tools:` list only get a small read-only toolset.
- `define_subagent` **without** `EnableWriteTools=true` cannot write files or run shell commands.
- `invoke_subagent(TypeName="research")` runs in a **read-only, no-network** sandbox.
- Python SDK `LocalAgentConfig()` runs in **read-only** mode unless `CapabilitiesConfig()` is passed.
- Uncoordinated workers waste turns re-reading 25–30 files or stepping on peer file edits.

This harness removes all of those failure modes so every agent automatically gets **full tool capabilities** AND **live Unified Goal, O(1) Codebase Map, and File Lock / Handoff Bus coordination**.

---

## 1. Automatic Antigravity Lifecycle Hooks (`.agents/hooks.json` & `harness/hub_hooks.py`)

Every Antigravity session in this workspace runs three fast (<100ms, fail-open) hooks configured in [hooks.json](../../hooks.json) backed by [hub_hooks.py](../../../harness/hub_hooks.py):

| Hook Event | Matcher | Automatic Behavior |
| :--- | :--- | :--- |
| **`SessionStart`** | *(session init)* | Registers/touches the session in `.agents/hub/agents.json` and injects a compact (`<= 90` lines) `[SPLITBOX UNIFIED GOAL & AGENT HUB]` system message containing `SNAPSHOT.md`, unread peer handoffs/broadcasts, `.agents/hub/CODEBASE_MAP.md`, and `python3 harness/agent_hub.py query "<topic>"` pointers. |
| **`PreToolUse`** | `write_file\|edit_file` | Checks `.agents/hub/locks.json`. Blocks (`"decision": "deny"`) **only** if a path inside the workspace has an unexpired lock held by a **different** `conversationId` or `SPLITBOX_AGENT_ID`; returns `"allow"` when unlocked/self-owned inside workspace, and `"ask"` for paths outside workspace root. |
| **`PostToolUse`** | `write_file\|edit_file` | Incrementally updates `.agents/hub/CODEBASE_MAP.md` & `codebase_index.json` via `codebase_indexer.update_single_file`, appends a 60s-deduplicated `file_modified` event to `.agents/hub/events.jsonl`, and refreshes `SNAPSHOT.md`. |

> **Fail-Open Safety:** `hub_hooks.py` wraps its entire entrypoint in a top-level `try ... except Exception:` returning safe fallback JSON (`{"decision": "allow"}` for `PreToolUse`, `{}` otherwise) and exiting `0` so a hook error can never break any agent tool call. Set `SPLITBOX_HUB_DIR=/tmp/...` to isolate hook state in tests.

---

## 2. Pre-Wired Full-Tool Custom Agents (`.agents/agents/`)

Three workspace agents are pre-configured with explicit full `tools:` grants (`read_file`, `write_file`, `edit_file`, `run_command`, `manage_task`, `invoke_subagent`, `define_subagent`, `run_workflow`, `swarm`, etc.):
- [splitbox-manager.md](../../agents/splitbox-manager.md) (`splitbox-manager`)
- [splitbox-builder.md](../../agents/splitbox-builder.md) (`splitbox-builder`)
- [splitbox-qa.md](../../agents/splitbox-qa.md) (`splitbox-qa`)

---

## 3. Spawning Subagents & Workflows With Full Tools + Hub Coordination

### Option A: `run_workflow` Lock-Aware Harness Script (Recommended for Multi-Agent Pipelines)
Use [scripts/full_tool_harness.py](./scripts/full_tool_harness.py) via `run_workflow`. Before spawning workers, it dynamically reads `.agents/hub/SNAPSHOT.md` into `TOOL_HARNESS_PREAMBLE`, pre-registers each worker (`agent_id`), pre-claims optional `owns` file slices in `.agents/hub/locks.json`, instructs workers to use `python3 harness/agent_hub.py query "<topic>"` + `handoff` + `release`, and cleans up any remaining locks on task completion:

```python
run_workflow(
    ScriptPath="/home/hacksday/Documents/project/.agents/skills/agent-tool-harness/scripts/full_tool_harness.py",
    Args={
        "mode": "parallel",
        "tasks": [
            {
                "role": "Storefront Slice Builder",
                "agent_id": "builder-storefront",
                "owns": ["src/components/storefront/*"],
                "prompt": "Add dietary filter chips to the active drop catalog grid."
            },
            {
                "role": "Basket Slice Builder",
                "agent_id": "builder-basket",
                "owns": ["src/components/basket/*"],
                "prompt": "Refine cross-box split receipt preview in BasketDrawer."
            }
        ]
    },
    Description="Run lock-coordinated parallel UI tasks via Full-Tool Agent Harness"
)
```

### Option B: Direct `invoke_subagent` (Single Background Agent)
Always pass `TypeName="self"` (or `"splitbox-builder"`), **never** `"research"` when edits or commands are needed, and specify owned paths + `agent_hub.py` handoff expectations in `Prompt`:
```json
{
  "TypeName": "self",
  "Role": "Full-Tool Feature Builder",
  "Prompt": "Orient via `python3 harness/agent_hub.py brief --agent builder-1` and `query`, claim your target files, implement the change, and run `agent_hub.py handoff` + `release`."
}
```

### Option C: Dynamic `define_subagent`
Always set all three capability flags to `true`:
```json
{
  "Name": "custom-worker",
  "Description": "Full-capability hub-coordinated worker",
  "SystemPrompt": "You have full read/write/command/MCP/subagent access. Orient via .agents/hub/SNAPSHOT.md and agent_hub.py query before editing.",
  "EnableWriteTools": true,
  "EnableSubagentTools": true,
  "EnableMCPTools": true
}
```

### Option D: Native Swarm (`swarm`)
Workers added via `swarm(action="add", name="...", brief="...")` automatically inherit full read/write/command tools and trigger `SessionStart` / `PreToolUse` / `PostToolUse` hooks. Pair live `@peer` board messages with `agent_hub.py decision` / `handoff` entries so outcomes persist across sessions.

### Option E: Standalone Python SDK (`harness/sdk_agent_harness.py`)
Run [sdk_agent_harness.py](../../../harness/sdk_agent_harness.py) with `--agent-id` and `--role`. It passes `CapabilitiesConfig()` to unlock write/terminal tools, registers the agent in `.agents/hub/agents.json`, and loads `.agents/hub/SNAPSHOT.md` + `AGENTS.md` + `agent_hub.py` instructions into `system_instructions`:
```bash
python3 harness/sdk_agent_harness.py --agent-id sdk-builder --role "SDK Slice Builder" "Update pickup pass copy"
python3 harness/sdk_agent_harness.py --agent-id sdk-lead --role "Tech Lead" --interactive
```

---

## 4. Non-Interactive Background Command Execution Note

Background `run_workflow` agents cannot display interactive approval popups to the user—any `run_command` requiring interactive approval will be denied unless pre-permitted in Antigravity UI (**Settings → Tool Execution Policy → `Always Proceed` or `Proceed in Sandbox`**). If a background workflow hits a command approval block, either run the command from the top-level chat agent, use `invoke_subagent(TypeName="self")` / `swarm`, or switch the project's Auto-Execution Policy in Settings.
