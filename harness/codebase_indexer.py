#!/usr/bin/env python3
"""O(1) Codebase Context Indexer & Compact Markdown Atlas Generator for SplitBox.

Eliminates the cold-start file-reading tax across main sessions, subagents,
`run_workflow` slice builders, Native `/swarm` workers, and lifecycle hooks.

100% Python 3 standard library — zero external pip dependencies.

Public Python API:
- `build_index(workspace_root=None, hub_dir=None) -> dict`
- `update_single_file(file_path, workspace_root=None, hub_dir=None) -> dict`
- `query_index(query, workspace_root=None, hub_dir=None, limit=8) -> dict`
- `render_codebase_map(index) -> str`

CLI Subcommands:
- `python3 harness/codebase_indexer.py build [--hub-dir ...] [--json]`
- `python3 harness/codebase_indexer.py update <file_path> [--hub-dir ...] [--json]`
- `python3 harness/codebase_indexer.py query <search_terms> [--limit 8] [--hub-dir ...] [--json]`
"""

from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import posixpath
import re
import sys
import tempfile
import threading
import time
from typing import Any, Iterator


INDEX_SCHEMA_VERSION = 1
DEFAULT_WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
MAX_MAP_LINES = 158  # Strictly <= 160 lines contract

INDEXABLE_SRC_SUFFIXES = {".ts", ".tsx", ".css"}
INDEXABLE_UPDATE_SUFFIXES = {".ts", ".tsx", ".css", ".md", ".mjs", ".js", ".py"}
EXCLUDED_DIR_NAMES = {"node_modules", ".git", "dist", "__pycache__", ".vite", "coverage"}

ROOT_SPEC_FILES = (
    "brief.md",
    "page-syles.md",
    "page-styles.md",
    "identity.md",
    "AGENTS.md",
)

SPEC_AUTHORITY_ROLES: dict[str, str] = {
    "brief.md": (
        "Authoritative Product & Acceptance Spec (GBP £ pricing, UK student catalog, "
        "sequential case allocation, Demo Controls cutoff, 375px mobile, 100% offline)"
    ),
    "page-syles.md": (
        "Visual & Brand Component Spec (#F7FAF8 chalk canvas, #0B241C crate borders/shadows, "
        "radial SliceMeter; CDN fonts & $ snippets overridden by brief.md/AGENTS.md)"
    ),
    "page-styles.md": (
        "Visual & Brand Component Spec mirror (see page-syles.md; offline @fontsource & GBP £ apply)"
    ),
    "identity.md": (
        "Brand Identity & Citrus Crate Logo Spec (Box / Slice / Box Pool / Slice Lock / Box Drop vocabulary)"
    ),
    "AGENTS.md": (
        "Always-On Workspace Agent Directives, Full-Tool Harness, Hub Protocol & Conflict Resolutions"
    ),
}

KNOWN_FILE_ROLES: dict[str, str] = {
    "src/main.tsx": "Vite React 19 entrypoint bundling local @fontsource fonts & index.css",
    "src/App.tsx": "Root shell mounting ErrorBoundary, DropProvider, DemoControlsBar, Navbar, active view & BasketDrawer",
    "src/types.ts": "Canonical TypeScript domain contracts (CatalogItem, ClaimedSlice, OrderRecord, PickupPass, HubDropLedger)",
    "src/index.css": "Tailwind v4 + SplitBox --sb-* design tokens, zero-blur crate cards, tactile buttons & receipt styles",
    "src/data/catalog.ts": "UK campus catalog SKUs, UoB pickup hubs, hall activity seeds & integer-pence GBP helpers",
    "src/store/DropContext.tsx": "React Context provider, useDrop() hook, sanitized localStorage persistence & drop reducer actions",
    "src/store/dropEngine.ts": "Deterministic sequential slice allocator, GBP pence escrow/cutoff/refund engine & QR pass verifier",
    "src/components/common/ErrorBoundary.tsx": "Resilient crate session recovery boundary with one-click localStorage reset",
    "src/components/storefront/StorefrontView.tsx": "Active campus drop storefront with hub hero, category/pool filters & SplitCard grid",
    "src/components/storefront/SplitCard.tsx": "Tactile wholesale product crate card with radial SliceMeter, perforated £ receipt & slice claim CTA",
    "src/components/storefront/SliceMeter.tsx": "Signature radial citrus SVG wedge meter (#10D48E mint strangers, #FF6B1A popped user wedge)",
    "src/components/storefront/Navbar.tsx": "Sticky campus hub switcher, view navigation tabs & active escrow/basket counters",
    "src/components/storefront/ProductArtwork.tsx": "Offline deterministic SVG crate & packaging artwork renderer per catalog SKU",
    "src/components/storefront/HallActivityTicker.tsx": "Live campus hall pooling activity ticker strip",
    "src/components/storefront/SharePoolModal.tsx": "Campus hallmate pool share modal & viral claim simulator",
    "src/components/storefront/securityUtils.ts": "Input bounds, bidi/control-char stripping & safe SVG coordinate/SliceMeter sanitizers",
    "src/components/basket/BasketDrawer.tsx": "Slide-out multi-item basket drawer with chronological cross-box preview & £0.00 fee escrow checkout",
    "src/components/basket/MobileBasketBar.tsx": "Sticky 375px mobile bottom bar surfacing live basket slice count & £ escrow hold",
    "src/components/orders/DemoControlsBar.tsx": "Reviewer Demo Controls toolbar (Simulate Strangers, Trigger Cutoff, 4 Pitch Beats & Reset)",
    "src/components/orders/OrdersPickupView.tsx": "Student My Orders & Saturday Pickup Pass view with fulfilled vs auto-refunded slice breakdown",
    "src/components/orders/PickupPassCard.tsx": "Offline QRCodeSVG + 4-digit PIN campus hub collection pass with signature guard",
    "src/components/orders/SettlementReceipt.tsx": "Perforated post-cutoff GBP escrow settlement & auto-refund receipt component",
    "src/components/ops/HubOpsView.tsx": "Campus Hub Operations dashboard combining Booker wholesale PO manifest, marshall scanner & compliance",
    "src/components/ops/HubMarshallScannerCard.tsx": "Saturday Hub Marshall QR JSON / pickup code / 4-digit PIN check-in verifier & audit log",
    "src/components/ops/WholesaleManifestSection.tsx": "Aggregated locked-case Booker pallet PO manifest & unit margin breakdown",
    "src/components/ops/EstatesComplianceStrip.tsx": "Campus Estates ambient-only food safety, courier trip reduction & grace-window forfeiture strip",
    "src/components/investor/InvestorPitchView.tsx": "UoB 4-hub unit economics & 38,000-student campus scale rollout model view",
    "src/utils/currency.ts": "Integer-pence GBP arithmetic & escrow conservation guards",
    "src/utils/security.ts": "Re-exported storefront & storage sanitization utilities",
}

_THREAD_LOCK_STATE = threading.local()

# Pre-compiled regular expressions for fast (<40ms) single-pass extraction
_RE_IMPORT_FROM = re.compile(r"""\bfrom\s+['"](\.[^'"]+)['"]""")
_RE_SIDE_EFFECT_IMPORT = re.compile(r"""^\s*import\s+['"](\.[^'"]+)['"]""", re.MULTILINE)

_RE_EXPORT_INTERFACE = re.compile(
    r"^export\s+interface\s+([A-Za-z0-9_]+)(?:\s*<[^{]+>)?(?:\s+extends\s+[^{]+)?\s*\{",
    re.MULTILINE,
)
_RE_LOCAL_PROPS_INTERFACE = re.compile(
    r"^(?:interface|type)\s+([A-Za-z0-9_]*Props)\b",
    re.MULTILINE,
)
_RE_EXPORT_TYPE = re.compile(
    r"^export\s+type\s+([A-Za-z0-9_]+)(?:\s*<[^=]+>)?\s*=\s*([^;]+);",
    re.MULTILINE,
)
_RE_EXPORT_FUNC = re.compile(
    r"^export\s+(?:(default)\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)(?:\s*:\s*([^\n{]+))?",
    re.MULTILINE,
)
_RE_EXPORT_CLASS = re.compile(
    r"^export\s+(?:default\s+)?class\s+([A-Za-z0-9_]+)(?:\s+extends\s+([^\n{]+))?",
    re.MULTILINE,
)
_RE_EXPORT_CONST = re.compile(
    r"^export\s+const\s+([A-Za-z0-9_]+)(?:\s*:\s*([^=\n]+))?\s*=\s*([^\n;]+)",
    re.MULTILINE,
)
_RE_CREATE_CONTEXT = re.compile(
    r"^(?:export\s+)?const\s+([A-Za-z0-9_]*Context)\s*=\s*(?:React\.)?createContext\s*(?:<([^>]+)>)?",
    re.MULTILINE,
)
_RE_REEXPORT_NAMED = re.compile(
    r"^export\s+(?:type\s+)?\{([^}]+)\}(?:\s*from\s*['\"]([^'\"]+)['\"])?",
    re.MULTILINE,
)
_RE_REEXPORT_STAR = re.compile(
    r"^export\s+\*\s+(?:as\s+([A-Za-z0-9_]+)\s+)?from\s+['\"]([^'\"]+)['\"]",
    re.MULTILINE,
)

_RE_CSS_CUSTOM_PROP = re.compile(r"^\s*(--(?:sb|pc)-[a-zA-Z0-9_-]+)\s*:\s*([^;]+);")
_RE_CSS_CLASS = re.compile(r"^\s*\.((?:sb|pc)-[a-zA-Z0-9_-]+)(?=[\s,:.\[{])")

_RE_PY_DEF_OR_CLASS = re.compile(r"^(class|def)\s+([A-Za-z0-9_]+)\s*(?:\(([^)]*)\))?:")
_RE_JS_TEST = re.compile(r"""^\s*(?:test|it|describe)\(\s*['"`]([^'"`]+)['"`]""")
_RE_CAMEL_SPLIT = re.compile(r"[A-Z]?[a-z]+|[A-Z]+(?=[A-Z][a-z]|\d|\b)|\d+")


def _iso_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _line_number_at(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def _collapse_ws(text: str) -> str:
    return " ".join(text.split())


def _truncate(text: str, max_len: int = 120) -> str:
    clean = _collapse_ws(text)
    if len(clean) <= max_len:
        return clean
    return clean[: max_len - 3].rstrip() + "..."


@contextmanager
def _hub_flock(hub_dir: Path) -> Iterator[None]:
    """Re-entrant exclusive file lock on `<hub_dir>/.hub.lock`."""
    hub_dir.mkdir(parents=True, exist_ok=True)
    lock_path = (hub_dir / ".hub.lock").resolve()
    held: dict[Path, int] = getattr(_THREAD_LOCK_STATE, "held", None) or {}
    _THREAD_LOCK_STATE.held = held

    if held.get(lock_path, 0) > 0:
        held[lock_path] += 1
        try:
            yield
        finally:
            held[lock_path] -= 1
        return

    fd = os.open(str(lock_path), os.O_CREAT | os.O_RDWR, 0o644)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        held[lock_path] = 1
        yield
    finally:
        held.pop(lock_path, None)
        try:
            fcntl.flock(fd, fcntl.LOCK_UN)
        finally:
            os.close(fd)


def _atomic_write_text(target_path: Path, content: str) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        prefix=f".{target_path.name}.",
        suffix=".tmp",
        dir=str(target_path.parent),
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(content)
            fh.flush()
        os.chmod(tmp_name, 0o644)
        os.replace(tmp_name, target_path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def _atomic_write_json(target_path: Path, data: dict[str, Any]) -> None:
    serialized = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    _atomic_write_text(target_path, serialized)


def resolve_hub_dir(
    hub_dir: Path | str | None = None,
    workspace_root: Path | str | None = None,
) -> Path:
    if hub_dir is not None and str(hub_dir).strip():
        return Path(hub_dir).expanduser().resolve()
    env_hub = os.environ.get("SPLITBOX_HUB_DIR", "").strip()
    if env_hub:
        return Path(env_hub).expanduser().resolve()
    ws = Path(workspace_root).expanduser().resolve() if workspace_root else DEFAULT_WORKSPACE_ROOT
    return (ws / ".agents" / "hub").resolve()


def resolve_workspace_root(
    workspace_root: Path | str | None = None,
    hub_dir: Path | str | None = None,
) -> Path:
    if workspace_root is not None and str(workspace_root).strip():
        return Path(workspace_root).expanduser().resolve()

    env_ws = os.environ.get("SPLITBOX_WORKSPACE_ROOT", "").strip()
    if env_ws:
        return Path(env_ws).expanduser().resolve()

    # If an existing index in `hub_dir` recorded its workspace_root (e.g. isolated temp_ws test), honor it
    candidate_hub: Path | None = None
    if hub_dir is not None and str(hub_dir).strip():
        candidate_hub = Path(hub_dir).expanduser().resolve()
    elif os.environ.get("SPLITBOX_HUB_DIR", "").strip():
        candidate_hub = Path(os.environ["SPLITBOX_HUB_DIR"]).expanduser().resolve()

    if candidate_hub is not None:
        idx_file = candidate_hub / "codebase_index.json"
        if idx_file.is_file():
            try:
                raw = json.loads(idx_file.read_text(encoding="utf-8"))
                recorded_ws = raw.get("workspace_root") if isinstance(raw, dict) else None
                if isinstance(recorded_ws, str) and recorded_ws.strip():
                    rec_path = Path(recorded_ws).resolve()
                    if rec_path.is_dir():
                        return rec_path
            except Exception:
                pass

    return DEFAULT_WORKSPACE_ROOT


def _is_within(child: Path, parent: Path) -> bool:
    try:
        child.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def _should_skip_path(file_path: Path, workspace_root: Path, hub_dir: Path) -> bool:
    resolved = file_path.resolve()
    default_hub = (workspace_root / ".agents" / "hub").resolve()
    if _is_within(resolved, hub_dir) or _is_within(resolved, default_hub):
        return True
    for part in resolved.parts:
        if part in EXCLUDED_DIR_NAMES or part == ".gemini":
            return True
    return False


def _classify_group(rel_path: str) -> str:
    p = rel_path.replace("\\", "/")
    if p in {"src/main.tsx", "src/App.tsx"} or p.startswith("src/components/common/"):
        return "entry_views"
    if p.startswith("src/store/"):
        return "state_engine"
    if p.startswith("src/components/storefront/"):
        return "ui_storefront"
    if p.startswith("src/components/basket/"):
        return "ui_basket"
    if p.startswith("src/components/orders/"):
        return "ui_orders"
    if p.startswith("src/components/ops/"):
        return "ui_ops"
    if p.startswith("src/components/investor/"):
        return "ui_investor"
    if p.startswith("src/components/"):
        return "ui_other"
    if p == "src/types.ts" or p.startswith("src/data/") or p.startswith("src/utils/") or p.startswith("src/services/") or p.endswith(".d.ts"):
        return "data_types"
    if p.endswith(".css"):
        return "design_tokens"
    if p.startswith(".agents/skills/"):
        return "skills"
    if p.startswith(".agents/agents/"):
        return "agents"
    if p.endswith(".md"):
        return "specs"
    if p.startswith("tests/"):
        return "tests"
    return "other"


def _extract_brace_block(text: str, open_brace_idx: int, max_chars: int = 8000) -> str:
    """Extracts the balanced `{ ... }` body starting at `open_brace_idx`."""
    if open_brace_idx < 0 or open_brace_idx >= len(text) or text[open_brace_idx] != "{":
        return ""
    depth = 0
    end_limit = min(len(text), open_brace_idx + max_chars)
    i = open_brace_idx
    while i < end_limit:
        ch = text[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[open_brace_idx + 1 : i]
        i += 1
    return text[open_brace_idx + 1 : end_limit]


def _parse_interface_fields(body: str, base_line: int) -> list[dict[str, Any]]:
    """Extracts top-level fields/methods from a TypeScript interface body."""
    fields: list[dict[str, Any]] = []
    depth = 0
    lines = body.splitlines()
    for offset_idx, raw_line in enumerate(lines):
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("//") or stripped.startswith("/*") or stripped.startswith("*"):
            depth += raw_line.count("{") - raw_line.count("}")
            continue
        if depth == 0:
            m = re.match(r"^(?:readonly\s+)?([A-Za-z0-9_]+)(\??)\s*:\s*(.+?);?\s*$", stripped)
            if m:
                fname, opt, ftype = m.group(1), m.group(2), m.group(3).rstrip(";").strip()
                fields.append(
                    {
                        "name": fname,
                        "optional": bool(opt),
                        "type": _truncate(ftype, 80),
                        "line": base_line + offset_idx,
                    }
                )
            else:
                # Method signature e.g. `getItem(key: string): string | null;`
                m_meth = re.match(r"^([A-Za-z0-9_]+)(\??)\s*\(([^)]*)\)\s*:\s*(.+?);?\s*$", stripped)
                if m_meth:
                    fname, opt, params, ret = (
                        m_meth.group(1),
                        m_meth.group(2),
                        _collapse_ws(m_meth.group(3)),
                        m_meth.group(4).rstrip(";").strip(),
                    )
                    fields.append(
                        {
                            "name": fname,
                            "optional": bool(opt),
                            "type": _truncate(f"({params}) => {ret}", 80),
                            "line": base_line + offset_idx,
                        }
                    )
        depth += raw_line.count("{") - raw_line.count("}")
    return fields


def _resolve_relative_import(
    importer_rel_path: str,
    specifier: str,
    known_paths: set[str],
    workspace_root: Path,
) -> str | None:
    if not specifier.startswith("."):
        return None
    importer_dir = posixpath.dirname(importer_rel_path.replace("\\", "/"))
    rel_base = posixpath.normpath(posixpath.join(importer_dir, specifier))
    if rel_base.startswith(".."):
        return None

    candidates = (
        rel_base,
        f"{rel_base}.ts",
        f"{rel_base}.tsx",
        f"{rel_base}.css",
        f"{rel_base}.mjs",
        f"{rel_base}.js",
        f"{rel_base}/index.ts",
        f"{rel_base}/index.tsx",
    )
    for cand in candidates:
        if cand in known_paths:
            return cand
    for cand in candidates:
        if (workspace_root / cand).is_file():
            return cand
    return None


def _infer_ts_summary(
    rel_path: str,
    exports: list[dict[str, Any]],
    props_interfaces: dict[str, list[str]],
) -> str:
    if rel_path in KNOWN_FILE_ROLES:
        return KNOWN_FILE_ROLES[rel_path]
    if Path(rel_path).name in {"index.ts", "index.tsx"}:
        names = [e["name"] for e in exports[:6]]
        return f"Barrel re-exports ({', '.join(names)})" if names else "Slice barrel module"

    components = [e["name"] for e in exports if e["kind"] == "component"]
    funcs = [e["name"] for e in exports if e["kind"] in {"function", "hook"}]
    types = [e["name"] for e in exports if e["kind"] in {"interface", "type"}]
    parts: list[str] = []
    if components:
        comp_str = ", ".join(components[:3])
        first_props = next(iter(props_interfaces.values()), [])
        if first_props:
            comp_str += f" (props: {', '.join(first_props[:4])})"
        parts.append(f"React component {comp_str}")
    if funcs:
        parts.append(f"exports {', '.join(funcs[:4])}")
    if types and not components:
        parts.append(f"types {', '.join(types[:4])}")
    return "; ".join(parts) if parts else f"TypeScript module ({Path(rel_path).name})"


def _parse_ts_or_tsx_file(
    file_path: Path,
    rel_path: str,
    known_paths: set[str],
    workspace_root: Path,
) -> dict[str, Any]:
    text = file_path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    line_count = len(lines)
    is_tsx = file_path.suffix.lower() == ".tsx"
    is_barrel = file_path.name in {"index.ts", "index.tsx"}

    # 1. Relative imports & re-export edges
    raw_specifiers: list[str] = []
    for m in _RE_IMPORT_FROM.finditer(text):
        raw_specifiers.append(m.group(1).strip())
    for m in _RE_SIDE_EFFECT_IMPORT.finditer(text):
        raw_specifiers.append(m.group(1).strip())

    imports: list[str] = []
    seen_imports: set[str] = set()
    for spec in raw_specifiers:
        resolved = _resolve_relative_import(rel_path, spec, known_paths, workspace_root)
        if resolved and resolved != rel_path and resolved not in seen_imports:
            seen_imports.add(resolved)
            imports.append(resolved)

    exports: list[dict[str, Any]] = []
    seen_export_keys: set[tuple[str, int]] = set()
    props_interfaces: dict[str, list[str]] = {}
    context_contract: dict[str, Any] | None = None

    def _add_symbol(name: str, kind: str, line: int, signature: str) -> None:
        if not name or (name, line) in seen_export_keys:
            return
        seen_export_keys.add((name, line))
        exports.append(
            {
                "name": name,
                "kind": kind,
                "line": line,
                "signature": _truncate(signature, 140),
            }
        )

    # 2. Exported interfaces (+ props & ContextValue contracts)
    for m in _RE_EXPORT_INTERFACE.finditer(text):
        iname = m.group(1)
        line = _line_number_at(text, m.start())
        brace_idx = m.end() - 1
        body = _extract_brace_block(text, brace_idx, max_chars=12000)
        fields = _parse_interface_fields(body, line)
        field_preview = ", ".join(
            f"{f['name']}{'?' if f['optional'] else ''}: {f['type']}" for f in fields[:7]
        )
        if len(fields) > 7:
            field_preview += f", ... (+{len(fields) - 7})"
        sig = f"interface {iname} {{ {field_preview} }}" if field_preview else f"interface {iname}"
        _add_symbol(iname, "interface", line, sig)

        if iname.endswith("Props"):
            props_interfaces[iname] = [
                f"{f['name']}{'?' if f['optional'] else ''}: {f['type']}" for f in fields
            ]

        if iname.endswith("ContextValue"):
            state_fields: list[str] = []
            selectors: list[str] = []
            actions: list[str] = []
            for f in fields:
                fname = f["name"]
                ftype = f["type"]
                fline = f["line"]
                if "=>" in ftype:
                    if fname.startswith(("get", "is", "has", "can", "compute", "select")):
                        selectors.append(fname)
                        _add_symbol(fname, "context_selector", fline, f"{iname}.{fname}: {ftype}")
                    else:
                        actions.append(fname)
                        _add_symbol(fname, "context_action", fline, f"{iname}.{fname}: {ftype}")
                else:
                    state_fields.append(fname)
            context_contract = {
                "interface": iname,
                "line": line,
                "state_fields": state_fields,
                "selectors": selectors,
                "actions": actions,
            }

    # Capture non-exported local `*Props` interfaces in .tsx files as well
    if is_tsx:
        for m in _RE_LOCAL_PROPS_INTERFACE.finditer(text):
            pname = m.group(1)
            if pname in props_interfaces:
                continue
            brace_pos = text.find("{", m.end())
            if brace_pos != -1 and brace_pos - m.end() < 80:
                line = _line_number_at(text, m.start())
                body = _extract_brace_block(text, brace_pos, max_chars=4000)
                fields = _parse_interface_fields(body, line)
                if fields:
                    props_interfaces[pname] = [
                        f"{f['name']}{'?' if f['optional'] else ''}: {f['type']}" for f in fields
                    ]

    # 3. Exported type aliases
    for m in _RE_EXPORT_TYPE.finditer(text):
        tname = m.group(1)
        rhs = _collapse_ws(m.group(2))
        line = _line_number_at(text, m.start())
        _add_symbol(tname, "type", line, f"type {tname} = {rhs}")

    # 4. React createContext instances (even if module-scoped alongside DropProvider / useDrop)
    for m in _RE_CREATE_CONTEXT.finditer(text):
        cname = m.group(1)
        ctype = _collapse_ws(m.group(2) or "unknown")
        line = _line_number_at(text, m.start())
        _add_symbol(cname, "context", line, f"const {cname} = createContext<{ctype}>()")

    # 5. Exported functions, hooks & function components
    for m in _RE_EXPORT_FUNC.finditer(text):
        is_default = bool(m.group(1))
        fname = m.group(2)
        params = _collapse_ws(m.group(3))
        ret = _collapse_ws(m.group(4) or "").rstrip("{").strip()
        line = _line_number_at(text, m.start())
        if fname.startswith("use") and len(fname) > 3 and fname[3].isupper():
            kind = "hook"
        elif is_tsx and fname[0].isupper():
            kind = "component"
        else:
            kind = "function"
        prefix = "export default function" if is_default else "function"
        ret_str = f": {ret}" if ret else ""
        _add_symbol(fname, kind, line, f"{prefix} {fname}({params}){ret_str}")

    # 6. Exported classes (e.g., ErrorBoundary / AppErrorBoundary)
    for m in _RE_EXPORT_CLASS.finditer(text):
        cname = m.group(1)
        ext = _collapse_ws(m.group(2) or "")
        line = _line_number_at(text, m.start())
        kind = "component" if is_tsx and ("Component" in ext or cname[0].isupper()) else "class"
        sig = f"class {cname} extends {ext}" if ext else f"class {cname}"
        _add_symbol(cname, kind, line, sig)

    # 7. Exported constants & React.FC arrow components
    for m in _RE_EXPORT_CONST.finditer(text):
        cname = m.group(1)
        type_ann = _collapse_ws(m.group(2) or "")
        rhs = _collapse_ws(m.group(3) or "")
        line = _line_number_at(text, m.start())
        if cname.endswith("Context") and any(e["name"] == cname for e in exports):
            continue
        is_fc = is_tsx and cname[0].isupper() and (
            "FC" in type_ann or "=>" in rhs or "forwardRef" in rhs or "memo(" in rhs
        )
        kind = "component" if is_fc else "const"
        ann_str = f": {type_ann}" if type_ann else ""
        _add_symbol(cname, kind, line, f"const {cname}{ann_str} = {rhs}")

    # 8. Barrel / named re-exports (`export { A, B as C } from './X'`)
    for m in _RE_REEXPORT_NAMED.finditer(text):
        raw_names = m.group(1)
        from_spec = (m.group(2) or "").strip()
        line = _line_number_at(text, m.start())
        for chunk in raw_names.split(","):
            token = _collapse_ws(chunk)
            if not token:
                continue
            is_type_only = False
            if token.startswith("type "):
                is_type_only = True
                token = token[5:].strip()
            if " as " in token:
                orig, alias = [p.strip() for p in token.split(" as ", 1)]
            else:
                orig = alias = token
            if not re.match(r"^[A-Za-z0-9_]+$", alias):
                continue
            if any(e["name"] == alias for e in exports):
                continue
            kind = "reexport_type" if is_type_only else ("reexport" if is_barrel or from_spec else "export")
            src_note = f" from '{from_spec}'" if from_spec else ""
            alias_note = f"{orig} as {alias}" if orig != alias else alias
            _add_symbol(alias, kind, line, f"export {{ {alias_note} }}{src_note}")

    for m in _RE_REEXPORT_STAR.finditer(text):
        ns = (m.group(1) or "*").strip()
        from_spec = m.group(2).strip()
        line = _line_number_at(text, m.start())
        _add_symbol(f"*{from_spec}", "reexport", line, f"export * from '{from_spec}'" if ns == "*" else f"export * as {ns} from '{from_spec}'")

    exports.sort(key=lambda item: item["line"])
    summary = _infer_ts_summary(rel_path, exports, props_interfaces)

    entry: dict[str, Any] = {
        "path": rel_path,
        "kind": "tsx" if is_tsx else "ts",
        "group": _classify_group(rel_path),
        "lines": line_count,
        "summary": summary,
        "exports": exports,
        "imports": imports,
        "imported_by": [],
    }
    if props_interfaces:
        entry["props_interfaces"] = props_interfaces
    if context_contract:
        entry["context_contract"] = context_contract
    return entry


def _parse_css_file(file_path: Path, rel_path: str) -> dict[str, Any]:
    text = file_path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()

    css_tokens: list[dict[str, Any]] = []
    seen_tokens: set[str] = set()
    css_classes: list[dict[str, Any]] = []
    seen_classes: set[str] = set()

    for idx, line in enumerate(lines, 1):
        m_tok = _RE_CSS_CUSTOM_PROP.match(line)
        if m_tok:
            tname, tval = m_tok.group(1), _collapse_ws(m_tok.group(2))
            if tname not in seen_tokens:
                seen_tokens.add(tname)
                css_tokens.append(
                    {
                        "name": tname,
                        "value": tval,
                        "line": idx,
                        "signature": f"{tname}: {tval}",
                    }
                )
        m_cls = _RE_CSS_CLASS.match(line)
        if m_cls:
            cname = f".{m_cls.group(1)}"
            if cname not in seen_classes:
                seen_classes.add(cname)
                css_classes.append(
                    {
                        "name": cname,
                        "line": idx,
                        "signature": f"{cname} {{ ... }}",
                    }
                )

    summary = KNOWN_FILE_ROLES.get(
        rel_path,
        f"Stylesheet defining {len(css_tokens)} --sb-* tokens and {len(css_classes)} .sb-* utility classes",
    )
    return {
        "path": rel_path,
        "kind": "css",
        "group": "design_tokens",
        "lines": len(lines),
        "summary": summary,
        "css_tokens": css_tokens,
        "css_classes": css_classes,
        "exports": [],
        "imports": [],
        "imported_by": [],
    }


def _parse_frontmatter(lines: list[str]) -> dict[str, str]:
    if not lines or lines[0].strip() != "---":
        return {}
    meta: dict[str, str] = {}
    current_key: str | None = None
    for idx in range(1, min(len(lines), 45)):
        raw = lines[idx]
        if raw.strip() == "---":
            break
        m = re.match(r"^([A-Za-z0-9_-]+)\s*:\s*(.*)$", raw)
        if m:
            key = m.group(1).strip()
            val = m.group(2).strip()
            if val in {">-", ">", "|", "|-"}:
                current_key = key
                meta[key] = ""
            else:
                current_key = None
                meta[key] = val.strip("'\"")
        elif current_key and (raw.startswith("  ") or raw.startswith("\t")):
            piece = raw.strip()
            meta[current_key] = f"{meta[current_key]} {piece}".strip()
        else:
            current_key = None
    return meta


def _parse_markdown_file(file_path: Path, rel_path: str) -> dict[str, Any]:
    text = file_path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    frontmatter = _parse_frontmatter(lines)

    headings: list[dict[str, Any]] = []
    in_fence = False
    start_idx = 0
    if frontmatter and lines and lines[0].strip() == "---":
        for i in range(1, min(len(lines), 45)):
            if lines[i].strip() == "---":
                start_idx = i + 1
                break

    for idx in range(start_idx, len(lines)):
        raw = lines[idx]
        stripped = raw.lstrip()
        if stripped.startswith("```") or stripped.startswith("~~~"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        if stripped.startswith("# "):
            headings.append({"level": 1, "title": _collapse_ws(stripped[2:]), "line": idx + 1})
        elif stripped.startswith("## "):
            headings.append({"level": 2, "title": _collapse_ws(stripped[3:]), "line": idx + 1})

    group = _classify_group(rel_path)
    basename = Path(rel_path).name
    if rel_path in SPEC_AUTHORITY_ROLES:
        authority_role = SPEC_AUTHORITY_ROLES[rel_path]
    elif group == "skills":
        skill_name = frontmatter.get("name") or Path(rel_path).parent.name
        desc = frontmatter.get("description") or (headings[0]["title"] if headings else skill_name)
        authority_role = f"Skill `{skill_name}`: {_truncate(desc, 110)}"
    elif group == "agents":
        agent_name = frontmatter.get("name") or Path(rel_path).stem
        desc = frontmatter.get("description") or f"Custom full-tool agent persona `{agent_name}`"
        authority_role = f"Custom Agent `{agent_name}`: {_truncate(desc, 110)}"
    else:
        h1 = headings[0]["title"] if headings else basename
        authority_role = f"Specification / Guide: {h1}"

    return {
        "path": rel_path,
        "kind": "markdown",
        "group": group,
        "lines": len(lines),
        "summary": authority_role,
        "authority_role": authority_role,
        "frontmatter": frontmatter,
        "headings": headings,
        "exports": [],
        "imports": [],
        "imported_by": [],
    }


def _parse_test_or_script_file(file_path: Path, rel_path: str) -> dict[str, Any]:
    text = file_path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    suffix = file_path.suffix.lower()
    exports: list[dict[str, Any]] = []

    if suffix == ".py":
        for idx, raw in enumerate(lines, 1):
            m = _RE_PY_DEF_OR_CLASS.match(raw)
            if m:
                kind_kw, name, params = m.group(1), m.group(2), _collapse_ws(m.group(3) or "")
                if name.startswith("_"):
                    continue
                exports.append(
                    {
                        "name": name,
                        "kind": "test_suite" if name.startswith("Test") else kind_kw,
                        "line": idx,
                        "signature": _truncate(f"{kind_kw} {name}({params})", 110),
                    }
                )
    else:
        for idx, raw in enumerate(lines, 1):
            m = _RE_JS_TEST.match(raw)
            if m and len(exports) < 20:
                tname = m.group(1)
                exports.append(
                    {
                        "name": tname,
                        "kind": "test_case",
                        "line": idx,
                        "signature": _truncate(f"test({tname!r})", 110),
                    }
                )

    group = _classify_group(rel_path)
    summary = (
        f"Test suite ({len(lines)} lines, {len(exports)} suites/cases)"
        if group == "tests"
        else f"Harness/script ({len(lines)} lines)"
    )
    return {
        "path": rel_path,
        "kind": suffix.lstrip(".") or "file",
        "group": group,
        "lines": len(lines),
        "summary": summary,
        "exports": exports,
        "imports": [],
        "imported_by": [],
    }


def _parse_single_file_entry(
    file_path: Path,
    rel_path: str,
    known_paths: set[str],
    workspace_root: Path,
) -> dict[str, Any] | None:
    suffix = file_path.suffix.lower()
    if suffix in {".ts", ".tsx"}:
        return _parse_ts_or_tsx_file(file_path, rel_path, known_paths, workspace_root)
    if suffix == ".css":
        return _parse_css_file(file_path, rel_path)
    if suffix == ".md":
        return _parse_markdown_file(file_path, rel_path)
    if suffix in {".mjs", ".js", ".py"}:
        return _parse_test_or_script_file(file_path, rel_path)
    return None


def _collect_target_files(workspace_root: Path, hub_dir: Path) -> list[tuple[Path, str]]:
    """Collects canonical workspace files to index in deterministic path order."""
    collected: dict[str, Path] = {}

    def _add(p: Path) -> None:
        if not p.is_file() or _should_skip_path(p, workspace_root, hub_dir):
            return
        rel = p.resolve().relative_to(workspace_root).as_posix()
        collected[rel] = p.resolve()

    # 1. src/**/*.{ts,tsx,css}
    src_dir = workspace_root / "src"
    if src_dir.is_dir():
        for p in sorted(src_dir.rglob("*")):
            if p.is_file() and p.suffix.lower() in INDEXABLE_SRC_SUFFIXES:
                _add(p)

    # 2. Root specs (brief.md, page-syles.md, identity.md, AGENTS.md)
    for spec_name in ROOT_SPEC_FILES:
        spec_path = workspace_root / spec_name
        if spec_path.is_file():
            _add(spec_path)

    # 3. .agents/skills/*/SKILL.md
    skills_dir = workspace_root / ".agents" / "skills"
    if skills_dir.is_dir():
        for p in sorted(skills_dir.glob("*/SKILL.md")):
            _add(p)

    # 4. .agents/agents/*.md
    agents_dir = workspace_root / ".agents" / "agents"
    if agents_dir.is_dir():
        for p in sorted(agents_dir.glob("*.md")):
            _add(p)

    # 5. tests/*
    tests_dir = workspace_root / "tests"
    if tests_dir.is_dir():
        for p in sorted(tests_dir.rglob("*")):
            if p.is_file() and p.suffix.lower() in INDEXABLE_UPDATE_SUFFIXES:
                _add(p)

    return [(collected[rel], rel) for rel in sorted(collected)]


def _recompute_reverse_imports_and_stats(files_map: dict[str, dict[str, Any]]) -> tuple[dict[str, list[str]], dict[str, int]]:
    reverse_map: dict[str, list[str]] = {rel: [] for rel in files_map}
    for importer_rel, entry in files_map.items():
        for target_rel in entry.get("imports") or []:
            if target_rel in reverse_map and importer_rel not in reverse_map[target_rel]:
                reverse_map[target_rel].append(importer_rel)

    for rel, importers in reverse_map.items():
        importers.sort()
        files_map[rel]["imported_by"] = importers

    # Clean out empty reverse entries in the top-level `imported_by` summary map
    non_empty_reverse = {k: v for k, v in sorted(reverse_map.items()) if v}

    src_lines = 0
    total_lines = 0
    symbol_count = 0
    token_count = 0
    for rel, entry in files_map.items():
        lines = int(entry.get("lines", 0))
        total_lines += lines
        if rel.startswith("src/"):
            src_lines += lines
        symbol_count += len(entry.get("exports") or [])
        token_count += len(entry.get("css_tokens") or [])

    stats = {
        "indexed_files": len(files_map),
        "src_files": sum(1 for r in files_map if r.startswith("src/")),
        "src_lines": src_lines,
        "total_lines": total_lines,
        "exported_symbols": symbol_count,
        "css_tokens": token_count,
    }
    return non_empty_reverse, stats


def render_codebase_map(index: dict[str, Any]) -> str:
    """Renders `.agents/hub/CODEBASE_MAP.md` (strictly <= 160 lines) with `file#Lline` pointers."""
    files_map: dict[str, dict[str, Any]] = index.get("files") or {}
    stats = index.get("stats") or {}

    lines: list[str] = [
        "# SplitBox Codebase Map (O(1) Agent Context Atlas)",
        (
            f"> Auto-generated by `harness/codebase_indexer.py` · "
            f"**{stats.get('indexed_files', len(files_map))} files** "
            f"(`src/`: {stats.get('src_lines', 0)} lines, {stats.get('exported_symbols', 0)} symbols, "
            f"{stats.get('css_tokens', 0)} `--sb-*` tokens). "
            f"Query exact contracts via `python3 harness/agent_hub.py query \"<symbol>\"`."
        ),
        "",
    ]

    def _fmt_exports(entry: dict[str, Any], max_items: int = 5, skip_context_members: bool = True) -> str:
        exps = [
            e
            for e in (entry.get("exports") or [])
            if not (skip_context_members and e.get("kind") in {"context_action", "context_selector"})
            and not str(e.get("name", "")).startswith("*")
        ]
        # Prioritize components, hooks, context, interfaces, functions over constants/re-exports
        priority = {
            "context": 0,
            "component": 1,
            "hook": 2,
            "interface": 3,
            "function": 4,
            "type": 5,
            "class": 6,
            "const": 7,
            "reexport": 8,
            "reexport_type": 9,
        }
        exps_sorted = sorted(exps, key=lambda e: (priority.get(str(e.get("kind")), 8), int(e.get("line", 1))))
        picked = exps_sorted[:max_items]
        if not picked:
            return ""
        formatted = ", ".join(f"`{e['name']}` (`#L{e['line']}`)" for e in picked)
        if len(exps_sorted) > max_items:
            formatted += f" +{len(exps_sorted) - max_items}"
        return formatted

    def _first_anchor(entry: dict[str, Any]) -> str:
        exps = [
            e
            for e in (entry.get("exports") or [])
            if e.get("kind") in {"component", "hook", "context", "interface", "function", "type"}
        ]
        line_no = exps[0]["line"] if exps else 1
        return f"`{entry['path']}#L{line_no}`"

    # Section 1: Entry & Views
    lines.append("## 1. Entry & Views")
    entry_files = [
        e for _, e in sorted(files_map.items()) if e.get("group") == "entry_views" and not e["path"].endswith("/index.ts")
    ]
    view_Paths = (
        "src/components/storefront/StorefrontView.tsx",
        "src/components/orders/OrdersPickupView.tsx",
        "src/components/ops/HubOpsView.tsx",
        "src/components/investor/InvestorPitchView.tsx",
    )
    for entry in entry_files:
        exp_str = _fmt_exports(entry, max_items=4)
        suffix = f" — {exp_str}" if exp_str else ""
        lines.append(f"- {_first_anchor(entry)} ({entry['lines']}L): {entry['summary']}{suffix}")
    for vp in view_Paths:
        if vp in files_map:
            ve = files_map[vp]
            lines.append(f"- {_first_anchor(ve)} ({ve['lines']}L): {ve['summary']}")
    lines.append("")

    # Section 2: State & Drop Engine
    lines.append("## 2. State & Drop Engine")
    state_files = [e for _, e in sorted(files_map.items()) if e.get("group") == "state_engine"]
    for entry in state_files:
        exp_str = _fmt_exports(entry, max_items=7)
        lines.append(f"- {_first_anchor(entry)} ({entry['lines']}L): {entry['summary']}")
        if exp_str:
            lines.append(f"  - Key Exports: {exp_str}")
        ctx = entry.get("context_contract")
        if isinstance(ctx, dict):
            sels = ", ".join(f"`{s}`" for s in (ctx.get("selectors") or [])[:7])
            acts = ", ".join(f"`{a}`" for a in (ctx.get("actions") or [])[:12])
            if len(ctx.get("actions") or []) > 12:
                acts += f" +{len(ctx['actions']) - 12}"
            if sels:
                lines.append(f"  - `{ctx['interface']}` (`#L{ctx['line']}`) Selectors: {sels}")
            if acts:
                lines.append(f"  - `{ctx['interface']}` Actions: {acts}")
    lines.append("")

    # Section 3: UI Slices (storefront, basket, orders, ops, investor)
    lines.append("## 3. UI Slices (`storefront`, `basket`, `orders`, `ops`, `investor`)")
    slice_groups = (
        ("storefront", "ui_storefront"),
        ("basket", "ui_basket"),
        ("orders", "ui_orders"),
        ("ops", "ui_ops"),
        ("investor", "ui_investor"),
    )
    for label, gkey in slice_groups:
        g_entries = [
            e
            for _, e in sorted(files_map.items())
            if e.get("group") == gkey and not Path(e["path"]).name.startswith("index.")
        ]
        if not g_entries:
            continue
        lines.append(f"### `{label}`")
        for entry in g_entries:
            exp_str = _fmt_exports(entry, max_items=4)
            props_map = entry.get("props_interfaces") or {}
            props_hint = ""
            if props_map:
                pname, pfields = next(iter(props_map.items()))
                short_fields = ", ".join(f.split(":")[0] for f in pfields[:5])
                props_hint = f" · `{pname}`: `{short_fields}`"
            lines.append(
                f"- {_first_anchor(entry)} ({entry['lines']}L): {exp_str or Path(entry['path']).stem}{props_hint}"
            )
    lines.append("")

    # Section 4: Data & Types
    lines.append("## 4. Data & Types")
    data_files = [
        e
        for _, e in sorted(files_map.items())
        if e.get("group") == "data_types"
        and not Path(e["path"]).name.startswith("index.")
        and not e["path"].endswith(".d.ts")
    ]
    for entry in data_files:
        exp_str = _fmt_exports(entry, max_items=8)
        lines.append(f"- {_first_anchor(entry)} ({entry['lines']}L): {entry['summary']}")
        if exp_str:
            lines.append(f"  - Exports: {exp_str}")
    lines.append("")

    # Section 5: Design Tokens (--sb-*)
    lines.append("## 5. Design Tokens (`--sb-*`) & Tactile Crate Classes")
    css_files = [e for _, e in sorted(files_map.items()) if e.get("kind") == "css"]
    if css_files:
        for ce in css_files:
            tokens = ce.get("css_tokens") or []
            classes = ce.get("css_classes") or []
            tok_preview = ", ".join(
                f"`{t['name']}` (`{t['value']}`, `#L{t['line']}`)" for t in tokens[:10]
            )
            if len(tokens) > 10:
                tok_preview += f" +{len(tokens) - 10} more"
            cls_preview = ", ".join(f"`{c['name']}` (`#L{c['line']}`)" for c in classes[:10])
            if len(classes) > 10:
                cls_preview += f" +{len(classes) - 10} more"
            lines.append(f"- `{ce['path']}#L1` ({ce['lines']}L): {ce['summary']}")
            if tok_preview:
                lines.append(f"  - `--sb-*` Tokens: {tok_preview}")
            if cls_preview:
                lines.append(f"  - `.sb-*` Classes: {cls_preview}")
    else:
        lines.append("- No CSS token stylesheet indexed yet.")
    lines.append("")

    # Section 6: Spec, Skill & Test Pointers
    lines.append("## 6. Spec, Skill & Test Pointers")
    spec_entries = [
        e
        for _, e in sorted(files_map.items())
        if e.get("group") == "specs" and e["path"] != "page-styles.md"
    ]
    for se in spec_entries:
        h2s = [h for h in (se.get("headings") or []) if h.get("level") == 2][:4]
        h_str = ", ".join(f"{h['title']} (`#L{h['line']}`)" for h in h2s)
        tail = f" — Sections: {h_str}" if h_str else ""
        lines.append(f"- `{se['path']}#L1` ({se['lines']}L): {se['summary']}{tail}")

    skill_entries = [e for _, e in sorted(files_map.items()) if e.get("group") == "skills"]
    if skill_entries:
        skill_links = ", ".join(
            f"`{Path(e['path']).parent.name}` (`{e['path']}#L1`)" for e in skill_entries[:8]
        )
        lines.append(f"- **Workspace Skills**: {skill_links}")

    agent_entries = [e for _, e in sorted(files_map.items()) if e.get("group") == "agents"]
    if agent_entries:
        agent_links = ", ".join(
            f"`{Path(e['path']).stem}` (`{e['path']}#L1`)" for e in agent_entries[:6]
        )
        lines.append(f"- **Custom Full-Tool Agents**: {agent_links}")

    test_entries = [e for _, e in sorted(files_map.items()) if e.get("group") == "tests"]
    if test_entries:
        test_links = ", ".join(f"`{e['path']}#L1` ({e['lines']}L)" for e in test_entries[:6])
        lines.append(f"- **Automated Verification Suites**: {test_links}")

    # Enforce strict <= 160 lines contract under any repo size
    if len(lines) > MAX_MAP_LINES:
        lines = lines[: MAX_MAP_LINES - 1] + [
            "_...map truncated to preserve <= 160-line cold-start budget; use `codebase_indexer.py query`..._"
        ]

    return "\n".join(lines).rstrip() + "\n"


def _persist_index_and_map(hub_dir: Path, index_data: dict[str, Any]) -> str:
    map_markdown = render_codebase_map(index_data)
    with _hub_flock(hub_dir):
        _atomic_write_json(hub_dir / "codebase_index.json", index_data)
        _atomic_write_text(hub_dir / "CODEBASE_MAP.md", map_markdown)
    return map_markdown


def build_index(
    workspace_root: Path | str | None = None,
    hub_dir: Path | str | None = None,
) -> dict[str, Any]:
    """Full workspace scan (<100ms) writing `codebase_index.json` and `CODEBASE_MAP.md` atomically."""
    t0 = time.perf_counter()
    ws_root = (
        Path(workspace_root).expanduser().resolve()
        if workspace_root is not None and str(workspace_root).strip()
        else resolve_workspace_root(None, None)
    )
    h_dir = resolve_hub_dir(hub_dir, ws_root)

    targets = _collect_target_files(ws_root, h_dir)
    known_paths = {rel for _, rel in targets}

    files_map: dict[str, dict[str, Any]] = {}
    for abs_path, rel_path in targets:
        entry = _parse_single_file_entry(abs_path, rel_path, known_paths, ws_root)
        if entry is not None:
            files_map[rel_path] = entry

    imported_by_map, stats = _recompute_reverse_imports_and_stats(files_map)
    elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
    stats["build_ms"] = elapsed_ms

    index_data: dict[str, Any] = {
        "schema_version": INDEX_SCHEMA_VERSION,
        "generated_at": _iso_utc(),
        "workspace_root": str(ws_root),
        "stats": stats,
        "imported_by": imported_by_map,
        "files": files_map,
    }
    map_md = _persist_index_and_map(h_dir, index_data)
    index_data["stats"]["map_lines"] = len(map_md.splitlines())
    return index_data


def update_single_file(
    file_path: Path | str,
    workspace_root: Path | str | None = None,
    hub_dir: Path | str | None = None,
) -> dict[str, Any]:
    """Fast (<50ms) incremental single-file index & `CODEBASE_MAP.md` updater."""
    ws_root = resolve_workspace_root(workspace_root, hub_dir)
    h_dir = resolve_hub_dir(hub_dir, ws_root)
    index_path = h_dir / "codebase_index.json"

    if not index_path.is_file():
        return build_index(workspace_root=ws_root, hub_dir=h_dir)

    raw_target = Path(file_path).expanduser()
    if not raw_target.is_absolute():
        raw_target = (ws_root / raw_target).resolve()
    else:
        raw_target = raw_target.resolve()

    if _should_skip_path(raw_target, ws_root, h_dir):
        try:
            return json.loads(index_path.read_text(encoding="utf-8"))
        except Exception:
            return build_index(workspace_root=ws_root, hub_dir=h_dir)

    try:
        index_data = json.loads(index_path.read_text(encoding="utf-8"))
        if not isinstance(index_data, dict) or not isinstance(index_data.get("files"), dict):
            return build_index(workspace_root=ws_root, hub_dir=h_dir)
    except Exception:
        return build_index(workspace_root=ws_root, hub_dir=h_dir)

    # Re-anchor to index's recorded workspace_root if caller omitted `workspace_root`
    if workspace_root is None:
        rec_ws = index_data.get("workspace_root")
        if isinstance(rec_ws, str) and rec_ws.strip():
            rec_path = Path(rec_ws).resolve()
            if rec_path.is_dir():
                ws_root = rec_path

    if _is_within(raw_target, ws_root):
        rel_key = raw_target.relative_to(ws_root).as_posix()
    else:
        rel_key = raw_target.as_posix()

    files_map: dict[str, dict[str, Any]] = index_data["files"]

    if not raw_target.exists() or not raw_target.is_file():
        files_map.pop(rel_key, None)
    elif raw_target.suffix.lower() in INDEXABLE_UPDATE_SUFFIXES:
        known_paths = set(files_map.keys()) | {rel_key}
        parsed = _parse_single_file_entry(raw_target, rel_key, known_paths, ws_root)
        if parsed is not None:
            files_map[rel_key] = parsed

    imported_by_map, stats = _recompute_reverse_imports_and_stats(files_map)
    index_data["generated_at"] = _iso_utc()
    index_data["workspace_root"] = str(ws_root)
    index_data["imported_by"] = imported_by_map
    index_data["stats"] = stats

    map_md = _persist_index_and_map(h_dir, index_data)
    index_data["stats"]["map_lines"] = len(map_md.splitlines())
    return index_data


def _tokenize_identifier(text: str) -> set[str]:
    lowered = text.lower()
    words = set(re.findall(r"[a-z0-9]+", lowered))
    for m in _RE_CAMEL_SPLIT.finditer(text):
        words.add(m.group(0).lower())
    return words


def query_index(
    query: str,
    workspace_root: Path | str | None = None,
    hub_dir: Path | str | None = None,
    limit: int = 8,
) -> dict[str, Any]:
    """Ranked multi-token O(1) search across symbols, React props, `--sb-*` tokens, paths & headings."""
    ws_root = resolve_workspace_root(workspace_root, hub_dir)
    h_dir = resolve_hub_dir(hub_dir, ws_root)
    index_path = h_dir / "codebase_index.json"

    if index_path.is_file():
        try:
            index_data = json.loads(index_path.read_text(encoding="utf-8"))
        except Exception:
            index_data = build_index(workspace_root=ws_root, hub_dir=h_dir)
    else:
        index_data = build_index(workspace_root=ws_root, hub_dir=h_dir)

    raw_query = (query or "").strip()
    if not raw_query:
        return {"query": query, "matches": []}

    q_lower = raw_query.lower()
    is_css_prefix_query = q_lower.startswith("--") or q_lower.startswith(".sb-") or q_lower.startswith(".pc-")
    raw_tokens = [tok for tok in re.split(r"\s+", q_lower) if tok]
    word_tokens: list[str] = []
    for tok in raw_tokens:
        cleaned = tok.strip("`'\".,:;()[]{}")
        if cleaned:
            word_tokens.append(cleaned)
        if not is_css_prefix_query:
            for sub in _tokenize_identifier(tok):
                if len(sub) >= 2 and sub not in {"sb", "pc"} and sub not in word_tokens:
                    word_tokens.append(sub)

    files_map: dict[str, dict[str, Any]] = index_data.get("files") or {}
    candidates: list[tuple[float, int, dict[str, Any]]] = []
    tie_breaker = 0

    def _score_candidate(
        *,
        path: str,
        line: int,
        kind: str,
        name: str,
        signature: str,
        imported_by: list[str],
        summary: str,
        extra_text: str = "",
    ) -> None:
        nonlocal tie_breaker
        name_l = name.lower()
        sig_l = signature.lower()
        path_l = path.lower()
        sum_l = summary.lower()
        extra_l = extra_text.lower()
        stem_l = Path(path).stem.lower()
        is_barrel = Path(path).name in {"index.ts", "index.tsx"}

        score = 0.0

        # Direct phrase / prefix / substring boosts
        if name_l == q_lower:
            score += 140.0
        elif name_l.startswith(q_lower):
            score += 95.0
        elif q_lower in name_l:
            score += 70.0

        if stem_l == q_lower and not is_barrel:
            score += 80.0
        elif q_lower in path_l:
            score += 35.0

        if q_lower in sig_l:
            score += 30.0
        if extra_l and q_lower in extra_l:
            score += 25.0
        if q_lower in sum_l:
            score += 15.0

        # Multi-token matching across identifier parts, signature, props, path, summary
        name_words = _tokenize_identifier(name)
        matched_tokens = 0
        for tok in word_tokens:
            tok_hit = False
            if tok in name_words or tok == name_l:
                score += 32.0
                tok_hit = True
            elif tok in name_l:
                score += 22.0
                tok_hit = True
            if tok in sig_l:
                score += 14.0
                tok_hit = True
            if extra_l and tok in extra_l:
                score += 14.0
                tok_hit = True
            if tok in path_l:
                score += 12.0
                tok_hit = True
            if tok in sum_l:
                score += 8.0
                tok_hit = True
            if tok_hit:
                matched_tokens += 1

        if score <= 0.0:
            return

        if word_tokens and matched_tokens == len(word_tokens) and len(word_tokens) > 1:
            score += 35.0

        # Prefer canonical src/ implementation symbols over barrel re-exports and tests
        if is_barrel or kind in {"reexport", "reexport_type"}:
            score -= 30.0
        elif kind in {"component", "context", "hook", "interface", "css_token", "context_action", "function"}:
            score += 12.0

        if path_l.startswith("src/") and not is_barrel:
            score += 10.0
        elif path_l.startswith("tests/"):
            score -= 8.0

        tie_breaker += 1
        candidates.append(
            (
                score,
                -tie_breaker,
                {
                    "path": path,
                    "line": max(1, int(line)),
                    "kind": kind,
                    "name": name,
                    "signature": signature,
                    "imported_by": imported_by,
                    "summary": summary,
                },
            )
        )

    for rel_path, entry in files_map.items():
        imp_by = list(entry.get("imported_by") or [])
        summary = str(entry.get("summary") or "")
        props_map: dict[str, list[str]] = entry.get("props_interfaces") or {}
        props_blob = " ".join(
            f"{pname} {' '.join(pfields)}" for pname, pfields in props_map.items()
        )

        # 1. Exported TS/TSX/Py/Test symbols
        for sym in entry.get("exports") or []:
            sname = str(sym.get("name") or "")
            skind = str(sym.get("kind") or "symbol")
            sline = int(sym.get("line") or 1)
            ssig = str(sym.get("signature") or sname)
            extra = props_blob if skind in {"component", "interface"} else ""
            _score_candidate(
                path=rel_path,
                line=sline,
                kind=skind,
                name=sname,
                signature=ssig,
                imported_by=imp_by,
                summary=summary,
                extra_text=extra,
            )

        # 2. Non-exported local Props interfaces (if not already in exports)
        exported_names = {str(s.get("name")) for s in (entry.get("exports") or [])}
        for pname, pfields in props_map.items():
            if pname not in exported_names:
                _score_candidate(
                    path=rel_path,
                    line=1,
                    kind="props_interface",
                    name=pname,
                    signature=_truncate(f"interface {pname} {{ {', '.join(pfields[:6])} }}", 140),
                    imported_by=imp_by,
                    summary=summary,
                )

        # 3. CSS custom property tokens (--sb-*) & utility classes (.sb-*)
        for tok in entry.get("css_tokens") or []:
            _score_candidate(
                path=rel_path,
                line=int(tok.get("line") or 1),
                kind="css_token",
                name=str(tok.get("name") or ""),
                signature=str(tok.get("signature") or ""),
                imported_by=imp_by,
                summary=summary,
            )
        for cls in entry.get("css_classes") or []:
            _score_candidate(
                path=rel_path,
                line=int(cls.get("line") or 1),
                kind="css_class",
                name=str(cls.get("name") or ""),
                signature=str(cls.get("signature") or ""),
                imported_by=imp_by,
                summary=summary,
            )

        # 4. Markdown spec & skill headings
        for h in entry.get("headings") or []:
            htitle = str(h.get("title") or "")
            hline = int(h.get("line") or 1)
            hlevel = int(h.get("level") or 2)
            _score_candidate(
                path=rel_path,
                line=hline,
                kind="spec_heading",
                name=htitle,
                signature=f"{'#' * hlevel} {htitle}",
                imported_by=imp_by,
                summary=summary,
            )

        # 5. File-level entry (ensures path / role queries always surface the file)
        _score_candidate(
            path=rel_path,
            line=1,
            kind="file",
            name=Path(rel_path).name,
            signature=f"{rel_path} ({entry.get('lines', 0)} lines)",
            imported_by=imp_by,
            summary=summary,
            extra_text=props_blob,
        )

    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)

    # Deduplicate (path, line, name) while keeping the highest-ranked match
    matches: list[dict[str, Any]] = []
    seen_keys: set[tuple[str, int, str]] = set()
    max_results = max(1, int(limit))
    for _, _, match in candidates:
        dedup_key = (match["path"], match["line"], match["name"])
        if dedup_key in seen_keys:
            continue
        seen_keys.add(dedup_key)
        matches.append(match)
        if len(matches) >= max_results:
            break

    return {
        "query": query,
        "matches": matches,
    }


def _build_arg_parser() -> argparse.ArgumentParser:
    def _add_common(p: argparse.ArgumentParser, is_root: bool = False) -> None:
        default_none: Any = None if is_root else argparse.SUPPRESS
        default_false: Any = False if is_root else argparse.SUPPRESS
        p.add_argument(
            "--hub-dir",
            default=default_none,
            help="Override hub directory (default: SPLITBOX_HUB_DIR or <workspace>/.agents/hub)",
        )
        p.add_argument(
            "--workspace-root",
            default=default_none,
            help="Override workspace root directory",
        )
        p.add_argument(
            "--json",
            dest="as_json",
            action="store_true",
            default=default_false,
            help="Emit machine-readable JSON output",
        )

    parser = argparse.ArgumentParser(
        prog="codebase_indexer.py",
        description="SplitBox O(1) Codebase Context Indexer & CODEBASE_MAP.md Generator",
    )
    _add_common(parser, is_root=True)
    subparsers = parser.add_subparsers(dest="command", required=True)

    p_build = subparsers.add_parser("build", help="Scan workspace and write codebase_index.json + CODEBASE_MAP.md")
    _add_common(p_build)

    p_update = subparsers.add_parser("update", help="Incrementally update a single created/edited/deleted file")
    p_update.add_argument("file_path", help="Path to the modified or deleted file")
    _add_common(p_update)

    p_query = subparsers.add_parser("query", help="Search indexed symbols, props, CSS tokens, and spec headings")
    p_query.add_argument("search_terms", nargs="+", help="Search terms (e.g. 'DropContext', 'SliceMeter', '--sb-bg')")
    p_query.add_argument("--limit", type=int, default=8, help="Max results to return (default: 8)")
    _add_common(p_query)

    return parser


def _normalize_cli_argv(argv: list[str]) -> list[str]:
    """Allows CSS token queries like `query --sb-bg --limit 4` without requiring `--`."""
    if "query" not in argv or "--" in argv:
        return argv
    q_idx = argv.index("query")
    prefix = argv[: q_idx + 1]
    rest = argv[q_idx + 1 :]
    flags_out: list[str] = []
    terms_out: list[str] = []
    i = 0
    value_flags = {"--hub-dir", "--workspace-root", "--limit"}
    bool_flags = {"--json", "-h", "--help"}
    while i < len(rest):
        arg = rest[i]
        if arg in bool_flags:
            flags_out.append(arg)
            i += 1
        elif arg in value_flags and i + 1 < len(rest):
            flags_out.extend([arg, rest[i + 1]])
            i += 2
        elif any(arg.startswith(f"{vf}=") for vf in value_flags):
            flags_out.append(arg)
            i += 1
        else:
            terms_out.append(arg)
            i += 1
    if terms_out and any(t.startswith("-") for t in terms_out):
        return [*prefix, *flags_out, "--", *terms_out]
    return argv


def main(argv: list[str] | None = None) -> int:
    raw_argv = list(sys.argv[1:] if argv is None else argv)
    parser = _build_arg_parser()
    args = parser.parse_args(_normalize_cli_argv(raw_argv))

    hub_arg = getattr(args, "hub_dir", None)
    ws_arg = getattr(args, "workspace_root", None)
    as_json = bool(getattr(args, "as_json", False))

    if args.command == "build":
        idx = build_index(workspace_root=ws_arg, hub_dir=hub_arg)
        h_dir = resolve_hub_dir(hub_arg, idx.get("workspace_root"))
        stats = idx.get("stats", {})
        payload = {
            "ok": True,
            "command": "build",
            "hub_dir": str(h_dir),
            "index_path": str(h_dir / "codebase_index.json"),
            "map_path": str(h_dir / "CODEBASE_MAP.md"),
            "stats": stats,
        }
        if as_json:
            sys.stdout.write(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
        else:
            sys.stdout.write(
                f"Built codebase index in {stats.get('build_ms', 0)}ms: "
                f"{stats.get('indexed_files', 0)} files ({stats.get('exported_symbols', 0)} symbols, "
                f"{stats.get('css_tokens', 0)} CSS tokens) -> {h_dir / 'CODEBASE_MAP.md'} "
                f"({stats.get('map_lines', 0)} lines).\n"
            )
        return 0

    if args.command == "update":
        t0 = time.perf_counter()
        idx = update_single_file(args.file_path, workspace_root=ws_arg, hub_dir=hub_arg)
        elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
        h_dir = resolve_hub_dir(hub_arg, idx.get("workspace_root"))
        stats = idx.get("stats", {})
        payload = {
            "ok": True,
            "command": "update",
            "file_path": str(args.file_path),
            "elapsed_ms": elapsed_ms,
            "hub_dir": str(h_dir),
            "stats": stats,
        }
        if as_json:
            sys.stdout.write(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
        else:
            sys.stdout.write(
                f"Updated index for `{args.file_path}` in {elapsed_ms}ms "
                f"({stats.get('indexed_files', 0)} files, map={stats.get('map_lines', 0)} lines).\n"
            )
        return 0

    if args.command == "query":
        query_str = " ".join(args.search_terms).strip()
        res = query_index(query_str, workspace_root=ws_arg, hub_dir=hub_arg, limit=args.limit)
        if as_json:
            sys.stdout.write(json.dumps(res, indent=2, ensure_ascii=False) + "\n")
        else:
            matches = res.get("matches") or []
            if not matches:
                sys.stdout.write(f"No matches for {query_str!r}.\n")
            else:
                for i, m in enumerate(matches, 1):
                    imp = m.get("imported_by") or []
                    imp_note = f" [imported_by: {', '.join(imp[:3])}]" if imp else ""
                    sys.stdout.write(
                        f"[{i}] {m['path']}#L{m['line']} ({m['kind']}) {m['name']} — {m['signature']}{imp_note}\n"
                    )
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())
