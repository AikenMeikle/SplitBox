#!/usr/bin/env python3
"""
Standalone Google Antigravity Python SDK Full-Tool & Unified-Goal Hub Harness.

In the `google-antigravity` Python SDK, `LocalAgentConfig` defaults to READ-ONLY mode
unless `capabilities=CapabilitiesConfig()` is explicitly supplied. This CLI wrapper
boots an Antigravity agent in the current workspace with:
  1. Full write, edit, and command execution capabilities (`CapabilitiesConfig()`).
  2. Automatic registration in `.agents/hub/agents.json` (`--agent-id`, `--role`).
  3. Live `.agents/hub/SNAPSHOT.md` + `AGENTS.md` + `agent_hub.py` coordination protocol
     injected directly into `system_instructions`.

Usage:
  pip install google-antigravity
  python3 harness/sdk_agent_harness.py --agent-id builder-ui --role "UI Slice Engineer" "Build BasketDrawer"
  python3 harness/sdk_agent_harness.py --agent-id manager-1 --role "Lead Manager" --interactive
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import io
import os
import pathlib
import sys
from typing import Any

HARNESS_DIR = pathlib.Path(__file__).resolve().parent
WORKSPACE_ROOT = HARNESS_DIR.parent

if str(HARNESS_DIR) not in sys.path:
    sys.path.insert(0, str(HARNESS_DIR))


def resolve_hub_dir(hub_dir: pathlib.Path | str | None = None) -> pathlib.Path:
    if hub_dir is not None and str(hub_dir).strip():
        return pathlib.Path(hub_dir).resolve()
    env_hub = os.environ.get("SPLITBOX_HUB_DIR", "").strip()
    if env_hub:
        return pathlib.Path(env_hub).resolve()
    return (WORKSPACE_ROOT / ".agents" / "hub").resolve()


def _load_agent_hub() -> Any | None:
    try:
        import agent_hub  # type: ignore

        return agent_hub
    except Exception:
        return None


def load_workspace_rules(workspace_root: pathlib.Path | None = None) -> str:
    ws_root = (workspace_root or WORKSPACE_ROOT).resolve()
    agents_md = ws_root / "AGENTS.md"
    if agents_md.exists():
        return agents_md.read_text(encoding="utf-8")
    return "You have full read, write, edit, and terminal command execution tools."


def register_sdk_agent(
    agent_id: str,
    role: str,
    focus: str = "",
    hub_dir: pathlib.Path | str | None = None,
) -> dict[str, Any] | None:
    eff_hub = resolve_hub_dir(hub_dir)
    os.environ["SPLITBOX_AGENT_ID"] = agent_id
    os.environ.setdefault("SPLITBOX_HUB_DIR", str(eff_hub))

    hub_mod = _load_agent_hub()
    if hub_mod is not None and hasattr(hub_mod, "register_agent"):
        with contextlib.redirect_stdout(io.StringIO()):
            return hub_mod.register_agent(
                agent_id=agent_id,
                role=role,
                focus=focus or "SDK agent session",
                hub_dir=eff_hub,
                workspace_root=WORKSPACE_ROOT,
            )
    return None


def load_hub_snapshot(hub_dir: pathlib.Path | str | None = None) -> str:
    eff_hub = resolve_hub_dir(hub_dir)
    snap_path = eff_hub / "SNAPSHOT.md"
    hub_mod = _load_agent_hub()

    if not snap_path.exists() and hub_mod is not None and hasattr(hub_mod, "init_hub"):
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                hub_mod.init_hub(hub_dir=eff_hub, workspace_root=WORKSPACE_ROOT)
        except Exception:
            pass

    if snap_path.exists():
        return snap_path.read_text(encoding="utf-8").strip()

    return (
        "# SplitBox — Unified Goal Snapshot\n"
        "Deliver & maintain SplitBox — a 100% offline UK university bulk-grocery & "
        "household-essentials pooling web app (£ GBP integer-pence math, sequential case "
        "allocation, cutoff auto-refunds, local SVG QR + 4-digit PIN pass, and 375px layout)."
    )


def build_system_instructions(
    agent_id: str = "sdk-agent",
    role: str = "Full-Tool SDK Engineer",
    hub_dir: pathlib.Path | str | None = None,
) -> str:
    snapshot_text = load_hub_snapshot(hub_dir)
    rules_text = load_workspace_rules()

    hub_protocol = f"""## SplitBox Multi-Agent Hub & O(1) Codebase Protocol
- **Your Registered Hub Identity:** `agent_id="{agent_id}"` | `role="{role}"`
- **O(1) Codebase Navigation (Skip Cold-Scanning 30 Files):** Read `.agents/hub/CODEBASE_MAP.md` or run `python3 harness/agent_hub.py query "<symbol_or_topic>"` to jump straight to `file#Lline` contracts.
- **Check Inbox & Brief:** `python3 harness/agent_hub.py brief --agent {agent_id}` and `python3 harness/agent_hub.py inbox --agent {agent_id} --ack`
- **Claim File Slices Before Editing:** `python3 harness/agent_hub.py claim --agent {agent_id} --paths "<files_or_globs>" --reason "<task>"`
- **Record Decisions & Handoffs:** Share architectural decisions via `python3 harness/agent_hub.py decision --author {agent_id} ...`, publish work handoffs via `python3 harness/agent_hub.py handoff --from {agent_id} --summary "..." --files "..." --next "..."`, and release locks via `python3 harness/agent_hub.py release --agent {agent_id} --all`.
"""

    return (
        "You are a full-capability Antigravity engineering agent with all read, write, "
        "edit, command execution, and orchestration tools unlocked.\n\n"
        f"[SPLITBOX UNIFIED GOAL & HUB SNAPSHOT]\n{snapshot_text}\n\n"
        f"{hub_protocol}\n"
        f"{rules_text}"
    )


async def run_harness(
    prompt: str | None,
    interactive: bool,
    agent_id: str = "sdk-agent",
    role: str = "Full-Tool SDK Engineer",
    hub_dir: pathlib.Path | str | None = None,
    dry_run: bool = False,
) -> None:
    focus = (prompt[:100] if prompt else "Interactive SDK session")
    register_sdk_agent(agent_id=agent_id, role=role, focus=focus, hub_dir=hub_dir)
    system_instructions = build_system_instructions(agent_id=agent_id, role=role, hub_dir=hub_dir)

    if dry_run:
        print(system_instructions)
        return

    try:
        from google.antigravity import Agent, CapabilitiesConfig, LocalAgentConfig
        from google.antigravity.utils.interactive import run_interactive_loop
    except ImportError:
        sys.stderr.write(
            "Error: `google-antigravity` Python SDK is not installed in this Python environment.\n"
            "Install it with: pip install google-antigravity\n"
            "(Inside the Antigravity IDE / 2.0 App, use `.agents/skills/agent-tool-harness/` instead.)\n"
        )
        sys.exit(1)

    # CapabilitiesConfig() explicitly unlocks write_file, edit_file, run_command, etc.
    config = LocalAgentConfig(
        system_instructions=system_instructions,
        capabilities=CapabilitiesConfig(),
    )

    async with Agent(config) as agy_agent:
        if interactive or not prompt:
            await run_interactive_loop(agy_agent)
            return

        response = await agy_agent.chat(prompt)
        async for call in response.tool_calls:
            print(f"\n[Tool] {call.name}({call.args})", file=sys.stderr)
        async for token in response:
            sys.stdout.write(token)
            sys.stdout.flush()
        print()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Full-Tool Antigravity SDK Agent Harness")
    parser.add_argument("prompt", nargs="?", help="Task prompt for the full-tool agent")
    parser.add_argument(
        "-i", "--interactive", action="store_true", help="Start an interactive full-tool session"
    )
    parser.add_argument(
        "--agent-id",
        default=os.environ.get("SPLITBOX_AGENT_ID", "").strip() or "sdk-agent",
        help="Agent ID registered in .agents/hub/agents.json (default: sdk-agent)",
    )
    parser.add_argument(
        "--role",
        default="Full-Tool SDK Engineer",
        help="Agent role registered in .agents/hub/agents.json",
    )
    parser.add_argument(
        "--hub-dir",
        default=None,
        help="Optional override for .agents/hub directory (defaults to SPLITBOX_HUB_DIR or .agents/hub)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Register agent in hub, print composed system_instructions, and exit without starting SDK runtime",
    )
    return parser


def main() -> None:
    parsed = build_parser().parse_args()
    asyncio.run(
        run_harness(
            prompt=parsed.prompt,
            interactive=parsed.interactive,
            agent_id=parsed.agent_id,
            role=parsed.role,
            hub_dir=parsed.hub_dir,
            dry_run=parsed.dry_run,
        )
    )


if __name__ == "__main__":
    main()
