from backend.core.dag import ChainContext
from backend.core.parsing import get_parents
from backend.detectors.base import Anomaly
from backend.registry import Registry


def detect_hashlink(ctx: ChainContext) -> list[Anomaly]:
    out: list[Anomaly] = []
    for aid, att in ctx.attestations.items():
        for pref in get_parents(att):
            pid = pref.get("attestation_id")
            claimed = pref.get("content_hash")
            if pid in ctx.attestations and claimed is not None:
                actual = ctx.content_hashes.get(str(pid))
                if actual is not None and claimed != actual:
                    out.append(
                        Anomaly(
                            "parent_hash_mismatch",
                            aid,
                            "hard",
                            f"parent {pid} content hash mismatch",
                        )
                    )

    registry = ctx.registry
    if not isinstance(registry, Registry):
        return out

    # The product under verification is identified by the leaf attestation id. Every anchored
    # attestation in a genuine chain belongs to that product; one anchored to a different
    # product is cross-product reuse — true even when the leaf itself is unanchored (a new
    # product splicing in a genuine attestation from another product's chain).
    expected_product = ctx.product_id or None
    for aid in ctx.attestations:
        anchor = registry.anchor(aid)
        if anchor is None:
            continue
        actual = ctx.content_hashes.get(aid)
        if actual is not None and actual != anchor["content_hash"]:
            out.append(Anomaly("anchor_mismatch", aid, "hard", "content differs from anchored record"))
        if expected_product is not None and anchor["product_id"] != expected_product:
            out.append(
                Anomaly(
                    "replay_cross_chain",
                    aid,
                    "hard",
                    f"anchored to product {anchor['product_id']}, not {expected_product}",
                )
            )
    return out
