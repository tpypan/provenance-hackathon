from dataclasses import dataclass, field
from typing import Any

from backend.core.canonical import recompute_hash
from backend.core.parsing import ParsedRequest, get_parents


@dataclass
class ChainContext:
    product_id: str
    attestations: dict[str, dict[str, Any]]
    raw_attestations: list[dict[str, Any]]
    order: list[str]
    duplicate_ids: set[str]
    children: dict[str, list[tuple[str, dict[str, Any]]]] = field(default_factory=dict)
    content_hashes: dict[str, str | None] = field(default_factory=dict)
    cycle_nodes: set[str] = field(default_factory=set)
    model: object | None = None
    registry: object | None = None


def _detect_cycles(attestations: dict[str, dict[str, Any]]) -> set[str]:
    """Iterative DFS with white/grey/black colouring; returns every node on a cycle.

    Equivalent to the recursive three-colour DFS but uses an explicit stack so deep chains
    (submitted in any order) cannot overflow Python's recursion limit. `path` mirrors the
    recursion stack: a grey parent is a back-edge, and the cycle is the path slice from it.
    """
    white, grey, black = 0, 1, 2
    color = {aid: white for aid in attestations}
    cycle_nodes: set[str] = set()

    for root in attestations:
        if color[root] != white:
            continue
        color[root] = grey
        path: list[str] = [root]
        stack: list[tuple[str, Any]] = [(root, iter(get_parents(attestations[root])))]
        while stack:
            aid, parents = stack[-1]
            descended = False
            for pref in parents:
                pid = pref.get("attestation_id")
                if pid not in attestations:
                    continue
                if color[pid] == grey:
                    cycle_nodes.update(path[path.index(pid) :])
                elif color[pid] == white:
                    color[pid] = grey
                    path.append(pid)
                    stack.append((pid, iter(get_parents(attestations[pid]))))
                    descended = True
                    break
            if not descended:
                color[aid] = black
                stack.pop()
                path.pop()
    return cycle_nodes


def build_context(
    parsed: ParsedRequest,
    model: object | None = None,
    registry: object | None = None,
) -> ChainContext:
    children: dict[str, list[tuple[str, dict[str, Any]]]] = {}
    content_hashes: dict[str, str | None] = {}
    for aid, att in parsed.attestations.items():
        try:
            content_hashes[aid] = recompute_hash(att)
        except Exception:
            content_hashes[aid] = None
        for pref in get_parents(att):
            pid = pref.get("attestation_id")
            if pid is not None:
                children.setdefault(str(pid), []).append((aid, pref))
    return ChainContext(
        product_id=parsed.product_attestation_id,
        attestations=parsed.attestations,
        raw_attestations=parsed.raw_attestations,
        order=parsed.order,
        duplicate_ids=parsed.duplicate_ids,
        children=children,
        content_hashes=content_hashes,
        cycle_nodes=_detect_cycles(parsed.attestations),
        model=model,
        registry=registry,
    )
