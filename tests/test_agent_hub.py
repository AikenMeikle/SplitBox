#!/usr/bin/env python3
"""Comprehensive QA & Integration Test Suite for the SplitBox Multi-Agent Hub.

Covers:
1. O(1) Codebase Context Indexer (`harness/codebase_indexer.py`)
2. Unified Goal, Messaging, Decisions & Lock Concurrency (`harness/agent_hub.py`)
3. Antigravity Lifecycle Hook Contracts (`harness/hub_hooks.py` & `.agents/hooks.json`)
4. Live Workspace State, Harness/Docs Contracts & SplitBox Build Regression Gate

All state-mutating tests run against isolated temporary `SPLITBOX_HUB_DIR` directories
so live `.agents/hub/` state is NEVER dirtied by test execution.
"""

from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor
import importlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import unittest


WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
HARNESS_DIR = WORKSPACE_ROOT / "harness"
AGENTS_DIR = WORKSPACE_ROOT / ".agents"
LIVE_HUB_DIR = AGENTS_DIR / "hub"

CODEBASE_INDEXER_PY = HARNESS_DIR / "codebase_indexer.py"
AGENT_HUB_PY = HARNESS_DIR / "agent_hub.py"
HUB_HOOKS_PY = HARNESS_DIR / "hub_hooks.py"
HOOKS_JSON = AGENTS_DIR / "hooks.json"

if str(HARNESS_DIR) not in sys.path:
    sys.path.insert(0, str(HARNESS_DIR))


def _count_raw_src_lines() -> int:
    total = 0
    src_dir = WORKSPACE_ROOT / "src"
    for p in src_dir.rglob("*"):
        if p.is_file() and p.suffix in {".ts", ".tsx", ".css"}:
            total += len(p.read_text(encoding="utf-8").splitlines())
    return total


def _extract_list(payload: object, candidate_keys: tuple[str, ...]) -> list[dict]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for k in candidate_keys:
            val = payload.get(k)
            if isinstance(val, list):
                return val
    raise AssertionError(
        f"Expected list or dict containing one of {candidate_keys}, got: {type(payload).__name__} {payload!r}"
    )


def _stress_worker_task(args: tuple[int, str, int]) -> dict:
    """Top-level multiprocessing worker hammering `agent_hub.py` concurrently."""
    worker_id, hub_dir_str, num_messages = args
    agent_name = f"stress-worker-{worker_id}"
    conv_id = f"conv-stress-{worker_id}"
    own_path = f"src/components/worker_{worker_id}_slice.tsx"
    contested_path = "src/components/shared_contested_crate.tsx"

    env = os.environ.copy()
    env["SPLITBOX_HUB_DIR"] = hub_dir_str
    cmd_base = [sys.executable, str(AGENT_HUB_PY)]

    def run_cli(*cli_args: str, allow_codes: tuple[int, ...] = (0,)) -> subprocess.CompletedProcess[str]:
        proc = subprocess.run(
            [*cmd_base, *cli_args],
            cwd=str(WORKSPACE_ROOT),
            env=env,
            capture_output=True,
            text=True,
            timeout=15,
        )
        if proc.returncode not in allow_codes:
            raise RuntimeError(
                f"Worker {worker_id} CLI {cli_args} failed (rc={proc.returncode}): "
                f"stdout={proc.stdout!r} stderr={proc.stderr!r}"
            )
        return proc

    run_cli("register", "--agent", agent_name, "--role", "Stress Builder", "--conv", conv_id)
    run_cli("claim", "--agent", agent_name, "--paths", own_path, "--reason", "Own slice", "--conv", conv_id)

    posted_markers: list[str] = []
    contested_wins = 0

    for i in range(num_messages):
        marker = f"msg-{worker_id}-{i}"
        run_cli(
            "post",
            "--from",
            agent_name,
            "--to",
            "all",
            "--msg",
            f"Concurrent update {marker}",
            "--files",
            own_path,
        )
        posted_markers.append(marker)

        # Contend on a shared file lock simultaneously across processes
        claim_proc = run_cli(
            "claim",
            "--agent",
            agent_name,
            "--paths",
            contested_path,
            "--reason",
            f"Contended round {i}",
            "--conv",
            conv_id,
            allow_codes=(0, 1, 2),
        )
        if claim_proc.returncode == 0:
            contested_wins += 1
            chk = run_cli(
                "check-lock",
                "--path",
                contested_path,
                "--agent",
                agent_name,
                "--conv",
                conv_id,
                allow_codes=(0, 2),
            )
            if chk.returncode == 0:
                run_cli("release", "--agent", agent_name, "--paths", contested_path)

    run_cli(
        "decision",
        "--author",
        agent_name,
        "--title",
        f"Decision from {agent_name}",
        "--summary",
        f"Validated flock safety in worker {worker_id}",
    )
    run_cli("release", "--agent", agent_name, "--all")
    return {
        "worker_id": worker_id,
        "agent_name": agent_name,
        "posted_markers": posted_markers,
        "contested_wins": contested_wins,
    }


class HubTestBase(unittest.TestCase):
    """Provides an isolated temp SPLITBOX_HUB_DIR and verifies live `.agents/hub/` stays untouched."""

    def setUp(self) -> None:
        self._tmp_dir = tempfile.TemporaryDirectory(prefix="splitbox_hub_ut_")
        self.hub_dir = Path(self._tmp_dir.name) / "hub"
        self.hub_dir.mkdir(parents=True, exist_ok=True)
        self._prev_env = os.environ.get("SPLITBOX_HUB_DIR")
        os.environ["SPLITBOX_HUB_DIR"] = str(self.hub_dir)

    def tearDown(self) -> None:
        if self._prev_env is None:
            os.environ.pop("SPLITBOX_HUB_DIR", None)
        else:
            os.environ["SPLITBOX_HUB_DIR"] = self._prev_env
        self._tmp_dir.cleanup()

    def run_cmd(
        self,
        args: list[str],
        *,
        cwd: Path = WORKSPACE_ROOT,
        hub_dir: Path | None = None,
        extra_env: dict[str, str] | None = None,
        stdin_text: str | None = None,
        expected_rc: tuple[int, ...] | None = (0,),
    ) -> subprocess.CompletedProcess[str]:
        env = os.environ.copy()
        env["SPLITBOX_HUB_DIR"] = str(hub_dir or self.hub_dir)
        if extra_env:
            env.update(extra_env)
        proc = subprocess.run(
            args,
            cwd=str(cwd),
            env=env,
            input=stdin_text,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if expected_rc is not None and proc.returncode not in expected_rc:
            self.fail(
                f"Command {args} exited with {proc.returncode} (expected {expected_rc}).\n"
                f"STDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}"
            )
        return proc


class TestCodebaseIndexer(HubTestBase):
    """1. O(1) Codebase Context Indexer Tests (`harness/codebase_indexer.py`)."""

    @classmethod
    def setUpClass(cls) -> None:
        assert CODEBASE_INDEXER_PY.is_file(), f"Missing {CODEBASE_INDEXER_PY}"
        cls.indexer = importlib.import_module("codebase_indexer")
        cls.raw_src_lines = _count_raw_src_lines()

    def test_01_build_index_speed_schema_and_compact_map(self) -> None:
        t0 = time.perf_counter()
        index_data = self.indexer.build_index(workspace_root=WORKSPACE_ROOT, hub_dir=self.hub_dir)
        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        self.assertLess(
            elapsed_ms,
            500.0,
            f"build_index took {elapsed_ms:.1f}ms, exceeding <500ms budget",
        )
        self.assertIsInstance(index_data, dict)

        index_json_path = self.hub_dir / "codebase_index.json"
        map_md_path = self.hub_dir / "CODEBASE_MAP.md"
        self.assertTrue(index_json_path.is_file(), "codebase_index.json was not written")
        self.assertTrue(map_md_path.is_file(), "CODEBASE_MAP.md was not written")

        parsed_json = json.loads(index_json_path.read_text(encoding="utf-8"))
        self.assertIsInstance(parsed_json, dict)

        map_text = map_md_path.read_text(encoding="utf-8")
        map_lines = map_text.splitlines()
        self.assertGreater(len(map_lines), 20, "CODEBASE_MAP.md should contain high-signal sections")
        self.assertLessEqual(
            len(map_lines),
            160,
            f"CODEBASE_MAP.md has {len(map_lines)} lines, exceeding <= 160 line limit",
        )
        self.assertLess(
            len(map_lines),
            self.raw_src_lines // 20,
            "CODEBASE_MAP.md should be >95% smaller than raw src/ files",
        )
        self.assertRegex(map_text, r"#L\d+", "CODEBASE_MAP.md must include #L<line> pointers")
        for expected_term in ("DropContext", "SliceMeter", "--sb-"):
            self.assertIn(expected_term, map_text)

    def test_02_query_index_locates_symbols_and_css_tokens_accurately(self) -> None:
        self.indexer.build_index(workspace_root=WORKSPACE_ROOT, hub_dir=self.hub_dir)

        cases = [
            ("DropContext", "src/store/DropContext.tsx"),
            ("SliceMeter", "src/components/storefront/SliceMeter.tsx"),
            ("CatalogItem", "src/types.ts"),
            ("--sb-", "src/index.css"),
        ]
        for term, expected_path in cases:
            t0 = time.perf_counter()
            result = self.indexer.query_index(
                term, workspace_root=WORKSPACE_ROOT, hub_dir=self.hub_dir, limit=10
            )
            query_ms = (time.perf_counter() - t0) * 1000.0
            self.assertLess(query_ms, 100.0, f"query_index({term!r}) took {query_ms:.1f}ms")
            self.assertEqual(result.get("query"), term)
            matches = result.get("matches")
            self.assertIsInstance(matches, list, f"Matches missing for {term!r}: {result!r}")
            self.assertGreater(len(matches), 0, f"Zero matches returned for {term!r}")

            matching_entry = next(
                (
                    m
                    for m in matches
                    if str(m.get("path", "")).replace("\\", "/").endswith(expected_path)
                ),
                None,
            )
            self.assertIsNotNone(
                matching_entry,
                f"Expected {expected_path} in query_index({term!r}) matches, got: "
                f"{[m.get('path') for m in matches]}",
            )
            line_no = matching_entry.get("line")
            self.assertIsInstance(line_no, int, f"Expected integer line number in {matching_entry!r}")
            self.assertGreaterEqual(line_no, 1)

        # Verify CLI query subcommand with --hub-dir and --json
        cli_proc = self.run_cmd(
            [
                sys.executable,
                str(CODEBASE_INDEXER_PY),
                "query",
                "SliceMeter",
                "--hub-dir",
                str(self.hub_dir),
                "--json",
            ]
        )
        cli_json = json.loads(cli_proc.stdout)
        self.assertTrue(
            any("SliceMeter.tsx" in str(m.get("path", "")) for m in cli_json.get("matches", []))
        )

    def test_03_update_single_file_incremental_add_edit_delete(self) -> None:
        # Build a miniature temp workspace so we never touch live `src/`
        temp_ws = Path(self._tmp_dir.name) / "mock_ws"
        (temp_ws / "src" / "components" / "storefront").mkdir(parents=True)
        shutil.copy2(WORKSPACE_ROOT / "src" / "types.ts", temp_ws / "src" / "types.ts")
        shutil.copy2(WORKSPACE_ROOT / "src" / "index.css", temp_ws / "src" / "index.css")
        shutil.copy2(WORKSPACE_ROOT / "brief.md", temp_ws / "brief.md")

        self.indexer.build_index(workspace_root=temp_ws, hub_dir=self.hub_dir)

        widget_path = temp_ws / "src" / "components" / "storefront" / "TempCrateBadge.tsx"
        widget_path.write_text(
            "export interface TempCrateBadgeProps {\n"
            "  penceSaved: number;\n"
            "}\n\n"
            "export function TempCrateBadge({ penceSaved }: TempCrateBadgeProps) {\n"
            "  return <span>£{(penceSaved / 100).toFixed(2)}</span>;\n"
            "}\n",
            encoding="utf-8",
        )

        # 1. Incremental add
        t0 = time.perf_counter()
        self.indexer.update_single_file(widget_path, workspace_root=temp_ws, hub_dir=self.hub_dir)
        inc_ms = (time.perf_counter() - t0) * 1000.0
        self.assertLess(inc_ms, 250.0)

        res_added = self.indexer.query_index(
            "TempCrateBadge", workspace_root=temp_ws, hub_dir=self.hub_dir
        )
        self.assertTrue(
            any("TempCrateBadge.tsx" in str(m.get("path", "")) for m in res_added.get("matches", [])),
            f"Incremental add failed to index TempCrateBadge: {res_added!r}",
        )

        # 2. Incremental modify (rename symbol)
        widget_path.write_text(
            "export function UpdatedWholesaleRibbon() {\n"
            "  return <div>Box Locked</div>;\n"
            "}\n",
            encoding="utf-8",
        )
        self.run_cmd(
            [
                sys.executable,
                str(CODEBASE_INDEXER_PY),
                "update",
                str(widget_path),
                "--hub-dir",
                str(self.hub_dir),
                "--json",
            ],
            cwd=temp_ws,
        )
        res_modified = self.indexer.query_index(
            "UpdatedWholesaleRibbon", workspace_root=temp_ws, hub_dir=self.hub_dir
        )
        self.assertTrue(
            any(
                "TempCrateBadge.tsx" in str(m.get("path", ""))
                for m in res_modified.get("matches", [])
            ),
            f"Incremental update failed to pick up UpdatedWholesaleRibbon: {res_modified!r}",
        )
        map_lines = (self.hub_dir / "CODEBASE_MAP.md").read_text(encoding="utf-8").splitlines()
        self.assertLessEqual(len(map_lines), 160)

        # 3. Incremental delete
        widget_path.unlink()
        self.indexer.update_single_file(widget_path, workspace_root=temp_ws, hub_dir=self.hub_dir)
        res_deleted = self.indexer.query_index(
            "UpdatedWholesaleRibbon", workspace_root=temp_ws, hub_dir=self.hub_dir
        )
        self.assertFalse(
            any(
                "TempCrateBadge.tsx" in str(m.get("path", ""))
                for m in res_deleted.get("matches", [])
            ),
            f"Deleted file still appeared in index matches: {res_deleted!r}",
        )


class TestAgentHubBusAndLocks(HubTestBase):
    """2. Unified Goal, Messaging, Decisions & Lock Concurrency Tests (`harness/agent_hub.py`)."""

    @classmethod
    def setUpClass(cls) -> None:
        assert AGENT_HUB_PY.is_file(), f"Missing {AGENT_HUB_PY}"
        cls.agent_hub = importlib.import_module("agent_hub")

    def hub_cli_json(
        self, *args: str, expected_rc: tuple[int, ...] = (0,)
    ) -> tuple[subprocess.CompletedProcess[str], object]:
        proc = self.run_cmd(
            [sys.executable, str(AGENT_HUB_PY), *args, "--json"],
            expected_rc=expected_rc,
        )
        return proc, json.loads(proc.stdout)

    def test_01_init_seeds_splitbox_goal_gates_decisions_and_snapshot(self) -> None:
        # Pre-seed dummy codebase map to ensure `init` does NOT clobber indexer artifacts
        sentinel_map = self.hub_dir / "CODEBASE_MAP.md"
        sentinel_map.write_text("# Sentinel Map\n", encoding="utf-8")

        self.hub_cli_json("init")

        for filename in (
            "mission.json",
            "agents.json",
            "locks.json",
            "decisions.json",
            "events.jsonl",
            "SNAPSHOT.md",
        ):
            self.assertTrue((self.hub_dir / filename).exists(), f"init did not create {filename}")

        self.assertEqual(
            sentinel_map.read_text(encoding="utf-8"),
            "# Sentinel Map\n",
            "agent_hub.py init must NOT overwrite CODEBASE_MAP.md",
        )

        mission = json.loads((self.hub_dir / "mission.json").read_text(encoding="utf-8"))
        mission_dump = json.dumps(mission)
        self.assertIn("SplitBox", mission_dump)
        self.assertTrue("£" in mission_dump or "GBP" in mission_dump)

        # Verify 5 acceptance gates seeded
        gates = (
            mission.get("acceptance_gates")
            or mission.get("gates")
            or mission.get("criteria")
            or []
        )
        self.assertGreaterEqual(
            len(gates), 5, f"Expected >= 5 SplitBox acceptance gates in mission.json, got: {gates!r}"
        )

        decisions_raw = json.loads((self.hub_dir / "decisions.json").read_text(encoding="utf-8"))
        decisions = _extract_list(decisions_raw, ("decisions", "items"))
        self.assertGreaterEqual(len(decisions), 3, "Expected seeded SplitBox decisions")
        decisions_dump = json.dumps(decisions)
        self.assertIn("offline", decisions_dump.lower())
        self.assertIn("SliceMeter", decisions_dump)

        snapshot_text = (self.hub_dir / "SNAPSHOT.md").read_text(encoding="utf-8")
        snapshot_lines = snapshot_text.splitlines()
        self.assertGreater(len(snapshot_lines), 10)
        self.assertLessEqual(
            len(snapshot_lines),
            110,
            f"SNAPSHOT.md has {len(snapshot_lines)} lines, exceeding <= 110 line budget",
        )
        self.assertIn("SplitBox", snapshot_text)

        # Verify required importable Python helper functions exist
        for fn_name in (
            "get_brief",
            "register_agent",
            "claim_locks",
            "release_locks",
            "check_path_lock",
            "post_event",
            "record_decision",
            "update_goal",
            "render_snapshot",
        ):
            self.assertTrue(
                callable(getattr(self.agent_hub, fn_name, None)),
                f"agent_hub.py missing required importable function `{fn_name}`",
            )

    def test_02_register_goal_decisions_messaging_handoff_and_inbox_cursor(self) -> None:
        self.hub_cli_json("init")

        # Register two agents
        self.hub_cli_json(
            "register",
            "--agent",
            "ui-slice",
            "--role",
            "Storefront Builder",
            "--focus",
            "SliceMeter & SplitCard",
            "--conv",
            "conv-ui-1",
        )
        _, agents_payload = self.hub_cli_json("agents")
        agents_dump = json.dumps(agents_payload)
        self.assertIn("ui-slice", agents_dump)
        self.assertIn("Storefront Builder", agents_dump)

        # Goal set & milestone lifecycle
        self.hub_cli_json(
            "goal",
            "set",
            "--title",
            "SplitBox Unified Sprint Goal",
            "--summary",
            "Offline GBP bulk-splitting campus storefront with O(1) hub coordination",
        )
        self.hub_cli_json(
            "goal",
            "milestone",
            "--id",
            "ms-storefront",
            "--title",
            "Storefront Radial Meters",
            "--status",
            "in_progress",
            "--owner",
            "ui-slice",
            "--note",
            "Wiring SVG stroke-dashoffset",
        )
        self.hub_cli_json(
            "goal",
            "milestone",
            "--id",
            "ms-storefront",
            "--status",
            "done",
            "--owner",
            "ui-slice",
            "--note",
            "Verified 375px & radial meters",
        )
        _, goal_payload = self.hub_cli_json("goal", "show")
        goal_dump = json.dumps(goal_payload)
        self.assertIn("SplitBox Unified Sprint Goal", goal_dump)
        self.assertIn("ms-storefront", goal_dump)
        self.assertIn("done", goal_dump)

        # Record decision
        self.hub_cli_json(
            "decision",
            "--author",
            "ui-slice",
            "--title",
            "Zero Horizontal Progress Bars",
            "--summary",
            "Use <SliceMeter /> radial SVG exclusively on cards and drawers",
            "--rationale",
            "Enforces SplitBox citrus slice brand identity",
            "--tags",
            "ui,brand",
        )
        _, dec_payload = self.hub_cli_json("decisions")
        self.assertIn("Zero Horizontal Progress Bars", json.dumps(dec_payload))

        # Post targeted, unrelated, and broadcast handoff events
        self.hub_cli_json(
            "post",
            "--from",
            "manager",
            "--to",
            "ui-slice",
            "--msg",
            "Please align crate border to 2px solid #0B241C",
            "--files",
            "src/index.css",
        )
        self.hub_cli_json(
            "post",
            "--from",
            "manager",
            "--to",
            "other-worker",
            "--msg",
            "Private message for other-worker only",
        )
        self.hub_cli_json(
            "handoff",
            "--from",
            "engine-worker",
            "--to",
            "all",
            "--summary",
            "DropContext exposes allocateSequentialSlices()",
            "--files",
            "src/store/dropEngine.ts,src/store/DropContext.tsx",
            "--next",
            "Bind BasketDrawer preview to cross-box split",
        )

        # Inbox without --ack returns targeted + `all` messages, excluding `other-worker`
        _, inbox_before_ack = self.hub_cli_json("inbox", "--agent", "ui-slice")
        msgs_1 = _extract_list(inbox_before_ack, ("messages", "inbox", "events", "items"))
        msgs_1_dump = json.dumps(msgs_1)
        self.assertIn("Please align crate border", msgs_1_dump)
        self.assertIn("allocateSequentialSlices", msgs_1_dump)
        self.assertNotIn("Private message for other-worker only", msgs_1_dump)

        # Calling inbox WITH --ack advances cursor
        _, inbox_ack = self.hub_cli_json("inbox", "--agent", "ui-slice", "--ack")
        msgs_ack = _extract_list(inbox_ack, ("messages", "inbox", "events", "items"))
        self.assertGreaterEqual(len(msgs_ack), 2)

        # Subsequent inbox call returns 0 unread messages
        _, inbox_after_ack = self.hub_cli_json("inbox", "--agent", "ui-slice")
        msgs_empty = _extract_list(inbox_after_ack, ("messages", "inbox", "events", "items"))
        self.assertEqual(len(msgs_empty), 0, f"Expected 0 unread after --ack, got: {msgs_empty!r}")

        # New message after --ack shows up cleanly
        self.hub_cli_json(
            "post",
            "--from",
            "qa-gate",
            "--to",
            "ui-slice",
            "--msg",
            "QA verified contrast rules pass!",
        )
        _, inbox_delta = self.hub_cli_json("inbox", "--agent", "ui-slice")
        msgs_delta = _extract_list(inbox_delta, ("messages", "inbox", "events", "items"))
        self.assertEqual(len(msgs_delta), 1)
        self.assertIn("QA verified contrast rules pass!", json.dumps(msgs_delta[0]))

        # `--since 0` retrieves full history regardless of cursor
        _, inbox_all = self.hub_cli_json("inbox", "--agent", "ui-slice", "--since", "0")
        msgs_all = _extract_list(inbox_all, ("messages", "inbox", "events", "items"))
        self.assertGreaterEqual(len(msgs_all), 3)

        # `brief --agent ui-slice` prints compact snapshot + unread inbox (< 140 lines)
        brief_proc = self.run_cmd(
            [sys.executable, str(AGENT_HUB_PY), "brief", "--agent", "ui-slice"]
        )
        self.assertIn("SplitBox", brief_proc.stdout)
        self.assertLessEqual(len(brief_proc.stdout.splitlines()), 145)

        # SNAPSHOT.md remains <= 110 lines after mutations
        snap_lines = (self.hub_dir / "SNAPSHOT.md").read_text(encoding="utf-8").splitlines()
        self.assertLessEqual(len(snap_lines), 110)

    def test_03_claim_check_lock_glob_overlap_release_and_ttl_expiry(self) -> None:
        self.hub_cli_json("init")

        # Agent A claims a glob directory slice + a single file
        self.hub_cli_json(
            "claim",
            "--agent",
            "builder-basket",
            "--paths",
            "src/components/basket/*,src/App.tsx",
            "--reason",
            "Building BasketDrawer & App wiring",
            "--conv",
            "conv-alpha",
            "--ttl",
            "45",
        )

        # 1. Same agent OR same conversation is allowed (exit 0)
        proc_same_agent, payload_same = self.hub_cli_json(
            "check-lock",
            "--path",
            "src/components/basket/BasketDrawer.tsx",
            "--agent",
            "builder-basket",
            "--conv",
            "conv-alpha",
            expected_rc=(0,),
        )
        self.assertEqual(proc_same_agent.returncode, 0)

        proc_same_conv, _ = self.hub_cli_json(
            "check-lock",
            "--path",
            str(WORKSPACE_ROOT / "src" / "App.tsx"),
            "--conv",
            "conv-alpha",
            expected_rc=(0,),
        )
        self.assertEqual(proc_same_conv.returncode, 0)

        # 2. Different agent AND different conversation on exact or glob-matched file is blocked (exit 2)
        for blocked_target in (
            "src/App.tsx",
            "src/components/basket/BasketDrawer.tsx",
            str(WORKSPACE_ROOT / "src" / "components" / "basket" / "MobileBasketBar.tsx"),
        ):
            proc_diff, payload_diff = self.hub_cli_json(
                "check-lock",
                "--path",
                blocked_target,
                "--agent",
                "builder-other",
                "--conv",
                "conv-beta",
                expected_rc=(2,),
            )
            self.assertEqual(proc_diff.returncode, 2)
            self.assertIsInstance(payload_diff, dict)
            self.assertTrue(payload_diff.get("locked"), f"Expected locked=True: {payload_diff!r}")

        # 3. Unclaimed path is allowed for different agent (exit 0)
        proc_free, payload_free = self.hub_cli_json(
            "check-lock",
            "--path",
            "src/components/orders/PickupPassCard.tsx",
            "--agent",
            "builder-other",
            "--conv",
            "conv-beta",
            expected_rc=(0,),
        )
        self.assertEqual(proc_free.returncode, 0)
        self.assertFalse(payload_free.get("locked", False))

        # 4. Partial release frees `src/App.tsx` while keeping `src/components/basket/*` locked
        self.hub_cli_json("release", "--agent", "builder-basket", "--paths", "src/App.tsx")
        self.hub_cli_json(
            "check-lock",
            "--path",
            "src/App.tsx",
            "--agent",
            "builder-other",
            "--conv",
            "conv-beta",
            expected_rc=(0,),
        )
        self.hub_cli_json(
            "check-lock",
            "--path",
            "src/components/basket/BasketDrawer.tsx",
            "--agent",
            "builder-other",
            "--conv",
            "conv-beta",
            expected_rc=(2,),
        )

        # 5. Release --all frees remaining locks
        self.hub_cli_json("release", "--agent", "builder-basket", "--all")
        self.hub_cli_json(
            "check-lock",
            "--path",
            "src/components/basket/BasketDrawer.tsx",
            "--agent",
            "builder-other",
            "--conv",
            "conv-beta",
            expected_rc=(0,),
        )

        # 6. Expired TTL lock auto-prunes cleanly
        self.hub_cli_json(
            "claim",
            "--agent",
            "ghost-worker",
            "--paths",
            "src/store/DropContext.tsx",
            "--reason",
            "Old abandoned edit",
            "--conv",
            "conv-ghost",
            "--ttl",
            "5",
        )
        locks_file = self.hub_dir / "locks.json"
        locks_raw = json.loads(locks_file.read_text(encoding="utf-8"))
        # Backdate every `expires_at` (and numeric expiry if used) to 2020
        locks_mutated = json.loads(
            re.sub(
                r'"expires_at"\s*:\s*"[^"]+"',
                '"expires_at": "2020-01-01T00:00:00+00:00"',
                json.dumps(locks_raw),
            )
        )
        if isinstance(locks_mutated, dict):
            for entry in locks_mutated.get("locks", []):
                if isinstance(entry, dict) and "expires_epoch" in entry:
                    entry["expires_epoch"] = 1577836800
        elif isinstance(locks_mutated, list):
            for entry in locks_mutated:
                if isinstance(entry, dict) and "expires_epoch" in entry:
                    entry["expires_epoch"] = 1577836800
        locks_file.write_text(json.dumps(locks_mutated, indent=2), encoding="utf-8")

        # Another agent checking the expired lock must get exit 0 (allowed) and auto-prune it
        self.hub_cli_json(
            "check-lock",
            "--path",
            "src/store/DropContext.tsx",
            "--agent",
            "builder-other",
            "--conv",
            "conv-beta",
            expected_rc=(0,),
        )
        _, active_locks_after = self.hub_cli_json("locks")
        self.assertNotIn("ghost-worker", json.dumps(active_locks_after))

    def test_04_multiprocess_flock_concurrency_stress_6_workers(self) -> None:
        self.hub_cli_json("init")

        num_workers = 6
        msgs_per_worker = 6
        worker_inputs = [(w, str(self.hub_dir), msgs_per_worker) for w in range(num_workers)]

        with ProcessPoolExecutor(max_workers=num_workers) as pool:
            results = list(pool.map(_stress_worker_task, worker_inputs))

        self.assertEqual(len(results), num_workers)

        # 1. Verify zero JSONL corruption & strictly unique contiguous sequence numbers
        events_path = self.hub_dir / "events.jsonl"
        raw_lines = [ln for ln in events_path.read_text(encoding="utf-8").splitlines() if ln.strip()]
        parsed_events = [json.loads(ln) for ln in raw_lines]

        seqs = [ev["seq"] for ev in parsed_events if "seq" in ev]
        self.assertEqual(len(seqs), len(parsed_events), "Every event in events.jsonl must carry `seq`")
        self.assertEqual(len(seqs), len(set(seqs)), f"Duplicate sequence numbers detected: {seqs}")
        self.assertEqual(
            sorted(seqs),
            list(range(min(seqs), max(seqs) + 1)),
            f"Sequence numbers have gaps under concurrent flock load: {sorted(seqs)}",
        )

        # 2. Verify zero lost messages across all 6 parallel processes
        all_events_blob = "\n".join(raw_lines)
        expected_markers = [m for r in results for m in r["posted_markers"]]
        self.assertEqual(len(expected_markers), num_workers * msgs_per_worker)
        for marker in expected_markers:
            self.assertIn(marker, all_events_blob, f"Lost concurrent message {marker}!")

        # 3. Verify all JSON state files & SNAPSHOT.md remain valid and uncorrupted
        for json_name in ("mission.json", "agents.json", "locks.json", "decisions.json"):
            parsed = json.loads((self.hub_dir / json_name).read_text(encoding="utf-8"))
            self.assertIsNotNone(parsed)

        decisions_blob = (self.hub_dir / "decisions.json").read_text(encoding="utf-8")
        for w in range(num_workers):
            self.assertIn(f"stress-worker-{w}", decisions_blob)

        snap_lines = (self.hub_dir / "SNAPSHOT.md").read_text(encoding="utf-8").splitlines()
        self.assertLessEqual(len(snap_lines), 110)


class TestLifecycleHooksContract(HubTestBase):
    """3. Antigravity Lifecycle Hook Contract Tests (`hub_hooks.py` & `.agents/hooks.json`)."""

    @classmethod
    def setUpClass(cls) -> None:
        assert HOOKS_JSON.is_file(), f"Missing {HOOKS_JSON}"
        assert HUB_HOOKS_PY.is_file(), f"Missing {HUB_HOOKS_PY}"
        cls.hooks_cfg = json.loads(HOOKS_JSON.read_text(encoding="utf-8"))

    def _find_hook_commands(self) -> dict[str, list[dict]]:
        found: dict[str, list[dict]] = {"SessionStart": [], "PreToolUse": [], "PostToolUse": []}
        for group_name, spec in self.hooks_cfg.items():
            if not isinstance(spec, dict) or spec.get("enabled", True) is False:
                continue
            if "SessionStart" in spec:
                self.assertIsInstance(spec["SessionStart"], list)
                found["SessionStart"].extend(spec["SessionStart"])
            for tool_ev in ("PreToolUse", "PostToolUse"):
                if tool_ev in spec:
                    self.assertIsInstance(spec[tool_ev], list)
                    for matcher_group in spec[tool_ev]:
                        self.assertIn("matcher", matcher_group, f"{group_name}.{tool_ev} needs matcher")
                        self.assertIn("hooks", matcher_group, f"{group_name}.{tool_ev} needs hooks")
                        matcher = matcher_group["matcher"]
                        self.assertIsNotNone(
                            re.search(matcher, "write_file"),
                            f"{tool_ev} matcher {matcher!r} must match write_file",
                        )
                        self.assertIsNotNone(
                            re.search(matcher, "edit_file"),
                            f"{tool_ev} matcher {matcher!r} must match edit_file",
                        )
                        found[tool_ev].extend(matcher_group["hooks"])
        return found

    def _invoke_hook(
        self,
        event_name: str,
        payload: dict | str,
        *,
        extra_env: dict[str, str] | None = None,
    ) -> dict:
        commands = self._find_hook_commands()[event_name]
        self.assertGreaterEqual(len(commands), 1, f"No handler configured for {event_name}")
        cmd_str = commands[0]["command"]
        stdin_str = payload if isinstance(payload, str) else json.dumps(payload)
        proc = self.run_cmd(
            ["sh", "-c", cmd_str],
            cwd=AGENTS_DIR,
            extra_env=extra_env,
            stdin_text=stdin_str,
            expected_rc=(0,),
        )
        self.assertTrue(proc.stdout.strip(), f"{event_name} hook emitted empty stdout")
        return json.loads(proc.stdout)

    def test_01_hooks_json_schema_and_commands_valid(self) -> None:
        handlers = self._find_hook_commands()
        for ev in ("SessionStart", "PreToolUse", "PostToolUse"):
            self.assertGreaterEqual(len(handlers[ev]), 1, f"Missing {ev} hook in .agents/hooks.json")
            for h in handlers[ev]:
                self.assertEqual(h.get("type", "command"), "command")
                self.assertIn("hub_hooks.py", h.get("command", ""))
                self.assertLessEqual(h.get("timeout", 30), 15)

    def test_02_session_start_injects_unified_goal_and_registers_session(self) -> None:
        self.run_cmd([sys.executable, str(AGENT_HUB_PY), "init"])
        self.run_cmd(
            [
                sys.executable,
                str(AGENT_HUB_PY),
                "handoff",
                "--from",
                "storefront-peer",
                "--to",
                "all",
                "--summary",
                "SliceMeter ready for BasketDrawer integration",
            ]
        )

        payload = {
            "conversationId": "conv-hook-session-42",
            "workspacePaths": [str(WORKSPACE_ROOT)],
            "transcriptPath": "/tmp/mock_transcript.jsonl",
            "artifactDirectoryPath": "/tmp/mock_artifacts",
            "modelName": "auto",
            "hookEventName": "SessionStart",
            "cwd": str(WORKSPACE_ROOT),
        }
        out = self._invoke_hook("SessionStart", payload)
        self.assertIn("injectSteps", out)
        inject_steps = out["injectSteps"]
        self.assertIsInstance(inject_steps, list)
        self.assertGreaterEqual(len(inject_steps), 1)
        sys_msg_obj = inject_steps[0].get("systemMessage", {})
        self.assertIsInstance(sys_msg_obj, dict)
        sys_msg_text = sys_msg_obj.get("systemMessage", "")
        self.assertIn("SplitBox", sys_msg_text)
        self.assertLessEqual(
            len(sys_msg_text.splitlines()),
            105,
            "SessionStart systemMessage injection must remain compact",
        )

    def test_03_pre_tool_use_enforces_cross_agent_locks_and_allows_owner(self) -> None:
        self.run_cmd([sys.executable, str(AGENT_HUB_PY), "init"])
        target_file = str(WORKSPACE_ROOT / "src" / "components" / "basket" / "BasketDrawer.tsx")

        def make_pre_payload(conv_id: str, path_str: str, tool_name: str = "edit_file") -> dict:
            return {
                "conversationId": conv_id,
                "workspacePaths": [str(WORKSPACE_ROOT)],
                "hookEventName": "PreToolUse",
                "cwd": str(WORKSPACE_ROOT),
                "stepIdx": 7,
                "toolCall": {
                    "id": "toolu_test_01",
                    "name": tool_name,
                    "args": {"Path": path_str},
                },
            }

        # 1. Unlocked workspace file -> allow
        res_unlocked = self._invoke_hook("PreToolUse", make_pre_payload("conv-owner", target_file))
        self.assertEqual(res_unlocked.get("decision"), "allow")

        # 2. Claim lock for `conv-owner` (`basket-owner`)
        self.run_cmd(
            [
                sys.executable,
                str(AGENT_HUB_PY),
                "claim",
                "--agent",
                "basket-owner",
                "--paths",
                "src/components/basket/*",
                "--reason",
                "Refactoring GBP subtotal footer",
                "--conv",
                "conv-owner",
            ]
        )

        # 3. Same `conversationId` -> allow
        res_owner = self._invoke_hook("PreToolUse", make_pre_payload("conv-owner", target_file))
        self.assertEqual(res_owner.get("decision"), "allow")

        # 4. Different active `conversationId` -> deny with helpful reason
        res_intruder = self._invoke_hook(
            "PreToolUse", make_pre_payload("conv-intruder-99", target_file, tool_name="write_file")
        )
        self.assertEqual(res_intruder.get("decision"), "deny")
        self.assertIn("basket-owner", res_intruder.get("reason", ""))

        # 4b. Lock claimed WITHOUT `--conv` (`conv=""`) must ALSO deny foreign conversations!
        app_target = str(WORKSPACE_ROOT / "src" / "App.tsx")
        self.run_cmd(
            [
                sys.executable,
                str(AGENT_HUB_PY),
                "claim",
                "--agent",
                "swarm-worker-no-conv",
                "--paths",
                "src/App.tsx",
                "--reason",
                "Testing missing --conv lock enforcement",
            ]
        )
        res_no_conv_intruder = self._invoke_hook(
            "PreToolUse", make_pre_payload("conv-intruder-99", app_target, tool_name="edit_file")
        )
        self.assertEqual(res_no_conv_intruder.get("decision"), "deny")
        self.assertIn("swarm-worker-no-conv", res_no_conv_intruder.get("reason", ""))

        # 5. Path outside workspace root -> must NOT auto-allow (`ask`)
        res_outside = self._invoke_hook(
            "PreToolUse", make_pre_payload("conv-owner", "/tmp/outside_workspace_secret.txt")
        )
        self.assertIn(
            res_outside.get("decision"),
            {"ask", "deny"},
            f"Paths outside workspace root must not auto-allow, got: {res_outside!r}",
        )

        # 6. Malformed stdin JSON -> never crashes, exits 0 with safe JSON fallback
        res_malformed = self._invoke_hook("PreToolUse", "{not-valid-json")
        self.assertIsInstance(res_malformed, dict)
        self.assertIn("decision", res_malformed)

    def test_04_post_tool_use_updates_index_events_and_deduplicates(self) -> None:
        # Use a temp workspace + temp hub_dir so PostToolUse updates cleanly
        temp_ws = Path(self._tmp_dir.name) / "post_hook_ws"
        (temp_ws / "src").mkdir(parents=True)
        shutil.copy2(WORKSPACE_ROOT / "src" / "types.ts", temp_ws / "src" / "types.ts")
        shutil.copy2(WORKSPACE_ROOT / "brief.md", temp_ws / "brief.md")

        self.run_cmd([sys.executable, str(AGENT_HUB_PY), "init"])

        edited_file = temp_ws / "src" / "HookCreatedComponent.tsx"
        edited_file.write_text(
            "export function HookCreatedComponent() { return <div>£1.50</div>; }\n",
            encoding="utf-8",
        )

        post_payload = {
            "conversationId": "conv-post-hook-1",
            "workspacePaths": [str(temp_ws)],
            "hookEventName": "PostToolUse",
            "cwd": str(temp_ws),
            "stepIdx": 12,
            "toolCall": {
                "id": "toolu_post_01",
                "name": "write_file",
                "args": {"Path": str(edited_file)},
            },
        }

        out_1 = self._invoke_hook("PostToolUse", post_payload)
        self.assertEqual(out_1, {})

        # Verify index & CODEBASE_MAP.md updated with HookCreatedComponent
        self.assertTrue((self.hub_dir / "codebase_index.json").is_file())
        self.assertTrue((self.hub_dir / "CODEBASE_MAP.md").is_file())
        indexer = importlib.import_module("codebase_indexer")
        q_res = indexer.query_index(
            "HookCreatedComponent", workspace_root=temp_ws, hub_dir=self.hub_dir
        )
        self.assertTrue(
            any("HookCreatedComponent.tsx" in str(m.get("path", "")) for m in q_res.get("matches", [])),
            f"PostToolUse failed to index HookCreatedComponent.tsx: {q_res!r}",
        )

        # Verify file_modified event logged & consecutive rapid edit deduplicated
        events_after_first = [
            json.loads(ln)
            for ln in (self.hub_dir / "events.jsonl").read_text(encoding="utf-8").splitlines()
            if ln.strip()
        ]
        self.assertGreaterEqual(len(events_after_first), 1)

        out_2 = self._invoke_hook("PostToolUse", post_payload)
        self.assertEqual(out_2, {})
        events_after_second = [
            json.loads(ln)
            for ln in (self.hub_dir / "events.jsonl").read_text(encoding="utf-8").splitlines()
            if ln.strip()
        ]
        self.assertEqual(
            len(events_after_second),
            len(events_after_first),
            "Consecutive edits to the same file by the same conversationId within 60s should deduplicate",
        )


class TestLiveWorkspaceAndRegressionGate(unittest.TestCase):
    """4. Live Workspace State, Docs/Harness Integration & SplitBox App Regression Gate."""

    def test_01_live_hub_artifacts_populated_and_within_line_budgets(self) -> None:
        live_snapshot = LIVE_HUB_DIR / "SNAPSHOT.md"
        live_map = LIVE_HUB_DIR / "CODEBASE_MAP.md"
        live_index = LIVE_HUB_DIR / "codebase_index.json"

        self.assertTrue(live_snapshot.is_file(), f"Missing live {live_snapshot}")
        self.assertTrue(live_map.is_file(), f"Missing live {live_map}")
        self.assertTrue(live_index.is_file(), f"Missing live {live_index}")

        snap_lines = live_snapshot.read_text(encoding="utf-8").splitlines()
        self.assertGreater(len(snap_lines), 10)
        self.assertLessEqual(len(snap_lines), 110)

        map_lines = live_map.read_text(encoding="utf-8").splitlines()
        self.assertGreater(len(map_lines), 20)
        self.assertLessEqual(len(map_lines), 160)

    def test_02_docs_skills_personas_harness_and_package_scripts(self) -> None:
        # 1. `.agents/skills/agent-comm-hub/SKILL.md`
        comm_skill = AGENTS_DIR / "skills" / "agent-comm-hub" / "SKILL.md"
        self.assertTrue(comm_skill.is_file(), f"Missing {comm_skill}")
        comm_text = comm_skill.read_text(encoding="utf-8")
        self.assertTrue(comm_text.startswith("---\n"), "agent-comm-hub/SKILL.md missing frontmatter")
        self.assertIn("name: agent-comm-hub", comm_text)

        # 2. `AGENTS.md` preserves core sections & links `agent-comm-hub`
        agents_md = (WORKSPACE_ROOT / "AGENTS.md").read_text(encoding="utf-8")
        self.assertIn("agent-comm-hub", agents_md)
        self.assertIn("SNAPSHOT.md", agents_md)
        self.assertIn("CODEBASE_MAP.md", agents_md)
        self.assertIn("Non-Negotiable Conflict Resolutions", agents_md)

        # 3. Custom agent personas include `swarm` in `tools:` and hub coordination
        for agent_file in ("splitbox-manager.md", "splitbox-builder.md", "splitbox-qa.md"):
            p = AGENTS_DIR / "agents" / agent_file
            self.assertTrue(p.is_file(), f"Missing {p}")
            txt = p.read_text(encoding="utf-8")
            self.assertTrue(txt.startswith("---\n"), f"{agent_file} missing YAML frontmatter")
            frontmatter = txt.split("---", 2)[1]
            self.assertIn("swarm", frontmatter, f"{agent_file} frontmatter tools must include `swarm`")

        # 4. Harness upgrades (`full_tool_harness.py` & `sdk_agent_harness.py`)
        fth_text = (
            AGENTS_DIR / "skills" / "agent-tool-harness" / "scripts" / "full_tool_harness.py"
        ).read_text(encoding="utf-8")
        self.assertIn("SNAPSHOT.md", fth_text)
        self.assertIn("owns", fth_text)

        sdk_help = subprocess.run(
            [sys.executable, str(HARNESS_DIR / "sdk_agent_harness.py"), "--help"],
            cwd=str(WORKSPACE_ROOT),
            capture_output=True,
            text=True,
            timeout=10,
        )
        self.assertEqual(sdk_help.returncode, 0)
        self.assertIn("--agent-id", sdk_help.stdout)
        self.assertIn("--role", sdk_help.stdout)

        # 5. `package.json` scripts & `npm run hub:brief`
        pkg = json.loads((WORKSPACE_ROOT / "package.json").read_text(encoding="utf-8"))
        scripts = pkg.get("scripts", {})
        for required_script in (
            "dev",
            "build",
            "preview",
            "hub",
            "hub:brief",
            "hub:board",
            "hub:locks",
            "hub:index",
            "hub:test",
        ):
            self.assertIn(required_script, scripts, f"package.json missing script {required_script!r}")

        brief_run = subprocess.run(
            ["npm", "run", "hub:brief"],
            cwd=str(WORKSPACE_ROOT),
            capture_output=True,
            text=True,
            timeout=20,
        )
        self.assertEqual(
            brief_run.returncode,
            0,
            f"`npm run hub:brief` failed:\n{brief_run.stdout}\n{brief_run.stderr}",
        )
        self.assertIn("SplitBox", brief_run.stdout)

    def test_03_splitbox_offline_and_production_build_gate(self) -> None:
        if os.environ.get("SPLITBOX_SKIP_BUILD_GATE") == "1":
            self.skipTest("Skipped via SPLITBOX_SKIP_BUILD_GATE=1")
        qa_script = AGENTS_DIR / "skills" / "splitbox-qa-gate" / "scripts" / "verify_offline_and_build.sh"
        proc = subprocess.run(
            ["bash", str(qa_script)],
            cwd=str(WORKSPACE_ROOT),
            capture_output=True,
            text=True,
            timeout=120,
        )
        self.assertEqual(
            proc.returncode,
            0,
            f"SplitBox offline & build QA gate failed:\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}",
        )
        self.assertIn("ALL AUTOMATED QA GATES PASSED", proc.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
