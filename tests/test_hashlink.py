from typing import Any

from backend.core.dag import build_context
from backend.core.parsing import parse_request
from backend.detectors.hashlink import detect_hashlink
from backend.registry import Registry, load_registry
from reference_lib import content_hash

REG = load_registry()


def _ctx(payload: dict[str, Any]):
    return build_context(parse_request(payload), registry=REG)


def _reg(anchors: dict[str, dict[str, str]]) -> Registry:
    """Registry with controlled anchors; keys unused by hash-link detection."""
    return Registry(public_keys={}, private_keys={}, anchors_by_id=anchors)


def _ctx_reg(payload: dict[str, Any], registry: Registry):
    return build_context(parse_request(payload), registry=registry)


def _att(aid: str, parents: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "attestation_id": aid,
        "version": "1.0",
        "supplier_id": "sup-0001",
        "timestamp": "2026-01-01T09:00:00Z",
        "action_type": "component_manufacture",
        "performed_in_country": "CA",
        "parents": parents or [],
        "output": {"name": "widget", "quantity_produced": 1, "unit": "u"},
        "costs": {"material_cad": 0, "labour_hours": 5, "labour_cost_cad": 100},
    }


def test_clean_chain_no_hashlink_flags(worked_chain: dict[str, Any]) -> None:
    assert detect_hashlink(_ctx(worked_chain)) == []


def test_parent_hash_mismatch_flags_child() -> None:
    payload = {
        "product_attestation_id": "child",
        "attestations": [
            {
                "attestation_id": "child",
                "parents": [{"attestation_id": "par", "content_hash": "deadbeef"}],
                "output": {"unit": "u"},
            },
            {
                "attestation_id": "par",
                "parents": [],
                "output": {"name": "p", "quantity_produced": 1, "unit": "u"},
                "costs": {"material_cad": 1, "labour_hours": 0, "labour_cost_cad": 0},
            },
        ],
    }
    flagged = {(a.attestation_id, a.type) for a in detect_hashlink(_ctx(payload))}
    assert ("child", "parent_hash_mismatch") in flagged


def test_anchor_mismatch_flags_node() -> None:
    anchor_id = next(iter(REG.anchors_by_id))
    payload = {
        "product_attestation_id": anchor_id,
        "attestations": [
            {
                "attestation_id": anchor_id,
                "parents": [],
                "supplier_id": "sup-0001",
                "costs": {"material_cad": 999, "labour_hours": 0, "labour_cost_cad": 0},
            },
        ],
    }
    flagged = {(a.attestation_id, a.type) for a in detect_hashlink(_ctx(payload))}
    assert (anchor_id, "anchor_mismatch") in flagged


def test_replay_cross_chain_flagged_when_leaf_unanchored() -> None:
    # comp-A genuinely belongs to product 'prod-X' (anchored). It is spliced into a NEW,
    # unanchored product chain. Cross-product reuse must be flagged even though the leaf
    # itself is not in the registry.
    comp_a = _att("comp-A")
    leaf = _att(
        "new-prod",
        [{"attestation_id": "comp-A", "content_hash": content_hash(comp_a), "quantity_consumed": 1, "unit": "u"}],
    )
    registry = _reg({"comp-A": {"content_hash": content_hash(comp_a), "product_id": "prod-X"}})
    payload = {"product_attestation_id": "new-prod", "attestations": [leaf, comp_a]}
    flagged = {(a.attestation_id, a.type) for a in detect_hashlink(_ctx_reg(payload, registry))}
    assert ("comp-A", "replay_cross_chain") in flagged


def test_replay_cross_chain_flagged_when_leaf_anchored() -> None:
    # Regression guard for the already-working path: leaf anchored to itself, but comp-B
    # belongs to a different product -> replay.
    comp_b = _att("comp-B")
    leaf = _att(
        "prodleaf",
        [{"attestation_id": "comp-B", "content_hash": content_hash(comp_b), "quantity_consumed": 1, "unit": "u"}],
    )
    registry = _reg(
        {
            "prodleaf": {"content_hash": content_hash(leaf), "product_id": "prodleaf"},
            "comp-B": {"content_hash": content_hash(comp_b), "product_id": "prod-Y"},
        }
    )
    payload = {"product_attestation_id": "prodleaf", "attestations": [leaf, comp_b]}
    flagged = {(a.attestation_id, a.type) for a in detect_hashlink(_ctx_reg(payload, registry))}
    assert ("comp-B", "replay_cross_chain") in flagged


def test_clean_anchored_chain_has_no_anchor_anomalies() -> None:
    # Every attestation is anchored to the product under verification and content matches:
    # the fix must not over-fire on a genuine anchored chain.
    comp = _att("comp-1")
    leaf = _att(
        "prodleaf",
        [{"attestation_id": "comp-1", "content_hash": content_hash(comp), "quantity_consumed": 1, "unit": "u"}],
    )
    registry = _reg(
        {
            "comp-1": {"content_hash": content_hash(comp), "product_id": "prodleaf"},
            "prodleaf": {"content_hash": content_hash(leaf), "product_id": "prodleaf"},
        }
    )
    payload = {"product_attestation_id": "prodleaf", "attestations": [leaf, comp]}
    anchor_anoms = [
        a for a in detect_hashlink(_ctx_reg(payload, registry))
        if a.type in ("anchor_mismatch", "replay_cross_chain")
    ]
    assert anchor_anoms == []
