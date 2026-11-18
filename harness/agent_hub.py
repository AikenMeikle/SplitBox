#!/usr/bin/env python3
"""
SplitBox Persistent Cross-Agent Communication Bus, Unified Goal Tracker,
File Ownership Lock Registry, and Snapshot Synthesizer.

100% Python 3 stdlib. Safe across parallel processes/threads via exclusive
`fcntl.flock` locking on `<hub_dir>/.hub.lock` and atomic `os.replace` writes.

Environment & Global Overrides:
  - `SPLITBOX_HUB_DIR` env var or `--hub-dir <path>` CLI flag
    (defaults to `<workspace_root>/.agents/hub`).
  - `--json` supported on all CLI commands (before or after subcommand).
"""

from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import fcntl
import fnmatch
import json
import os
import pathlib
import sys
import tempfile
import threading
from typing import Any, Iterator

WORKSPACE_ROOT = pathlib.Path(__file__).resolve().parent.parent
HARNESS_DIR = pathlib.Path(__file__).resolve().parent

VALID_MILESTONE_STATUSES = ("todo", "in_progress", "review", "done", "blocked")

_THREAD_LOCK = threading.RLock()
_HELD_FLOCKS: dict[tuple[int, str], list[Any]] = {}


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


def resolve_workspace_root(workspace_root: pathlib.Path | str | None = None) -> pathlib.Path:
    if workspace_root is not None:
        return pathlib.Path(workspace_root).resolve()
    env_ws = os.environ.get("SPLITBOX_WORKSPACE_ROOT", "").strip()
    if env_ws:
        return pathlib.Path(env_ws).resolve()
    return WORKSPACE_ROOT


def resolve_hub_dir(
    hub_dir: pathlib.Path | str | None = None,
    workspace_root: pathlib.Path | str | None = None,
) -> pathlib.Path:
    if hub_dir is not None and str(hub_dir).strip():
        return pathlib.Path(hub_dir).resolve()
    env_hub = os.environ.get("SPLITBOX_HUB_DIR", "").strip()
    if env_hub:
        return pathlib.Path(env_hub).resolve()
    return resolve_workspace_root(workspace_root) / ".agents" / "hub"


@contextlib.contextmanager
def _hub_lock(hub_dir: pathlib.Path) -> Iterator[None]:
    """Re-entrant process + thread exclusive file lock on `<hub_dir>/.hub.lock`."""
    resolved = hub_dir.resolve()
    resolved.mkdir(parents=True, exist_ok=True)
    key = (os.getpid(), str(resolved))
    lock_path = resolved / ".hub.lock"

    with _THREAD_LOCK:
        entry = _HELD_FLOCKS.get(key)
        if entry is not None:
            entry[1] += 1
            reentrant = True
        else:
            fh = open(lock_path, "a+", encoding="utf-8")
            try:
                fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
            except Exception:
                fh.close()
                raise
            _HELD_FLOCKS[key] = [fh, 1]
            reentrant = False

        try:
            yield
        finally:
            cur = _HELD_FLOCKS.get(key)
            if cur is not None:
                cur[1] -= 1
                if cur[1] <= 0 and not reentrant:
                    fh_to_close = cur[0]
                    del _HELD_FLOCKS[key]
                    try:
                        fcntl.flock(fh_to_close.fileno(), fcntl.LOCK_UN)
                    finally:
                        fh_to_close.close()


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
        os.chmod(tmp_name, 0o644)
        os.replace(tmp_name, target)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def _atomic_write_json(target: pathlib.Path, data: Any) -> None:
    payload = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    _atomic_write_text(target, payload)


def _read_json(target: pathlib.Path, default: Any) -> Any:
    if not target.exists():
        return default
    try:
        return json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def _read_events(events_path: pathlib.Path) -> list[dict[str, Any]]:
    if not events_path.exists():
        return []
    events: list[dict[str, Any]] = []
    try:
        raw = events_path.read_text(encoding="utf-8")
    except OSError:
        return []
    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        try:
            obj = json.loads(stripped)
            if isinstance(obj, dict):
                events.append(obj)
        except json.JSONDecodeError:
            continue
    return events


def _write_events(events_path: pathlib.Path, events: list[dict[str, Any]]) -> None:
    lines = [json.dumps(ev, ensure_ascii=False) for ev in events]
    content = ("\n".join(lines) + "\n") if lines else ""
    _atomic_write_text(events_path, content)


def _one_line(text: Any, max_len: int = 135) -> str:
    cleaned = " ".join(str(text or "").split())
    if len(cleaned) <= max_len:
        return cleaned
    return cleaned[: max_len - 1].rstrip() + "…"


def _split_multi_values(raw: list[str] | str | None) -> list[str]:
    if raw is None:
        return []
    items = [raw] if isinstance(raw, str) else list(raw)
    result: list[str] = []
    for token in items:
        for part in str(token).replace(",", " ").split():
            cleaned = part.strip()
            if cleaned and cleaned not in result:
                result.append(cleaned)
    return result


def _split_csv_values(raw: list[str] | str | None) -> list[str]:
    if raw is None:
        return []
    items = [raw] if isinstance(raw, str) else list(raw)
    result: list[str] = []
    for token in items:
        for part in str(token).split(","):
            cleaned = part.strip()
            if cleaned and cleaned not in result:
                result.append(cleaned)
    return result


def normalize_repo_path(
    raw_path: pathlib.Path | str,
    workspace_root: pathlib.Path | str | None = None,
) -> tuple[str, bool]:
    """
    Normalize a file/directory/glob path relative to `workspace_root`.
    Returns `(normalized_posix_path, inside_workspace)`.
    Directory paths ending with `/` are normalized to `<dir>/*` for prefix matching.
    """
    ws_root = resolve_workspace_root(workspace_root)
    raw_str = str(raw_path).strip().replace("\\", "/")
    if not raw_str:
        return ("", False)

    trailing_dir = raw_str.endswith("/") and len(raw_str) > 1
    has_glob = any(ch in raw_str for ch in ("*", "?", "["))

    # Separate glob suffix if present so path resolution doesn't mangle wildcards
    glob_suffix = ""
    base_part = raw_str
    if has_glob:
        parts = [p for p in raw_str.split("/") if p != "."]
        prefix_parts: list[str] = []
        glob_parts: list[str] = []
        hit_glob = False
        for part in parts:
            if hit_glob or any(ch in part for ch in ("*", "?", "[")):
                hit_glob = True
                glob_parts.append(part)
            else:
                prefix_parts.append(part)
        base_part = "/".join(prefix_parts) if prefix_parts else ("/" if raw_str.startswith("/") else ".")
        if raw_str.startswith("/") and not base_part.startswith("/"):
            base_part = "/" + base_part
        glob_suffix = "/".join(glob_parts)

    p_obj = pathlib.Path(base_part)
    if p_obj.is_absolute():
        resolved_base = pathlib.Path(os.path.normpath(str(p_obj)))
    elif base_part.startswith(".."):
        resolved_base = pathlib.Path(os.path.normpath(str(pathlib.Path.cwd() / p_obj)))
    else:
        resolved_base = pathlib.Path(os.path.normpath(str(ws_root / p_obj)))

    try:
        rel_base = resolved_base.relative_to(ws_root).as_posix()
        inside = True
    except ValueError:
        return (pathlib.Path(os.path.normpath(raw_str)).as_posix(), False)

    if rel_base == ".":
        norm = glob_suffix if glob_suffix else "*"
    elif glob_suffix:
        norm = f"{rel_base}/{glob_suffix}"
    else:
        norm = rel_base

    if trailing_dir and not any(ch in norm for ch in ("*", "?", "[")):
        norm = f"{norm.rstrip('/')}/*"
    elif not has_glob and (ws_root / norm).is_dir():
        norm = f"{norm.rstrip('/')}/*"

    return (norm, inside)


def _extract_dir_prefix(pattern: str) -> str | None:
    if pattern == "*":
        return ""
    if pattern.endswith("/**"):
        base = pattern[:-3].rstrip("/")
        if not any(ch in base for ch in ("*", "?", "[")):
            return base
    if pattern.endswith("/*"):
        base = pattern[:-2].rstrip("/")
        if not any(ch in base for ch in ("*", "?", "[")):
            return base
    return None


def _paths_overlap(lock_pattern: str, target_pattern: str) -> bool:
    if not lock_pattern or not target_pattern:
        return False
    if lock_pattern == target_pattern:
        return True
    if fnmatch.fnmatchcase(target_pattern, lock_pattern) or fnmatch.fnmatchcase(lock_pattern, target_pattern):
        return True

    dir_a = _extract_dir_prefix(lock_pattern)
    dir_b = _extract_dir_prefix(target_pattern)

    if dir_a is not None and dir_b is not None:
        if dir_a == "" or dir_b == "" or dir_a == dir_b:
            return True
        return dir_a.startswith(dir_b + "/") or dir_b.startswith(dir_a + "/")

    if dir_a is not None:
        return dir_a == "" or target_pattern == dir_a or target_pattern.startswith(dir_a + "/")

    if dir_b is not None:
        return dir_b == "" or lock_pattern == dir_b or lock_pattern.startswith(dir_b + "/")

    return False


def _default_mission(now_iso: str) -> dict[str, Any]:
    return {
        "project": "PalletCut (SplitBox)",
        "title": (
            "Deliver & maintain PalletCut (SplitBox) — Dual-Mode UoB bulk-grocery & "
            "household-essentials pooling web app"
        ),
        "summary": (
            "Deliver & maintain PalletCut (formerly SplitBox) — Dual-Mode (zero-config offline "
            "Demo Mode + Supabase/Stripe Live Mode) tactile light-mode UoB bulk-grocery & "
            "household-essentials pooling web app (1 active launch hub Vale · Shackleton + 3 "
            "coming_soon vote hubs, £ GBP integer-pence sequential FCFS case allocation, "
            "£0.00 crate fee >= £9.00 / £0.39 < £9.00, Card Pre-Authorisation Hold cutoff "
            "settlement, SVG QR + 4-digit PIN pickup pass, and 375px mobile layout)."
        ),
        "invariants": [
            "Zero External Asset CDNs (Both Modes): Self-hosted @fontsource fonts, local palletcut-*.svg assets, and local qrcode.react SVG; Demo Mode runs 100% offline via localStorage.",
            "UoB Drop #1 Hub & GBP (£) Fee Rules: 1 active launch hub (Vale · Shackleton; 3 other UoB hubs as coming_soon votes), £0.00 fee >= £9.00 (£0.39 micro-crate fee < £9.00), Card Pre-Authorisation Hold copy.",
            "Chronological Sequential Case Allocation: Strictly first-come-first-served across Box #1, Box #2, ... with <100% overflow slices auto-released at Wednesday 23:59 cutoff.",
            "Tactile Citrus-Crate Craft (Kept for Launch): #F7FAF8 light canvas, 1.5px–2px #0B241C borders, 3px 3px 0px #0B241C hard shadows, radial SVG <SliceMeter /> only, #0B241C ink on #10D48E mint & #FF6B1A tangerine.",
        ],
        "acceptance_gates": [
            {
                "id": "gate-1-build",
                "title": "Clean TypeScript & Vite Build",
                "criteria": "tsc -b && vite build exits 0 with zero TypeScript or bundler errors.",
                "status": "done",
            },
            {
                "id": "gate-2-offline",
                "title": "Zero External Network / CDN Calls",
                "criteria": "0 external http(s) requests on load and checkout/cutoff flows; local @fontsource, SVGs, and £ GBP copy.",
                "status": "done",
            },
            {
                "id": "gate-3-allocation",
                "title": "3/4 + 2 Cross-Box Allocation & Auto-Refund",
                "criteria": "Ordering 2 slices at 3/4 records Box #1 (4/4 Locked) + Box #2 (1/4 Pooling -> Auto-Refunded on Trigger Cutoff) with localStorage persistence.",
                "status": "done",
            },
            {
                "id": "gate-4-pickup-pass",
                "title": "QR + 4-Digit PIN Net £ Receipt & Reset",
                "criteria": "Post-cutoff Orders/Pickup Pass displays fulfilled vs. auto-refunded slices, net £ charged total, SVG QR + 4-digit PIN, and working Reset.",
                "status": "done",
            },
            {
                "id": "gate-5-mobile-375",
                "title": "375px Zero-Overflow Mobile Layout",
                "criteria": "At 375px x 812px viewport, single-column catalog grid with scrollWidth <= 375 and sticky bottom basket bar.",
                "status": "done",
            },
        ],
        "milestones": [
            {
                "id": "m1-drop-engine",
                "title": "GBP Drop Engine, Sequential Allocator & UK Campus Catalog",
                "status": "done",
                "owner": "foundation",
                "note": "src/types.ts, src/data/catalog.ts, src/store/dropEngine.ts, src/store/DropContext.tsx",
            },
            {
                "id": "m2-ui-slices",
                "title": "Storefront, Basket, Orders/Pickup Pass, Hub Ops & Investor Views",
                "status": "done",
                "owner": "ui-builders",
                "note": "Tactile crate UI + radial SVG <SliceMeter /> + Demo Controls integrated in src/App.tsx",
            },
            {
                "id": "m3-qa-gate",
                "title": "5-Gate Offline, GBP & 375px Build Verification",
                "status": "done",
                "owner": "splitbox-qa",
                "note": "verify_offline_and_build.sh passing cleanly",
            },
            {
                "id": "m4-agent-hub",
                "title": "Multi-Agent Communication Bus, O(1) Codebase Indexer & Lifecycle Hooks",
                "status": "in_progress",
                "owner": "swarm",
                "note": "Eliminate cold-start scanning and coordinate file locks + handoffs across agents",
            },
        ],
        "updated_at": now_iso,
    }


def _default_decisions(now_iso: str) -> dict[str, Any]:
    return {
        "next_id": 5,
        "decisions": [
            {
                "id": "DEC-001",
                "author": "system",
                "title": "100% Offline @fontsource & qrcode.react Override CDN Snippets",
                "summary": "Bundle Space Grotesk, Plus Jakarta Sans, and JetBrains Mono via @fontsource and render QR passes via local qrcode.react (<QRCodeSVG />); forbid Google Fonts CDN or any external http(s) URL.",
                "rationale": "brief.md §3.5/§4 & AGENTS.md conflict resolution #1 supersede the Google Fonts <link> snippet in page-syles.md.",
                "tags": ["offline", "fonts", "qr", "spec-override"],
                "created_at": now_iso,
            },
            {
                "id": "DEC-002",
                "author": "system",
                "title": "UoB Drop #1 Single Active Hub, GBP (£) Integer-Pence Math & Card Pre-Authorisation Hold",
                "summary": "Launch with 1 active hub (Vale · Shackleton; 3 other UoB hubs as coming_soon votes), £0.00 crate fee >= £9.00 (£0.39 micro-crate fee < £9.00), integer GBP pence math, and Card Pre-Authorisation Hold copy.",
                "rationale": "AGENTS.md §3.3–3.4 & founder Drop #1 resolution unify hub count, fee math, and pre-authorisation terminology.",
                "tags": ["gbp", "hubs", "pre-auth", "spec-override"],
                "created_at": now_iso,
            },
            {
                "id": "DEC-003",
                "author": "system",
                "title": "PalletCut Brand Rename + Tactile Citrus-Crate Palette Kept for Launch",
                "summary": "Rebrand product identity to PalletCut (palletcut-icon.svg / palletcut-logo.svg) while keeping the tactile #F7FAF8 chalk canvas, 1.5px–2px solid #0B241C borders, 3px 3px 0px #0B241C hard shadows, and radial SVG <SliceMeter />.",
                "rationale": "Founder resolution: rename to PalletCut now and preserve current tactile UI tokens for launch.",
                "tags": ["brand", "palletcut", "ui", "tokens"],
                "created_at": now_iso,
            },
            {
                "id": "DEC-004",
                "author": "system",
                "title": "Radial SVG <SliceMeter /> Only (No Horizontal Progress Bars)",
                "summary": "Display open-box slice progress exclusively via segmented radial SVG wedges (#10D48E stranger slices, #FF6B1A popped user slice, #EDF7F2 open wedges).",
                "rationale": "page-syles.md & AGENTS.md signature SplitBox visual craft requirement.",
                "tags": ["ui", "svg", "slice-meter"],
                "created_at": now_iso,
            },
        ],
    }


def _ensure_initialized_locked(hub_dir: pathlib.Path) -> list[str]:
    """Must be called inside `_hub_lock(hub_dir)`. Never touches `codebase_index.json` or `CODEBASE_MAP.md`."""
    now_iso = _iso_utc()
    created: list[str] = []

    mission_path = hub_dir / "mission.json"
    if not mission_path.exists():
        _atomic_write_json(mission_path, _default_mission(now_iso))
        created.append("mission.json")

    agents_path = hub_dir / "agents.json"
    if not agents_path.exists():
        _atomic_write_json(agents_path, {"agents": {}})
        created.append("agents.json")

    locks_path = hub_dir / "locks.json"
    if not locks_path.exists():
        _atomic_write_json(locks_path, {"locks": []})
        created.append("locks.json")

    decisions_path = hub_dir / "decisions.json"
    if not decisions_path.exists():
        _atomic_write_json(decisions_path, _default_decisions(now_iso))
        created.append("decisions.json")

    events_path = hub_dir / "events.jsonl"
    if not events_path.exists():
        seed_event = {
            "seq": 1,
            "kind": "init",
            "from": "system",
            "to": "all",
            "channel": "main",
            "msg": "Initialized SplitBox Unified Goal, 5 Acceptance Gates, and Multi-Agent Hub.",
            "summary": "Initialized SplitBox Unified Goal, 5 Acceptance Gates, and Multi-Agent Hub.",
            "files": [],
            "next": "",
            "created_at": now_iso,
        }
        _write_events(events_path, [seed_event])
        created.append("events.jsonl")

    snapshot_path = hub_dir / "SNAPSHOT.md"
    if not snapshot_path.exists():
        _render_snapshot_locked(hub_dir)
        created.append("SNAPSHOT.md")

    return created


def _prune_expired_locks_locked(hub_dir: pathlib.Path) -> tuple[list[dict[str, Any]], int]:
    locks_path = hub_dir / "locks.json"
    data = _read_json(locks_path, {"locks": []})
    raw_locks = data.get("locks", []) if isinstance(data, dict) else []
    now = _utc_now()
    active: list[dict[str, Any]] = []
    pruned = 0
    for item in raw_locks:
        if not isinstance(item, dict):
            pruned += 1
            continue
        exp = _parse_iso(str(item.get("expires_at", "")))
        if exp is not None and exp <= now:
            pruned += 1
            continue
        active.append(item)
    if pruned > 0:
        _atomic_write_json(locks_path, {"locks": active})
    return (active, pruned)


def _touch_agent_locked(
    hub_dir: pathlib.Path,
    agent_id: str,
    role: str | None = None,
    focus: str | None = None,
    conversation_id: str | None = None,
) -> dict[str, Any]:
    agents_path = hub_dir / "agents.json"
    data = _read_json(agents_path, {"agents": {}})
    agents = data.get("agents", {}) if isinstance(data, dict) else {}
    now_iso = _iso_utc()

    existing = agents.get(agent_id, {}) if isinstance(agents.get(agent_id), dict) else {}
    updated = {
        "agent_id": agent_id,
        "role": role if role else existing.get("role", "agent"),
        "focus": focus if focus is not None else existing.get("focus", ""),
        "conversation_id": (
            conversation_id if conversation_id else existing.get("conversation_id", "")
        ),
        "registered_at": existing.get("registered_at", now_iso),
        "last_seen": now_iso,
        "inbox_cursor": int(existing.get("inbox_cursor", 0)),
    }
    agents[agent_id] = updated
    _atomic_write_json(agents_path, {"agents": agents})
    return updated


def _is_same_lock_owner(
    lock: dict[str, Any],
    agent_id: str | None,
    conversation_id: str | None,
) -> bool:
    q_agent = (agent_id or "").strip()
    q_conv = (conversation_id or "").strip()
    l_agent = str(lock.get("agent_id") or "").strip()
    l_conv = str(lock.get("conversation_id") or "").strip()

    if q_conv and l_conv:
        return q_conv == l_conv

    if q_agent and l_agent and q_agent == l_agent:
        return True

    return False


def _render_snapshot_locked(hub_dir: pathlib.Path) -> str:
    mission = _read_json(hub_dir / "mission.json", _default_mission(_iso_utc()))
    active_locks, _ = _prune_expired_locks_locked(hub_dir)
    decisions_data = _read_json(hub_dir / "decisions.json", {"decisions": []})
    decisions = decisions_data.get("decisions", []) if isinstance(decisions_data, dict) else []
    events = _read_events(hub_dir / "events.jsonl")

    lines: list[str] = []
    lines.append("# PalletCut (SplitBox) — Unified Goal & Multi-Agent Snapshot")
    lines.append(f"_Updated: {_iso_utc()}_")
    lines.append("")

    # 1. Unified Goal & Invariants
    lines.append("## 1. Unified Goal & Invariants")
    lines.append(f"**Goal:** {_one_line(mission.get('summary') or mission.get('title'), 420)}")
    for inv in (mission.get("invariants") or [])[:4]:
        lines.append(f"- {_one_line(inv, 240)}")
    lines.append("")

    # 2. Acceptance Gates & Milestones
    lines.append("## 2. Acceptance Gates & Milestones")
    for gate in (mission.get("acceptance_gates") or [])[:5]:
        st = str(gate.get("status", "todo")).upper()
        lines.append(
            f"- [{st}] `{gate.get('id')}` **{gate.get('title')}** — {_one_line(gate.get('criteria'), 180)}"
        )
    milestones = mission.get("milestones") or []
    for ms in milestones[:5]:
        st = str(ms.get("status", "todo")).upper()
        owner = f" (@{ms.get('owner')})" if ms.get("owner") else ""
        note = f" — {_one_line(ms.get('note'), 90)}" if ms.get("note") else ""
        lines.append(f"- [{st}] `{ms.get('id')}` {ms.get('title')}{owner}{note}")
    if len(milestones) > 5:
        lines.append(f"- _(+{len(milestones) - 5} more milestones via `agent_hub.py goal show`)_")
    lines.append("")

    # 3. Active Agent File Locks
    lines.append("## 3. Active Agent File Locks")
    if not active_locks:
        lines.append("- None (all workspace slices currently unlocked)")
    else:
        for lk in active_locks[:8]:
            reason = f" — {_one_line(lk.get('reason'), 70)}" if lk.get("reason") else ""
            lines.append(
                f"- `{lk.get('path')}` -> **{lk.get('agent_id')}** (until `{lk.get('expires_at')}`){reason}"
            )
        if len(active_locks) > 8:
            lines.append(f"- _(+{len(active_locks) - 8} more locks via `agent_hub.py locks`)_")
    lines.append("")

    # 4. Key Architectural Decisions
    lines.append("## 4. Key Architectural Decisions")
    shown_decisions = decisions[-6:] if len(decisions) > 6 else decisions
    if not shown_decisions:
        lines.append("- None recorded yet")
    else:
        for dec in shown_decisions:
            lines.append(
                f"- `{dec.get('id')}` **{_one_line(dec.get('title'), 75)}**: {_one_line(dec.get('summary'), 115)}"
            )
        if len(decisions) > 6:
            lines.append(f"- _(+{len(decisions) - 6} earlier decisions via `agent_hub.py decisions`)_")
    lines.append("")

    # 5. Latest 8 Handoffs / Messages
    lines.append("## 5. Latest 8 Handoffs / Messages")
    recent_events = events[-8:]
    if not recent_events:
        lines.append("- No events yet")
    else:
        for ev in recent_events:
            seq = ev.get("seq", "?")
            kind = ev.get("kind", "event")
            sender = ev.get("from", "system")
            to = ev.get("to", "all")
            body = _one_line(ev.get("summary") or ev.get("msg") or "", 105)
            files_list = ev.get("files") or []
            files_tag = f" [files: {', '.join(files_list[:3])}]" if files_list else ""
            next_tag = f" (next: {_one_line(ev.get('next'), 50)})" if ev.get("next") else ""
            lines.append(f"- `#{seq}` [{kind}] **{sender} -> {to}**: {body}{files_tag}{next_tag}")
    lines.append("")

    # 6. Quick Lookup Commands
    lines.append("## 6. Quick Lookup & Coordination Commands")
    lines.append("- Codebase Atlas: read `.agents/hub/CODEBASE_MAP.md` or run `python3 harness/agent_hub.py query \"<symbol_or_topic>\"`")
    lines.append("- Orient & Inbox: `python3 harness/agent_hub.py brief --agent <name>` | `inbox --agent <name> --ack`")
    lines.append("- Claim & Handoff: `python3 harness/agent_hub.py claim --agent <name> --paths <glob>` | `handoff --from <name> --summary \"...\"`")

    # Enforce strict <= 110 lines contract
    if len(lines) > 108:
        lines = lines[:107] + ["_...snapshot truncated to fit 110-line budget..._"]

    content = "\n".join(lines) + "\n"
    _atomic_write_text(hub_dir / "SNAPSHOT.md", content)
    return content


# ============================================================================
# Public Importable Python API (used by hub_hooks.py, full_tool_harness.py, QA)
# ============================================================================


def init_hub(
    hub_dir: pathlib.Path | str | None = None,
    workspace_root: pathlib.Path | str | None = None,
) -> dict[str, Any]:
    h_dir = resolve_hub_dir(hub_dir, workspace_root)
    with _hub_lock(h_dir):
        created = _ensure_initialized_locked(h_dir)
        snapshot = _render_snapshot_locked(h_dir)
    return {
        "ok": True,
        "hub_dir": str(h_dir),
        "created_files": created,
        "snapshot_lines": len(snapshot.splitlines()),
    }


def render_snapshot(
    hub_dir: pathlib.Path | str | None = None,
    workspace_root: pathlib.Path | str | None = None,
) -> str:
    h_dir = resolve_hub_dir(hub_dir, workspace_root)
    with _hub_lock(h_dir):
        _ensure_initialized_locked(h_dir)
        return _render_snapshot_locked(h_dir)


def get_brief(
    agent_id: str | None = None,
    compact: bool = False,
    hub_dir: pathlib.Path | str | None = None,
    workspace_root: pathlib.Path | str | None = None,
) -> dict[str, Any]:
    h_dir = resolve_hub_dir(hub_dir, workspace_root)
    with _hub_lock(h_dir):
        _ensure_initialized_locked(h_dir)
        snapshot = _render_snapshot_locked(h_dir)
        unread: list[dict[str, Any]] = []
        cursor = 0
        if agent_id:
            agents_data = _read_json(h_dir / "agents.json", {"agents": {}})
            agent_rec = (agents_data.get("agents") or {}).get(agent_id, {})
            cursor = int(agent_rec.get("inbox_cursor", 0)) if isinstance(agent_rec, dict) else 0
            events = _read_events(h_dir / "events.jsonl")
            for ev in events:
                if int(ev.get("seq", 0)) <= cursor:
                    continue
                if ev.get("kind") not in ("message", "handoff"):
                    continue
                if ev.get("to") in (agent_id, "all"):
                    unread.append(ev)

    snap_lines = snapshot.rstrip("\n").splitlines()
    if compact and len(snap_lines) > 68:
        # Compact mode drops verbose rationale/older tail if needed while keeping all key sections
        snap_lines = snap_lines[:68]

    out_lines = list(snap_lines)
    if agent_id:
        out_lines.append("")
        out_lines.append(f"## Unread Inbox for `{agent_id}` (since seq #{cursor})")
        if not unread:
            out_lines.append("- 0 unread messages.")
        else:
            max_inbox_lines = max(1, 114 - len(out_lines))
            shown = unread[-max_inbox_lines:]
            for ev in shown:
                body = _one_line(ev.get("summary") or ev.get("msg") or "", 110)
                out_lines.append(
                    f"- `#{ev.get('seq')}` [{ev.get('kind')}] **{ev.get('from')} -> {ev.get('to')}**: {body}"
                )
            if len(unread) > len(shown):
                out_lines.append(
                    f"- _(+{len(unread) - len(shown)} more unread; run `agent_hub.py inbox --agent {agent_id} --ack`)_"
                )

    if len(out_lines) >= 119:
        out_lines = out_lines[:118]

    text = "\n".join(out_lines) + "\n"
    return {
        "ok": True,
        "agent_id": agent_id,
        "compact": compact,
        "snapshot": snapshot,
        "unread_count": len(unread),
        "unread": unread,
        "line_count": len(out_lines),
        "text": text,
    }


def get_goal(
    hub_dir: pathlib.Path | str | None = None,
    workspace_root: pathlib.Path | str | None = None,
) -> dict[str, Any]:
    h_dir = resolve_hub_dir(hub_dir, workspace_root)
    with _hub_lock(h_dir):
        _ensure_initialized_locked(h_dir)
        mission = _read_json(h_dir / "mission.json", _default_mission(_iso_utc()))
    return {"ok": True, "mission": mission}


def update_goal(
    title: str | None = None,
    summary: str | None = None,
    milestone_id: str | None = None,
    milestone_title: str | None = None,
    status: str | None = None,
    owner: str | None = None,
    note: str | None = None,
    hub_dir: pathlib.Path | str | None = None,
    workspace_root: pathlib.Path | str | None = None,
) -> dict[str, Any]:
    if status is not None and status not in VALID_MILESTONE_STATUSES:
        raise ValueError(
            f"Invalid milestone status {status!r}; expected one of {VALID_MILESTONE_STATUSES}"
        )

    h_dir = resolve_hub_dir(hub_dir, workspace_root)
    with _hub_lock(h_dir):
        _ensure_initialized_locked(h_dir)
        mission_path = h_dir / "mission.json"
        mission = _read_json(mission_path, _default_mission(_iso_utc()))
        now_iso = _iso_utc()

        if title is not None:
            mission["title"] = title
        if summary is not None:
            mission["summary"] = summary

        updated_item: dict[str, Any] | None = None
        if milestone_id is not None:
            milestones = list(mission.get("milestones") or [])
            gates = list(mission.get("acceptance_gates") or [])

            matched = False
            for ms in milestones:
                if ms.get("id") == milestone_id:
                    if milestone_title is not None:
                        ms["title"] = milestone_title
                    if status is not None:
                        ms["status"] = status
                    if owner is not None:
                        ms["owner"] = owner
                    if note is not None:
                        ms["note"] = note
                    updated_item = ms
                    matched = True
                    break

            if not matched:
                for gate in gates:
                    if gate.get("id") == milestone_id:
                        if milestone_title is not None:
                            gate["title"] = milestone_title
                        if status is not None:
                            gate["status"] = status
                        if note is not None:
                            gate["criteria"] = note
                        updated_item = gate
                        matched = True
                        break

            if not matched:
                new_ms: dict[str, Any] = {
                    "id": milestone_id,
                    "title": milestone_title or milestone_id,
                    "status": status or "todo",
                    "owner": owner or "",
                    "note": note or "",
                }
                milestones.append(new_ms)
                updated_item = new_ms

            mission["milestones"] = milestones
            mission["acceptance_gates"] = gates

        mission["updated_at"] = now_iso
        _atomic_write_json(mission_path, mission)
        _render_snapshot_locked(h_dir)

    return {"ok": True, "mission": mission, "updated_milestone": updated_item}


def register_agent(
    agent_id: str,
    role: str = "agent",
    focus: str = "",
    conversation_id: str = "",
    conv: str | None = None,
    hub_dir: pathlib.Path | str | None = None,
    workspace_root: pathlib.Path | str | None = None,
) -> dict[str, Any]:
    eff_conv = (conversation_id or conv or "").strip()
    h_dir = resolve_hub_dir(hub_dir, workspace_root)
    with _hub_lock(h_dir):
        _ensure_initialized_locked(h_dir)
        record = _touch_agent_locked(
            h_dir,
            agent_id=agent_id.strip(),
            role=role.strip() or "agent",
            focus=focus,
            conversation_id=eff_conv or None,
        )
        _render_snapshot_locked(h_dir)
    return {"ok": True, "agent": record}


def list_agents(
    hub_dir: pathlib.Path | str | None = None,
    workspace_root: pathlib.Path | str | None = None,
) -> dict[str, Any]:
    h_dir = resolve_hub_dir(hub_dir, workspace_root)
    with _hub_lock(h_dir):
        _ensure_initialized_locked(h_dir)
        data = _read_json(h_dir / "agents.json", {"agents": {}})
        agents_map = data.get("agents", {}) if isinstance(data, dict) else {}
    agents_list = sorted(agents_map.values(), key=lambda a: str(a.get("agent_id", "")))
    return {"ok": True, "agents": agents_list}


def claim_locks(
    agent_id: str,
    paths: list[str] | str,
    reason: str = "",
    conversation_id: str = "",
    conv: str | None = None,
    ttl_minutes: float = 45.0,
    hub_dir: pathlib.Path | str | None = None,
    workspace_root: pathlib.Path | str | None = None,
) -> dict[str, Any]:
    ws_root = resolve_workspace_root(workspace_root)
    h_dir = resolve_hub_dir(hub_dir, ws_root)
    raw_paths = _split_multi_values(paths)
    if not raw_paths:
        raise ValueError("At least one path or glob must be supplied to claim_locks.")

    norm_paths: list[str] = []
    for rp in raw_paths:
        np, _ = normalize_repo_path(rp, ws_root)
        if np and np not in norm_paths:
            norm_paths.append(np)

    eff_agent = agent_id.strip()
    eff_conv = (
        conversation_id
        or conv
        or os.environ.get("SPLITBOX_CONVERSATION_ID", "")
        or ""
    ).strip()

    with _hub_lock(h_dir):
        _ensure_initialized_locked(h_dir)
        if not eff_conv:
            agents_data = _read_json(h_dir / "agents.json", {"agents": {}})
            known_agent = (agents_data.get("agents") or {}).get(eff_agent, {})
            if isinstance(known_agent, dict):
                eff_conv = str(known_agent.get("conversation_id") or "").strip()

        active_locks, _ = _prune_expired_locks_locked(h_dir)

        conflicts: list[dict[str, Any]] = []
        for req_path in norm_paths:
            for lk in active_locks:
                if _paths_overlap(str(lk.get("path", "")), req_path) and not _is_same_lock_owner(
                    lk, eff_agent, eff_conv
                ):
                    conflicts.append({"requested": req_path, "holder": lk})

        if conflicts:
            return {
                "ok": False,
                "conflict": True,
                "agent_id": eff_agent,
                "claimed": [],
                "conflicts": conflicts,
            }

        now = _utc_now()
        now_iso = _iso_utc(now)
        exp_iso = _iso_utc(now + dt.timedelta(minutes=float(ttl_minutes)))

        # Keep non-replaced locks and upsert requested paths for this agent
        updated_locks: list[dict[str, Any]] = [
            lk
            for lk in active_locks
            if not (lk.get("agent_id") == eff_agent and lk.get("path") in norm_paths)
        ]
        claimed_entries: list[dict[str, Any]] = []
        for req_path in norm_paths:
            entry = {
                "path": req_path,
                "agent_id": eff_agent,
                "conversation_id": eff_conv,
                "reason": reason,
                "claimed_at": now_iso,
                "expires_at": exp_iso,
                "ttl_minutes": float(ttl_minutes),
            }
            if float(ttl_minutes) > 0:
                updated_locks.append(entry)
            claimed_entries.append(entry)

        _atomic_write_json(h_dir / "locks.json", {"locks": updated_locks})
        _touch_agent_locked(h_dir, eff_agent, conversation_id=eff_conv or None)
        _render_snapshot_locked(h_dir)

    return {
        "ok": True,
        "conflict": False,
        "agent_id": eff_agent,
        "claimed": claimed_entries,
        "conflicts": [],
    }


def release_locks(
    agent_id: str,
    paths: list[str] | str | None = None,
    release_all: bool = False,
    conversation_id: str = "",
    conv: str | None = None,
    hub_dir: pathlib.Path | str | None = None,
    workspace_root: pathlib.Path | str | None = None,
) -> dict[str, Any]:
    ws_root = resolve_workspace_root(workspace_root)
    h_dir = resolve_hub_dir(hub_dir, ws_root)
    eff_agent = agent_id.strip()
    eff_conv = (conversation_id or conv or "").strip()

    raw_paths = _split_multi_values(paths)
    if not raw_paths:
        release_all = True
    norm_targets = {normalize_repo_path(rp, ws_root)[0] for rp in raw_paths}

    with _hub_lock(h_dir):
        _ensure_initialized_locked(h_dir)
        active_locks, _ = _prune_expired_locks_locked(h_dir)
        kept: list[dict[str, Any]] = []
        released: list[dict[str, Any]] = []

        for lk in active_locks:
            owned = (lk.get("agent_id") == eff_agent) or _is_same_lock_owner(
                lk, eff_agent, eff_conv
            )
            if owned and (
                release_all
                or lk.get("path") in norm_targets
                or any(_paths_overlap(str(lk.get("path", "")), t) for t in norm_targets)
            ):
                released.append(lk)
            else:
                kept.append(lk)

        _atomic_write_json(h_dir / "locks.json", {"locks": kept})
        if eff_agent:
            _touch_agent_locked(h_dir, eff_agent, conversation_id=eff_conv or None)
        _render_snapshot_locked(h_dir)

    return {"ok": True, "agent_id": eff_agent, "released": released, "remaining": kept}


def list_locks(
    hub_dir: pathlib.Path | str | None = None,
    workspace_root: pathlib.Path | str | None = None,
) -> dict[str, Any]:
    h_dir = resolve_hub_dir(hub_dir, workspace_root)
    with _hub_lock(h_dir):
        _ensure_initialized_locked(h_dir)
        active_locks, pruned = _prune_expired_locks_locked(h_dir)
        if pruned > 0:
            _render_snapshot_locked(h_dir)
    return {"ok": True, "locks": active_locks, "pruned_expired": pruned}


def check_path_lock(
    path: pathlib.Path | str,
    agent_id: str | None = None,
    conversation_id: str | None = None,
    conv: str | None = None,
    hub_dir: pathlib.Path | str | None = None,
    workspace_root: pathlib.Path | str | None = None,
) -> dict[str, Any]:
    ws_root = resolve_workspace_root(workspace_root)
    h_dir = resolve_hub_dir(hub_dir, ws_root)
    norm_path, inside_ws = normalize_repo_path(path, ws_root)
    eff_agent = (agent_id or os.environ.get("SPLITBOX_AGENT_ID", "") or "").strip() or None
    eff_conv = (conversation_id or conv or "").strip() or None

    if not inside_ws:
        return {
            "locked": False,
            "path": norm_path,
            "inside_workspace": False,
            "owned_by_caller": False,
            "holder": None,
            "conflicts": [],
        }

    with _hub_lock(h_dir):
        _ensure_initialized_locked(h_dir)
        active_locks, pruned = _prune_expired_locks_locked(h_dir)
        if pruned > 0:
            _render_snapshot_locked(h_dir)

    overlapping = [
        lk for lk in active_locks if _paths_overlap(str(lk.get("path", "")), norm_path)
    ]
    if not overlapping:
        return {
            "locked": False,
            "path": norm_path,
            "inside_workspace": True,
            "owned_by_caller": False,
            "holder": None,
            "conflicts": [],
        }

    foreign_conflicts = [
        lk for lk in overlapping if not _is_same_lock_owner(lk, eff_agent, eff_conv)
    ]
    if foreign_conflicts:
        primary = foreign_conflicts[0]
        return {
            "locked": True,
            "path": norm_path,
            "inside_workspace": True,
            "owned_by_caller": False,
            "holder": primary,
            "conflicts": foreign_conflicts,
        }

    return {
        "locked": False,
        "path": norm_path,
        "inside_workspace": True,
        "owned_by_caller": True,
        "holder": overlapping[0],
        "conflicts": [],
    }


def post_event(
    sender: str = "",
    msg: str = "",
    to: str = "all",
    channel: str = "main",
    kind: str = "message",
    files: list[str] | str | None = None,
    next_step: str = "",
    summary: str = "",
    conversation_id: str = "",
    conv: str | None = None,
    dedupe_window_seconds: float = 0.0,
    from_agent: str | None = None,
    agent_id: str | None = None,
    message: str | None = None,
    next_action: str | None = None,
    hub_dir: pathlib.Path | str | None = None,
    workspace_root: pathlib.Path | str | None = None,
) -> dict[str, Any]:
    ws_root = resolve_workspace_root(workspace_root)
    h_dir = resolve_hub_dir(hub_dir, ws_root)

    eff_sender = (sender or from_agent or agent_id or "system").strip()
    eff_msg = msg if msg else (message or summary or "")
    eff_summary = summary if summary else eff_msg
    eff_next = next_step if next_step else (next_action or "")
    eff_conv = (conversation_id or conv or "").strip()

    raw_files = _split_multi_values(files)
    norm_files = [normalize_repo_path(f, ws_root)[0] for f in raw_files]

    with _hub_lock(h_dir):
        _ensure_initialized_locked(h_dir)
        events_path = h_dir / "events.jsonl"
        events = _read_events(events_path)
        now = _utc_now()
        now_iso = _iso_utc(now)

        if dedupe_window_seconds > 0 and events:
            last = events[-1]
            last_dt = _parse_iso(str(last.get("created_at", "")))
            if (
                last.get("kind") == kind
                and last.get("from") == eff_sender
                and last.get("files") == norm_files
                and last_dt is not None
                and (now - last_dt).total_seconds() <= dedupe_window_seconds
            ):
                last["created_at"] = now_iso
                last["count"] = int(last.get("count", 1)) + 1
                _write_events(events_path, events)
                _render_snapshot_locked(h_dir)
                return {"ok": True, "deduplicated": True, "event": last}

        next_seq = (max(int(ev.get("seq", 0)) for ev in events) + 1) if events else 1
        event: dict[str, Any] = {
            "seq": next_seq,
            "kind": kind,
            "from": eff_sender,
            "to": (to or "all").strip(),
            "channel": (channel or "main").strip(),
            "msg": eff_msg,
            "summary": eff_summary,
            "files": norm_files,
            "next": eff_next,
            "created_at": now_iso,
        }
        if eff_conv:
            event["conversation_id"] = eff_conv

        events.append(event)
        _write_events(events_path, events)
        if eff_sender and eff_sender != "system":
            _touch_agent_locked(h_dir, eff_sender, conversation_id=eff_conv or None)
        _render_snapshot_locked(h_dir)

    return {"ok": True, "deduplicated": False, "event": event}


def record_decision(
    author: str,
    title: str,
    summary: str,
    rationale: str = "",
    tags: list[str] | str | None = None,
    hub_dir: pathlib.Path | str | None = None,
    workspace_root: pathlib.Path | str | None = None,
) -> dict[str, Any]:
    h_dir = resolve_hub_dir(hub_dir, workspace_root)
    tag_list = _split_csv_values(tags)

    with _hub_lock(h_dir):
        _ensure_initialized_locked(h_dir)
        dec_path = h_dir / "decisions.json"
        data = _read_json(dec_path, {"next_id": 1, "decisions": []})
        decisions = list(data.get("decisions") or [])
        next_num = max(int(data.get("next_id", 1)), len(decisions) + 1)
        entry = {
            "id": f"DEC-{next_num:03d}",
            "author": author.strip() or "agent",
            "title": title.strip(),
            "summary": summary.strip(),
            "rationale": rationale.strip(),
            "tags": tag_list,
            "created_at": _iso_utc(),
        }
        decisions.append(entry)
        _atomic_write_json(dec_path, {"next_id": next_num + 1, "decisions": decisions})
        if author.strip():
            _touch_agent_locked(h_dir, author.strip())
        _render_snapshot_locked(h_dir)

    return {"ok": True, "decision": entry}


def list_decisions(
    tag: str | None = None,
    hub_dir: pathlib.Path | str | None = None,
    workspace_root: pathlib.Path | str | None = None,
) -> dict[str, Any]:
    h_dir = resolve_hub_dir(hub_dir, workspace_root)
    with _hub_lock(h_dir):
        _ensure_initialized_locked(h_dir)
        data = _read_json(h_dir / "decisions.json", {"decisions": []})
        decisions = list(data.get("decisions") or [])
    if tag:
        decisions = [d for d in decisions if tag in (d.get("tags") or [])]
    return {"ok": True, "decisions": decisions}


def get_inbox(
    agent_id: str,
    since: int | None = None,
    ack: bool = False,
    limit: int | None = None,
    hub_dir: pathlib.Path | str | None = None,
    workspace_root: pathlib.Path | str | None = None,
) -> dict[str, Any]:
    h_dir = resolve_hub_dir(hub_dir, workspace_root)
    eff_agent = agent_id.strip()

    with _hub_lock(h_dir):
        _ensure_initialized_locked(h_dir)
        agents_path = h_dir / "agents.json"
        agents_data = _read_json(agents_path, {"agents": {}})
        agents_map = agents_data.get("agents", {}) if isinstance(agents_data, dict) else {}
        agent_rec = agents_map.get(eff_agent, {}) if isinstance(agents_map.get(eff_agent), dict) else {}
        stored_cursor = int(agent_rec.get("inbox_cursor", 0))
        effective_since = int(since) if since is not None else stored_cursor

        events = _read_events(h_dir / "events.jsonl")
        head_seq = max((int(ev.get("seq", 0)) for ev in events), default=0)

        matched = [
            ev
            for ev in events
            if int(ev.get("seq", 0)) > effective_since
            and ev.get("kind") in ("message", "handoff")
            and ev.get("to") in (eff_agent, "all")
        ]
        if limit is not None and limit > 0:
            matched = matched[-limit:]

        new_cursor = stored_cursor
        if ack:
            ack_target = max(
                [stored_cursor, head_seq] + [int(ev.get("seq", 0)) for ev in matched]
            )
            rec = _touch_agent_locked(h_dir, eff_agent)
            rec["inbox_cursor"] = ack_target
            agents_map = _read_json(agents_path, {"agents": {}}).get("agents", {})
            agents_map[eff_agent] = rec
            _atomic_write_json(agents_path, {"agents": agents_map})
            new_cursor = ack_target
            _render_snapshot_locked(h_dir)

    return {
        "ok": True,
        "agent_id": eff_agent,
        "since": effective_since,
        "acked": ack,
        "inbox_cursor": new_cursor,
        "messages": matched,
    }


def get_board(
    since: int = 0,
    channel: str | None = None,
    limit: int = 20,
    hub_dir: pathlib.Path | str | None = None,
    workspace_root: pathlib.Path | str | None = None,
) -> dict[str, Any]:
    h_dir = resolve_hub_dir(hub_dir, workspace_root)
    with _hub_lock(h_dir):
        _ensure_initialized_locked(h_dir)
        events = _read_events(h_dir / "events.jsonl")
        head_seq = max((int(ev.get("seq", 0)) for ev in events), default=0)

    filtered = [ev for ev in events if int(ev.get("seq", 0)) > int(since)]
    if channel:
        filtered = [ev for ev in filtered if ev.get("channel") == channel]
    if limit and limit > 0:
        filtered = filtered[-limit:]

    return {
        "ok": True,
        "since": int(since),
        "channel": channel,
        "head": head_seq,
        "events": filtered,
    }


def _load_codebase_indexer() -> Any | None:
    harness_str = str(HARNESS_DIR)
    if harness_str not in sys.path:
        sys.path.insert(0, harness_str)
    try:
        import codebase_indexer  # type: ignore

        return codebase_indexer
    except ImportError:
        return None


def query_codebase(
    query: str,
    limit: int = 8,
    hub_dir: pathlib.Path | str | None = None,
    workspace_root: pathlib.Path | str | None = None,
) -> dict[str, Any]:
    ws_root = resolve_workspace_root(workspace_root)
    h_dir = resolve_hub_dir(hub_dir, ws_root)
    indexer = _load_codebase_indexer()
    if indexer is None or not hasattr(indexer, "query_index"):
        return {
            "ok": False,
            "available": False,
            "query": query,
            "matches": [],
            "message": "codebase_indexer.py is not present yet in harness/; once built, run `agent_hub.py reindex`.",
        }
    res = indexer.query_index(query, workspace_root=ws_root, hub_dir=h_dir, limit=limit)
    if isinstance(res, dict):
        res.setdefault("ok", True)
        res.setdefault("available", True)
        return res
    return {"ok": True, "available": True, "query": query, "matches": res}


def reindex_codebase(
    hub_dir: pathlib.Path | str | None = None,
    workspace_root: pathlib.Path | str | None = None,
) -> dict[str, Any]:
    ws_root = resolve_workspace_root(workspace_root)
    h_dir = resolve_hub_dir(hub_dir, ws_root)
    indexer = _load_codebase_indexer()
    if indexer is None or not hasattr(indexer, "build_index"):
        return {
            "ok": False,
            "available": False,
            "message": "codebase_indexer.py is not present yet in harness/.",
        }
    index_data = indexer.build_index(workspace_root=ws_root, hub_dir=h_dir)
    files_count = len(index_data.get("files", {})) if isinstance(index_data, dict) else 0
    return {
        "ok": True,
        "available": True,
        "hub_dir": str(h_dir),
        "indexed_files": files_count,
    }


# ============================================================================
# CLI Argument Parser & Formatting
# ============================================================================


def _add_shared_flags(p: argparse.ArgumentParser, is_root: bool = False) -> None:
    default_val: Any = None if is_root else argparse.SUPPRESS
    json_default: Any = False if is_root else argparse.SUPPRESS
    p.add_argument(
        "--hub-dir",
        default=default_val,
        help="Override SplitBox hub directory (default: SPLITBOX_HUB_DIR or .agents/hub)",
    )
    p.add_argument(
        "--json",
        action="store_true",
        default=json_default,
        help="Emit machine-readable JSON output",
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="agent_hub.py",
        description="SplitBox Multi-Agent Communication Bus, Unified Goal & Lock Registry",
    )
    _add_shared_flags(parser, is_root=True)
    sub = parser.add_subparsers(dest="command", required=True)

    # 1. init
    p_init = sub.add_parser("init", help="Idempotently seed .agents/hub/ and SNAPSHOT.md")
    _add_shared_flags(p_init)

    # 2. brief
    p_brief = sub.add_parser("brief", help="Print SNAPSHOT.md + optional unread agent inbox (<120 lines)")
    _add_shared_flags(p_brief)
    p_brief.add_argument("--agent", default=None, help="Agent ID to include unread inbox for")
    p_brief.add_argument("--compact", action="store_true", help="Compact output mode")

    # 3. goal
    p_goal = sub.add_parser("goal", help="Inspect or update Unified Goal and milestones")
    _add_shared_flags(p_goal)
    goal_sub = p_goal.add_subparsers(dest="goal_cmd")

    p_goal_show = goal_sub.add_parser("show", help="Show Unified Goal, gates, and milestones")
    _add_shared_flags(p_goal_show)

    p_goal_set = goal_sub.add_parser("set", help="Update Unified Goal title and summary")
    _add_shared_flags(p_goal_set)
    p_goal_set.add_argument("--title", required=True, help="Unified Goal title")
    p_goal_set.add_argument("--summary", required=True, help="Unified Goal summary")

    p_goal_ms = goal_sub.add_parser("milestone", help="Create or update a milestone / gate")
    _add_shared_flags(p_goal_ms)
    p_goal_ms.add_argument("--id", required=True, dest="milestone_id", help="Milestone or gate ID")
    p_goal_ms.add_argument("--title", default=None, dest="milestone_title", help="Milestone title")
    p_goal_ms.add_argument(
        "--status",
        required=True,
        choices=VALID_MILESTONE_STATUSES,
        help="Status: todo|in_progress|review|done|blocked",
    )
    p_goal_ms.add_argument("--owner", default=None, help="Owning agent ID")
    p_goal_ms.add_argument("--note", default=None, help="Progress or verification note")

    # 4. register & agents
    p_reg = sub.add_parser("register", help="Register or heartbeat an agent")
    _add_shared_flags(p_reg)
    p_reg.add_argument("--agent", required=True, help="Agent identifier")
    p_reg.add_argument("--role", required=True, help="Agent role (e.g. manager, builder, qa)")
    p_reg.add_argument("--focus", default="", help="Current task slice or focus")
    p_reg.add_argument("--conv", default="", help="Antigravity conversationId")

    p_agents = sub.add_parser("agents", help="List registered agents and last seen timestamps")
    _add_shared_flags(p_agents)

    # 5. claim, release, locks, check-lock
    p_claim = sub.add_parser("claim", help="Claim exclusive TTL file/glob locks")
    _add_shared_flags(p_claim)
    p_claim.add_argument("--agent", required=True, help="Agent identifier")
    p_claim.add_argument(
        "--paths",
        required=True,
        nargs="+",
        help="Comma- or space-separated repo paths or globs (e.g. src/components/basket/*)",
    )
    p_claim.add_argument("--reason", default="", help="Reason for claiming slice")
    p_claim.add_argument("--conv", default="", help="Antigravity conversationId")
    p_claim.add_argument("--ttl", type=float, default=45.0, help="Lease TTL in minutes (default: 45)")

    p_rel = sub.add_parser("release", help="Release locks held by an agent")
    _add_shared_flags(p_rel)
    p_rel.add_argument("--agent", required=True, help="Agent identifier")
    p_rel.add_argument("--paths", nargs="*", default=None, help="Specific paths/globs to release")
    p_rel.add_argument("--all", action="store_true", dest="release_all", help="Release all locks for agent")
    p_rel.add_argument("--conv", default="", help="Antigravity conversationId")

    p_locks = sub.add_parser("locks", help="List active locks (auto-pruning expired TTL leases)")
    _add_shared_flags(p_locks)

    p_check = sub.add_parser(
        "check-lock",
        help="Exit 0 if path is unlocked or owned by caller; exit 2 if locked by another agent/conv",
    )
    _add_shared_flags(p_check)
    p_check.add_argument("--path", required=True, help="Target file or directory path")
    p_check.add_argument("--agent", default=None, help="Caller agent ID")
    p_check.add_argument("--conv", default=None, help="Caller conversationId")

    # 6. post
    p_post = sub.add_parser("post", help="Post a message to the persistent agent event bus")
    _add_shared_flags(p_post)
    p_post.add_argument("--from", required=True, dest="sender", help="Sender agent ID")
    p_post.add_argument("--to", default="all", help="Recipient agent ID or 'all'")
    p_post.add_argument("--channel", default="main", help="Channel name (default: main)")
    p_post.add_argument("--msg", required=True, help="Message body")
    p_post.add_argument("--files", nargs="*", default=None, help="CSV or space-separated related files")
    p_post.add_argument("--conv", default="", help="Optional conversationId")

    # 7. handoff
    p_handoff = sub.add_parser("handoff", help="Record a structured peer handoff")
    _add_shared_flags(p_handoff)
    p_handoff.add_argument("--from", required=True, dest="sender", help="Sender agent ID")
    p_handoff.add_argument("--to", default="all", help="Next peer agent ID or 'all'")
    p_handoff.add_argument("--channel", default="main", help="Channel name (default: main)")
    p_handoff.add_argument("--summary", required=True, help="Summary of completed work")
    p_handoff.add_argument("--files", nargs="*", default=None, help="CSV or space-separated touched files")
    p_handoff.add_argument("--next", default="", dest="next_step", help="Recommended next step")
    p_handoff.add_argument("--conv", default="", help="Optional conversationId")

    # 8. decision & decisions
    p_dec = sub.add_parser("decision", help="Record a durable architectural/spec decision")
    _add_shared_flags(p_dec)
    p_dec.add_argument("--author", required=True, help="Author agent ID")
    p_dec.add_argument("--title", required=True, help="Short decision title")
    p_dec.add_argument("--summary", required=True, help="Concise decision rule/outcome")
    p_dec.add_argument("--rationale", default="", help="Why this decision was made")
    p_dec.add_argument("--tags", default="", help="Comma-separated tags")

    p_decs = sub.add_parser("decisions", help="List recorded architectural decisions")
    _add_shared_flags(p_decs)
    p_decs.add_argument("--tag", default=None, help="Filter by tag")

    # 9. inbox & board
    p_inbox = sub.add_parser("inbox", help="Read messages/handoffs directed to an agent or 'all'")
    _add_shared_flags(p_inbox)
    p_inbox.add_argument("--agent", required=True, help="Agent ID")
    p_inbox.add_argument("--since", type=int, default=None, help="Override sequence cursor")
    p_inbox.add_argument("--ack", action="store_true", help="Advance agent's read cursor in agents.json")
    p_inbox.add_argument("--limit", type=int, default=None, help="Max messages to return")

    p_board = sub.add_parser("board", help="Read recent events on the shared bus")
    _add_shared_flags(p_board)
    p_board.add_argument("--since", type=int, default=0, help="Return events after sequence number")
    p_board.add_argument("--channel", default=None, help="Filter by channel")
    p_board.add_argument("--limit", type=int, default=20, help="Max events to return (default: 20)")

    # 10. query & reindex
    p_query = sub.add_parser("query", help="O(1) symbol/token search via codebase_indexer")
    _add_shared_flags(p_query)
    p_query.add_argument("terms", nargs="+", help="Search terms (e.g. DropContext SliceMeter)")
    p_query.add_argument("--limit", type=int, default=8, help="Max matches (default: 8)")

    p_reindex = sub.add_parser("reindex", help="Rebuild codebase_index.json and CODEBASE_MAP.md")
    _add_shared_flags(p_reindex)

    return parser


def _emit(data: dict[str, Any], as_json: bool, human_text: str | None = None) -> None:
    if as_json or human_text is None:
        sys.stdout.write(json.dumps(data, indent=2 if as_json else None, ensure_ascii=False) + "\n")
    else:
        sys.stdout.write(human_text if human_text.endswith("\n") else human_text + "\n")


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    h_dir = args.hub_dir
    as_json = bool(args.json)
    cmd = args.command

    if cmd == "init":
        res = init_hub(hub_dir=h_dir)
        _emit(
            res,
            as_json,
            f"Initialized SplitBox Hub at {res['hub_dir']} (created: {', '.join(res['created_files']) or 'already up-to-date'}; SNAPSHOT.md: {res['snapshot_lines']} lines).",
        )
        return 0

    if cmd == "brief":
        res = get_brief(agent_id=args.agent, compact=args.compact, hub_dir=h_dir)
        _emit(res, as_json, res["text"])
        return 0

    if cmd == "goal":
        gcmd = getattr(args, "goal_cmd", None) or "show"
        if gcmd == "show":
            res = get_goal(hub_dir=h_dir)
            m = res["mission"]
            lines = [
                f"Project: {m.get('project')} — {m.get('title')}",
                f"Summary: {m.get('summary')}",
                "Acceptance Gates:",
                *[
                    f"  - [{g.get('status', 'todo').upper()}] {g.get('id')}: {g.get('title')} ({g.get('criteria')})"
                    for g in (m.get("acceptance_gates") or [])
                ],
                "Milestones:",
                *[
                    f"  - [{ms.get('status', 'todo').upper()}] {ms.get('id')}: {ms.get('title')} (owner: {ms.get('owner') or '-'}; note: {ms.get('note') or '-'})"
                    for ms in (m.get("milestones") or [])
                ],
            ]
            _emit(res, as_json, "\n".join(lines))
            return 0
        if gcmd == "set":
            res = update_goal(title=args.title, summary=args.summary, hub_dir=h_dir)
            _emit(res, as_json, f"Updated Unified Goal: {args.title}")
            return 0
        if gcmd == "milestone":
            res = update_goal(
                milestone_id=args.milestone_id,
                milestone_title=args.milestone_title,
                status=args.status,
                owner=args.owner,
                note=args.note,
                hub_dir=h_dir,
            )
            ms = res["updated_milestone"] or {}
            _emit(
                res,
                as_json,
                f"Milestone `{ms.get('id')}` -> [{str(ms.get('status')).upper()}] {ms.get('title')}",
            )
            return 0

    if cmd == "register":
        res = register_agent(
            agent_id=args.agent,
            role=args.role,
            focus=args.focus,
            conversation_id=args.conv,
            hub_dir=h_dir,
        )
        ag = res["agent"]
        _emit(
            res,
            as_json,
            f"Registered agent `{ag['agent_id']}` (role={ag['role']}, conv={ag['conversation_id'] or '-'}).",
        )
        return 0

    if cmd == "agents":
        res = list_agents(hub_dir=h_dir)
        if not res["agents"]:
            txt = "No registered agents."
        else:
            txt = "\n".join(
                f"- {a['agent_id']} [{a.get('role', 'agent')}] last_seen={a.get('last_seen')} cursor=#{a.get('inbox_cursor', 0)} focus={a.get('focus') or '-'}"
                for a in res["agents"]
            )
        _emit(res, as_json, txt)
        return 0

    if cmd == "claim":
        res = claim_locks(
            agent_id=args.agent,
            paths=args.paths,
            reason=args.reason,
            conversation_id=args.conv,
            ttl_minutes=args.ttl,
            hub_dir=h_dir,
        )
        if res["conflict"]:
            holders = ", ".join(
                f"{c['requested']} held by {c['holder'].get('agent_id')} ({c['holder'].get('path')})"
                for c in res["conflicts"]
            )
            _emit(res, as_json, f"LOCK CONFLICT: {holders}")
            return 2
        claimed_paths = ", ".join(c["path"] for c in res["claimed"])
        _emit(res, as_json, f"Claimed [{claimed_paths}] for `{args.agent}` (ttl={args.ttl:g}m).")
        return 0

    if cmd == "release":
        res = release_locks(
            agent_id=args.agent,
            paths=args.paths,
            release_all=args.release_all,
            conversation_id=args.conv,
            hub_dir=h_dir,
        )
        rel_paths = ", ".join(r["path"] for r in res["released"]) or "none"
        _emit(res, as_json, f"Released locks for `{args.agent}`: {rel_paths}.")
        return 0

    if cmd == "locks":
        res = list_locks(hub_dir=h_dir)
        if not res["locks"]:
            txt = "No active file locks."
        else:
            txt = "\n".join(
                f"- {lk['path']} -> {lk['agent_id']} (conv={lk.get('conversation_id') or '-'}, expires={lk['expires_at']}) {lk.get('reason') or ''}".rstrip()
                for lk in res["locks"]
            )
        _emit(res, as_json, txt)
        return 0

    if cmd == "check-lock":
        res = check_path_lock(
            path=args.path,
            agent_id=args.agent,
            conversation_id=args.conv,
            hub_dir=h_dir,
        )
        # Always emit JSON payload for check-lock per contract (`{"locked": false}` / `{"locked": true, "holder": ...}`)
        sys.stdout.write(json.dumps(res, indent=2 if as_json else None, ensure_ascii=False) + "\n")
        return 2 if res["locked"] else 0

    if cmd == "post":
        res = post_event(
            sender=args.sender,
            to=args.to,
            channel=args.channel,
            kind="message",
            msg=args.msg,
            files=args.files,
            conversation_id=args.conv,
            hub_dir=h_dir,
        )
        ev = res["event"]
        _emit(res, as_json, f"Posted #{ev['seq']} [{ev['channel']}] {ev['from']} -> {ev['to']}: {ev['msg']}")
        return 0

    if cmd == "handoff":
        res = post_event(
            sender=args.sender,
            to=args.to,
            channel=args.channel,
            kind="handoff",
            msg=args.summary,
            summary=args.summary,
            files=args.files,
            next_step=args.next_step,
            conversation_id=args.conv,
            hub_dir=h_dir,
        )
        ev = res["event"]
        _emit(
            res,
            as_json,
            f"Recorded handoff #{ev['seq']} {ev['from']} -> {ev['to']}: {ev['summary']}",
        )
        return 0

    if cmd == "decision":
        res = record_decision(
            author=args.author,
            title=args.title,
            summary=args.summary,
            rationale=args.rationale,
            tags=args.tags,
            hub_dir=h_dir,
        )
        dec = res["decision"]
        _emit(res, as_json, f"Recorded {dec['id']} ({dec['title']}) by {dec['author']}.")
        return 0

    if cmd == "decisions":
        res = list_decisions(tag=args.tag, hub_dir=h_dir)
        if not res["decisions"]:
            txt = "No decisions recorded."
        else:
            txt = "\n".join(
                f"- {d['id']} [{', '.join(d.get('tags') or [])}] {d['title']}: {d['summary']}"
                for d in res["decisions"]
            )
        _emit(res, as_json, txt)
        return 0

    if cmd == "inbox":
        res = get_inbox(
            agent_id=args.agent,
            since=args.since,
            ack=args.ack,
            limit=args.limit,
            hub_dir=h_dir,
        )
        if not res["messages"]:
            txt = f"Inbox for `{args.agent}`: 0 messages (cursor=#{res['inbox_cursor']})."
        else:
            txt = "\n".join(
                f"- #{m['seq']} [{m['kind']}] {m['from']} -> {m['to']}: {m.get('summary') or m.get('msg')}"
                for m in res["messages"]
            )
        _emit(res, as_json, txt)
        return 0

    if cmd == "board":
        res = get_board(since=args.since, channel=args.channel, limit=args.limit, hub_dir=h_dir)
        if not res["events"]:
            txt = f"No events on board (since=#{args.since}, head=#{res['head']})."
        else:
            txt = "\n".join(
                f"- #{e['seq']} [{e.get('channel', 'main')}/{e['kind']}] {e['from']} -> {e['to']}: {e.get('summary') or e.get('msg')}"
                for e in res["events"]
            )
        _emit(res, as_json, txt)
        return 0

    if cmd == "query":
        q_str = " ".join(args.terms).strip()
        res = query_codebase(query=q_str, limit=args.limit, hub_dir=h_dir)
        if not res.get("available", True):
            _emit(res, as_json, res.get("message", "Codebase indexer not available yet."))
            return 0
        matches = res.get("matches") or []
        if not matches:
            txt = f"No codebase matches for {q_str!r}."
        else:
            lines = []
            for idx, m in enumerate(matches, 1):
                loc = f"{m.get('path')}#L{m.get('line')}" if m.get("line") else str(m.get("path"))
                sig = m.get("signature") or m.get("summary") or ""
                imp = m.get("imported_by") or []
                imp_str = f" [imported_by: {', '.join(imp[:3])}]" if imp else ""
                lines.append(f"[{idx}] {loc} ({m.get('kind', 'match')}) {m.get('name', '')} — {sig}{imp_str}")
            txt = "\n".join(lines)
        _emit(res, as_json, txt)
        return 0

    if cmd == "reindex":
        res = reindex_codebase(hub_dir=h_dir)
        if not res.get("available", True):
            _emit(res, as_json, res.get("message", "Codebase indexer not available yet."))
            return 0
        _emit(
            res,
            as_json,
            f"Reindexed {res.get('indexed_files', 0)} workspace files into {res.get('hub_dir')}.",
        )
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())
