#!/usr/bin/env python3
"""
Antigravity Lifecycle Hook Dispatcher for SplitBox Multi-Agent Hub.

Handles three fast (<100ms) lifecycle events configured in `.agents/hooks.json`:
  - `SessionStart`: Registers/touches session in `.agents/hub/agents.json` and injects
    a compact (<= 90 lines) `[SPLITBOX UNIFIED GOAL & AGENT HUB]` system message with
    `SNAPSHOT.md`, unread handoffs/broadcasts, and `.agents/hub/CODEBASE_MAP.md` pointers.
  - `PreToolUse` (`write_file|edit_file`): Enforces `.agents/hub/locks.json` leases across
    distinct `conversationId` / `SPLITBOX_AGENT_ID` sessions (`deny` on foreign active lock,
    `allow` inside workspace when unlocked/self-owned, `ask` outside workspace root).
  - `PostToolUse` (`write_file|edit_file`): Incrementally updates `CODEBASE_MAP.md` &
    `codebase_index.json` via `codebase_indexer.update_single_file`, records 60s-deduped
    `file_modified` events in `.agents/hub/events.jsonl`, and refreshes `SNAPSHOT.md`.

Fail-open guarantee: The entire entrypoint is wrapped in `try ... except Exception:`
so any unexpected error emits safe fallback JSON and exits `0`.
"""

from __future__ import annotations

import contextlib
import datetime as dt
import fcntl
import fnmatch
import inspect
import io
import json
import os
import pathlib
import sys
import tempfile
from typing import Any

HARNESS_DIR = pathlib.Path(__file__).resolve().parent
DEFAULT_WORKSPACE_ROOT = HARNESS_DIR.parent

if str(HARNESS_DIR) not in sys.path:
    sys.path.insert(0, str(HARNESS_DIR))


DEFAULT_UNIFIED_GOAL_BLOCK = """# PalletCut (SplitBox Repo) — Unified Goal & Multi-Agent Snapshot
## 1. Unified Goal & Invariants
**Goal:** Deliver & maintain PalletCut (formerly SplitBox) — Dual-Mode (100% offline Demo Mode + Supabase/Stripe Live Mode) tactile light-mode UoB bulk-grocery & household-essentials pooling web app (1 active launch hub Vale · Shackleton + 3 coming_soon vote hubs, £ GBP integer-pence sequential FCFS case allocation, £0.00 crate fee >= £9.00 / £0.39 < £9.00, Card Pre-Authorisation Hold cutoff settlement, SVG QR + 4-digit PIN pickup pass, and 375px mobile layout).
- Zero External Asset CDNs: Bundled @fontsource fonts, local palletcut-*.svg assets, and local qrcode.react SVG in both Demo and Live modes.
- UoB Drop #1 Hub & GBP (£) Fee Rules: 1 active launch hub (Vale · Shackleton; other 3 UoB hubs coming_soon votes), £0.00 crate fee at >= £9.00 (£0.39 micro-crate fee < £9.00), integer-pence math, Card Pre-Authorisation Hold copy.
- Chronological Sequential Case Allocation: Strictly first-come-first-served across Box #1, Box #2, ... with <100% overflow auto-released at Wednesday 23:59 cutoff.
- Tactile Citrus-Crate Craft (Kept for Launch): #F7FAF8 canvas, 1.5px–2px #0B241C borders, 3px 3px 0px #0B241C hard shadows, radial SVG <SliceMeter /> only, #0B241C ink on #10D48E mint & #FF6B1A tangerine.
"""


def _utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _iso_utc(value: dt.datetime | None = None) -> str:
    ts = value or _utc_now()
    return ts.astimezone(dt.timezone.utc).replace(microsecond=0).isoformat()


def _parse_iso(value: str) -> dt.datetime | None:
    if not value:
        return None
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone.utc)
        return parsed.astimezone(dt.timezone.utc)
    except ValueError:
        return None


def _is_within(child: pathlib.Path, parent: pathlib.Path) -> bool:
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


def _resolve_workspace_root(payload: dict[str, Any]) -> pathlib.Path:
    ws_paths = payload.get("workspacePaths")
    if isinstance(ws_paths, list) and ws_paths:
        first = str(ws_paths[0] or "").strip()
        if first:
            return pathlib.Path(os.path.realpath(first))
    env_ws = os.environ.get("SPLITBOX_WORKSPACE_ROOT", "").strip()
    if env_ws:
        return pathlib.Path(os.path.realpath(env_ws))
    cwd_val = str(payload.get("cwd") or "").strip()
    if cwd_val:
        cwd_real = pathlib.Path(os.path.realpath(cwd_val))
        # When hooks execute without workspacePaths, avoid treating `.agents/` itself as workspace root
        if cwd_real.name == ".agents" and (cwd_real.parent / "AGENTS.md").exists():
            return cwd_real.parent
        return cwd_real
    return pathlib.Path(os.path.realpath(DEFAULT_WORKSPACE_ROOT))


def _resolve_hub_dir(workspace_root: pathlib.Path) -> pathlib.Path:
    env_hub = os.environ.get("SPLITBOX_HUB_DIR", "").strip()
    if env_hub:
        return pathlib.Path(os.path.realpath(env_hub))
    return pathlib.Path(os.path.realpath(workspace_root / ".agents" / "hub"))


def _resolve_target_path(raw_path: str, payload: dict[str, Any], workspace_root: pathlib.Path) -> pathlib.Path:
    expanded = os.path.expanduser(raw_path.strip())
    if os.path.isabs(expanded):
        return pathlib.Path(os.path.realpath(expanded))
    cwd_val = str(payload.get("cwd") or "").strip()
    base = pathlib.Path(os.path.realpath(cwd_val)) if cwd_val else workspace_root
    return pathlib.Path(os.path.realpath(base / expanded))


def _load_agent_hub() -> Any | None:
    try:
        import agent_hub  # type: ignore

        return agent_hub
    except Exception:
        return None


def _load_codebase_indexer() -> Any | None:
    try:
        import codebase_indexer  # type: ignore

        return codebase_indexer
    except Exception:
        return None


@contextlib.contextmanager
def _fallback_flock(hub_dir: pathlib.Path):
    hub_dir.mkdir(parents=True, exist_ok=True)
    lock_file = hub_dir / ".hub.lock"
    fh = open(lock_file, "a+", encoding="utf-8")
    try:
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        try:
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
        finally:
            fh.close()


def _atomic_write_text(target: pathlib.Path, content: str) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        dir=str(target.parent),
        prefix=f".{target.name}.",
        suffix=".tmp",
        text=True,
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(content)
            fh.flush()
        os.replace(tmp_name, target)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def _read_json(path: pathlib.Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _paths_overlap_fallback(lock_pattern: str, rel_path: str) -> bool:
    lp = lock_pattern.strip().replace("\\", "/")
    rp = rel_path.strip().replace("\\", "/")
    if not lp or not rp:
        return False
    if lp == rp or lp == "*":
        return True
    if fnmatch.fnmatchcase(rp, lp) or fnmatch.fnmatchcase(lp, rp):
        return True
    for suffix in ("/**", "/*"):
        if lp.endswith(suffix):
            base = lp[: -len(suffix)].rstrip("/")
            if not base or rp == base or rp.startswith(base + "/"):
                return True
    lp_clean = lp.rstrip("/")
    if not any(ch in lp_clean for ch in ("*", "?", "[")) and rp.startswith(lp_clean + "/"):
        return True
    return False


def _resolve_session_agent_id(hub_dir: pathlib.Path, conversation_id: str) -> str:
    env_agent = os.environ.get("SPLITBOX_AGENT_ID", "").strip()
    if env_agent:
        return env_agent
    if conversation_id:
        agents_data = _read_json(hub_dir / "agents.json", {"agents": {}})
        agents_map = agents_data.get("agents", {}) if isinstance(agents_data, dict) else {}
        if isinstance(agents_map, dict):
            # Prefer a named agent already bound to this conversationId over generic session-*
            named_match = ""
            session_match = ""
            for aid, rec in agents_map.items():
                if isinstance(rec, dict) and str(rec.get("conversation_id") or "").strip() == conversation_id:
                    if str(aid).startswith("session-"):
                        session_match = str(aid)
                    else:
                        named_match = str(aid)
                        break
            if named_match:
                return named_match
            if session_match:
                return session_match
        return f"session-{conversation_id[:8]}"
    return "session-main"


def _fit_line_budget(header_lines: list[str], body_lines: list[str], footer_lines: list[str], max_lines: int = 86) -> str:
    available_body = max(10, max_lines - len(header_lines) - len(footer_lines))
    if len(body_lines) > available_body:
        body_lines = body_lines[: available_body - 1] + [
            "_...(snapshot condensed for SessionStart <=90-line budget; run `python3 harness/agent_hub.py brief` for full view)..._"
        ]
    combined = header_lines + body_lines + footer_lines
    if len(combined) > max_lines:
        combined = combined[:max_lines]
    return "\n".join(combined)


def _handle_session_start(payload: dict[str, Any]) -> dict[str, Any]:
    conversation_id = str(payload.get("conversationId") or "").strip()
    workspace_root = _resolve_workspace_root(payload)
    hub_dir = _resolve_hub_dir(workspace_root)
    os.environ["SPLITBOX_HUB_DIR"] = str(hub_dir)

    agent_id = _resolve_session_agent_id(hub_dir, conversation_id)
    hub_mod = _load_agent_hub()

    body_text = ""
    if hub_mod is not None:
        with contextlib.redirect_stdout(io.StringIO()):
            hub_mod.register_agent(
                agent_id=agent_id,
                role="Antigravity Session",
                focus="Active conversation session",
                conversation_id=conversation_id,
                hub_dir=hub_dir,
                workspace_root=workspace_root,
            )
            brief_res = hub_mod.get_brief(
                agent_id=agent_id,
                compact=True,
                hub_dir=hub_dir,
                workspace_root=workspace_root,
            )
            body_text = str(brief_res.get("text") or brief_res.get("snapshot") or "")
    else:
        # Standalone fallback when agent_hub.py is unavailable
        if os.environ.get("SPLITBOX_HUB_DIR") or (hub_dir / "agents.json").exists():
            with _fallback_flock(hub_dir):
                agents_path = hub_dir / "agents.json"
                data = _read_json(agents_path, {"agents": {}})
                agents_map = data.get("agents", {}) if isinstance(data, dict) else {}
                now_iso = _iso_utc()
                prev = agents_map.get(agent_id, {}) if isinstance(agents_map.get(agent_id), dict) else {}
                agents_map[agent_id] = {
                    "agent_id": agent_id,
                    "role": prev.get("role", "Antigravity Session"),
                    "focus": prev.get("focus", "Active conversation session"),
                    "conversation_id": conversation_id or prev.get("conversation_id", ""),
                    "registered_at": prev.get("registered_at", now_iso),
                    "last_seen": now_iso,
                    "inbox_cursor": int(prev.get("inbox_cursor", 0)),
                }
                _atomic_write_text(agents_path, json.dumps({"agents": agents_map}, indent=2) + "\n")

        snap_path = hub_dir / "SNAPSHOT.md"
        if snap_path.exists():
            body_text = snap_path.read_text(encoding="utf-8")
        else:
            body_text = DEFAULT_UNIFIED_GOAL_BLOCK

    # Strip any duplicate quick-lookup tail from SNAPSHOT.md so our SessionStart footer stays crisp
    raw_body_lines = [ln.rstrip() for ln in body_text.strip().splitlines()]
    trimmed_body: list[str] = []
    skip_sec6 = False
    for ln in raw_body_lines:
        if ln.startswith("## 6. Quick Lookup"):
            skip_sec6 = True
            continue
        if skip_sec6 and ln.startswith("## "):
            skip_sec6 = False
        if not skip_sec6:
            trimmed_body.append(ln)

    conv_label = conversation_id if conversation_id else "local"
    map_rel = ".agents/hub/CODEBASE_MAP.md"
    map_status = "ready" if (hub_dir / "CODEBASE_MAP.md").exists() else "run `python3 harness/codebase_indexer.py build`"

    header_lines = [
        "[SPLITBOX UNIFIED GOAL & AGENT HUB]",
        f"Session: `{agent_id}` (`conversationId={conv_label}`) | Codebase Map: `{map_rel}` ({map_status})",
        "",
    ]

    conv_flag = f' --conv "{conversation_id}"' if conversation_id else ""
    footer_lines = [
        "",
        "## O(1) Context & Multi-Agent Protocol (Skip Cold-Scanning 30 Files!)",
        f"- Map & Symbol Search: read `{map_rel}` or run `python3 harness/agent_hub.py query \"<topic>\"`",
        f"- Claim File Locks: `python3 harness/agent_hub.py claim --agent {agent_id} --paths \"<files_or_glob>\"{conv_flag} --reason \"<task>\"`",
        f"- Handoff & Release: `python3 harness/agent_hub.py handoff --from {agent_id} --summary \"...\" --files \"...\"` then `release --agent {agent_id} --all`",
    ]

    system_msg = _fit_line_budget(header_lines, trimmed_body, footer_lines, max_lines=86)
    return {
        "injectSteps": [
            {
                "systemMessage": {
                    "systemMessage": system_msg,
                }
            }
        ]
    }


def _is_foreign_lock_conflict(
    lock: dict[str, Any],
    conversation_id: str,
    env_agent_id: str,
    caller_session_agent_id: str = "",
) -> bool:
    """
    Returns True when `lock` is held by a DIFFERENT conversation_id or agent_id,
    including locks claimed via CLI without `--conv` (`l_conv == ""`).
    """
    l_conv = str(lock.get("conversation_id") or lock.get("conv") or "").strip()
    l_agent = str(lock.get("agent_id") or lock.get("agent") or "").strip()

    if env_agent_id and l_agent:
        if env_agent_id == l_agent:
            if conversation_id and l_conv and conversation_id != l_conv:
                return True
            return False
        return True

    if l_conv:
        if not conversation_id:
            return True
        return l_conv != conversation_id

    if l_agent:
        if caller_session_agent_id and caller_session_agent_id == l_agent:
            return False
        if conversation_id and l_agent == f"session-{conversation_id[:8]}":
            return False
        return True

    return False


def _handle_pre_tool_use(payload: dict[str, Any]) -> dict[str, Any]:
    conversation_id = str(payload.get("conversationId") or "").strip()
    tool_call = payload.get("toolCall") if isinstance(payload.get("toolCall"), dict) else {}
    args = tool_call.get("args") if isinstance(tool_call.get("args"), dict) else {}

    raw_path = str(args.get("Path") or args.get("path") or "").strip()
    if not raw_path:
        return {"decision": "allow"}

    workspace_root = _resolve_workspace_root(payload)
    target_path = _resolve_target_path(raw_path, payload, workspace_root)

    # Never auto-allow paths outside the workspace root — defer to standard user permission prompt
    if not _is_within(target_path, workspace_root):
        return {
            "decision": "ask",
            "reason": "Target path is outside workspace root; deferring to standard safety prompt.",
        }

    rel_path = target_path.relative_to(workspace_root).as_posix()
    hub_dir = _resolve_hub_dir(workspace_root)
    os.environ["SPLITBOX_HUB_DIR"] = str(hub_dir)
    env_agent_id = os.environ.get("SPLITBOX_AGENT_ID", "").strip()

    candidate_locks: list[dict[str, Any]] = []
    hub_mod = _load_agent_hub()

    if hub_mod is not None and hasattr(hub_mod, "check_path_lock"):
        with contextlib.redirect_stdout(io.StringIO()):
            check_res = hub_mod.check_path_lock(
                rel_path,
                agent_id=env_agent_id or None,
                conversation_id=conversation_id or None,
                hub_dir=hub_dir,
                workspace_root=workspace_root,
            )
        for lk in check_res.get("conflicts") or []:
            if isinstance(lk, dict):
                candidate_locks.append(lk)
    else:
        locks_path = hub_dir / "locks.json"
        if locks_path.exists():
            with _fallback_flock(hub_dir):
                locks_data = _read_json(locks_path, {"locks": []})
            raw_locks = locks_data.get("locks", []) if isinstance(locks_data, dict) else []
            now = _utc_now()
            for lk in raw_locks:
                if not isinstance(lk, dict):
                    continue
                exp = _parse_iso(str(lk.get("expires_at") or ""))
                if exp is not None and exp <= now:
                    continue
                if _paths_overlap_fallback(str(lk.get("path") or ""), rel_path):
                    candidate_locks.append(lk)

    caller_session_agent_id = _resolve_session_agent_id(hub_dir, conversation_id)
    for lk in candidate_locks:
        if _is_foreign_lock_conflict(
            lk,
            conversation_id=conversation_id,
            env_agent_id=env_agent_id,
            caller_session_agent_id=caller_session_agent_id,
        ):
            holder = str(lk.get("agent_id") or lk.get("conversation_id") or "peer-agent").strip()
            reason = str(lk.get("reason") or "active file lock").strip()
            return {
                "decision": "deny",
                "reason": (
                    f"SplitBox Hub Lock Conflict: {rel_path} is currently claimed by "
                    f"{holder} ({reason}). Coordinate via `python3 harness/agent_hub.py locks` / `post` before editing."
                ),
            }

    return {"decision": "allow"}


def _call_indexer_update(indexer_mod: Any, target_path: pathlib.Path, workspace_root: pathlib.Path, hub_dir: pathlib.Path) -> None:
    fn = getattr(indexer_mod, "update_single_file", None)
    if not callable(fn):
        return
    with contextlib.redirect_stdout(io.StringIO()):
        try:
            sig = inspect.signature(fn)
            kwargs: dict[str, Any] = {}
            if "workspace_root" in sig.parameters:
                kwargs["workspace_root"] = workspace_root
            if "hub_dir" in sig.parameters:
                kwargs["hub_dir"] = hub_dir
            fn(target_path, **kwargs)
        except TypeError:
            fn(str(target_path))


def _handle_post_tool_use(payload: dict[str, Any]) -> dict[str, Any]:
    # Skip failed tool executions
    if payload.get("error"):
        return {}

    conversation_id = str(payload.get("conversationId") or "").strip()
    tool_call = payload.get("toolCall") if isinstance(payload.get("toolCall"), dict) else {}
    args = tool_call.get("args") if isinstance(tool_call.get("args"), dict) else {}

    raw_path = str(args.get("Path") or args.get("path") or "").strip()
    if not raw_path:
        return {}

    workspace_root = _resolve_workspace_root(payload)
    target_path = _resolve_target_path(raw_path, payload, workspace_root)
    if not _is_within(target_path, workspace_root):
        return {}

    hub_dir = _resolve_hub_dir(workspace_root)
    default_hub_dir = pathlib.Path(os.path.realpath(workspace_root / ".agents" / "hub"))

    # Never recurse on edits inside `.agents/hub/` or the active `SPLITBOX_HUB_DIR`
    if _is_within(target_path, hub_dir) or _is_within(target_path, default_hub_dir):
        return {}

    os.environ["SPLITBOX_HUB_DIR"] = str(hub_dir)
    rel_path = target_path.relative_to(workspace_root).as_posix()

    # 1. Incremental O(1) codebase map & symbol index refresh
    indexer_mod = _load_codebase_indexer()
    if indexer_mod is not None:
        try:
            _call_indexer_update(indexer_mod, target_path, workspace_root, hub_dir)
        except Exception:
            pass

    # 2. Record 60s-deduped `file_modified` event & refresh SNAPSHOT.md
    sender_id = _resolve_session_agent_id(hub_dir, conversation_id)
    hub_mod = _load_agent_hub()

    if hub_mod is not None and hasattr(hub_mod, "post_event"):
        with contextlib.redirect_stdout(io.StringIO()):
            # Check if last event in events.jsonl was same file + same conversationId within 60s
            # (handles case where sender_id changed from session-* to named agent on same conv)
            already_deduped = False
            events_path = hub_dir / "events.jsonl"
            if conversation_id and events_path.exists() and hasattr(hub_mod, "_hub_lock"):
                with hub_mod._hub_lock(hub_dir):
                    events = hub_mod._read_events(events_path)
                    if events:
                        last = events[-1]
                        last_dt = _parse_iso(str(last.get("created_at") or ""))
                        now = _utc_now()
                        if (
                            last.get("kind") == "file_modified"
                            and last.get("files") == [rel_path]
                            and str(last.get("conversation_id") or "") == conversation_id
                            and last_dt is not None
                            and (now - last_dt).total_seconds() <= 60.0
                        ):
                            last["created_at"] = _iso_utc(now)
                            last["count"] = int(last.get("count", 1)) + 1
                            hub_mod._write_events(events_path, events)
                            hub_mod._render_snapshot_locked(hub_dir)
                            already_deduped = True

            if not already_deduped:
                hub_mod.post_event(
                    sender=sender_id,
                    kind="file_modified",
                    msg=f"Edited {rel_path}",
                    summary=f"Edited {rel_path}",
                    files=[rel_path],
                    conversation_id=conversation_id,
                    dedupe_window_seconds=60.0,
                    hub_dir=hub_dir,
                    workspace_root=workspace_root,
                )
    else:
        with _fallback_flock(hub_dir):
            events_path = hub_dir / "events.jsonl"
            events: list[dict[str, Any]] = []
            if events_path.exists():
                for line in events_path.read_text(encoding="utf-8").splitlines():
                    if line.strip():
                        try:
                            events.append(json.loads(line))
                        except Exception:
                            continue
            now = _utc_now()
            now_iso = _iso_utc(now)
            deduped = False
            if events:
                last = events[-1]
                last_dt = _parse_iso(str(last.get("created_at") or ""))
                same_actor = (
                    (conversation_id and str(last.get("conversation_id") or "") == conversation_id)
                    or str(last.get("from") or "") == sender_id
                )
                if (
                    last.get("kind") == "file_modified"
                    and last.get("files") == [rel_path]
                    and same_actor
                    and last_dt is not None
                    and (now - last_dt).total_seconds() <= 60.0
                ):
                    last["created_at"] = now_iso
                    last["count"] = int(last.get("count", 1)) + 1
                    deduped = True
            if not deduped:
                next_seq = (max((int(e.get("seq", 0)) for e in events), default=0) + 1)
                ev: dict[str, Any] = {
                    "seq": next_seq,
                    "kind": "file_modified",
                    "from": sender_id,
                    "to": "all",
                    "channel": "main",
                    "msg": f"Edited {rel_path}",
                    "summary": f"Edited {rel_path}",
                    "files": [rel_path],
                    "next": "",
                    "created_at": now_iso,
                }
                if conversation_id:
                    ev["conversation_id"] = conversation_id
                events.append(ev)
            content = "\n".join(json.dumps(e, ensure_ascii=False) for e in events) + "\n"
            _atomic_write_text(events_path, content)

    return {}


def dispatch_hook(event_name: str, payload: dict[str, Any]) -> dict[str, Any]:
    norm = event_name.strip().lower()
    if norm == "sessionstart":
        return _handle_session_start(payload)
    if norm == "pretooluse":
        return _handle_pre_tool_use(payload)
    if norm == "posttooluse":
        return _handle_post_tool_use(payload)
    return {}


def main() -> int:
    cli_event = ""
    for arg in sys.argv[1:]:
        if not arg.startswith("-"):
            cli_event = arg.strip()
            break

    raw_stdin = ""
    try:
        if not sys.stdin.isatty():
            raw_stdin = sys.stdin.read()
    except Exception:
        raw_stdin = ""

    payload: dict[str, Any] = {}
    if raw_stdin.strip():
        try:
            parsed = json.loads(raw_stdin)
            if isinstance(parsed, dict):
                payload = parsed
        except Exception:
            payload = {}

    event_name = cli_event or str(payload.get("hookEventName") or "").strip()
    is_pre_tool = event_name.strip().lower() == "pretooluse" or (
        not event_name and '"PreToolUse"' in raw_stdin
    )
    fallback_output: dict[str, Any] = {"decision": "allow"} if is_pre_tool else {}

    try:
        result = dispatch_hook(event_name, payload)
        if not isinstance(result, dict):
            result = fallback_output
    except Exception:
        result = fallback_output

    sys.stdout.write(json.dumps(result, ensure_ascii=False) + "\n")
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        # Ultimate fail-open safety net — never break an agent tool call
        _cli_ev = next((a.strip().lower() for a in sys.argv[1:] if not a.startswith("-")), "")
        _safe = {"decision": "allow"} if _cli_ev == "pretooluse" else {}
        try:
            sys.stdout.write(json.dumps(_safe) + "\n")
            sys.stdout.flush()
        except Exception:
            pass
        os._exit(0)
