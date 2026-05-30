"""Seed the attestation store from the training corpus and build a lookup index.

The default backend (``SEED=none``) keeps the store empty so ``/verify`` stays
stateless and the grading harness is unaffected. Setting ``SEED=corpus`` loads every
chain in ``training_corpus.jsonl`` into the store so the ``/api/*`` browse routes can
serve real provenance graphs, and builds a resolve index that maps both attestation
ids and content hashes to their owning product so a purchaser can look a chain up by
either (typed or scanned from a QR code).
"""

from __future__ import annotations

import json
from typing import Any

from backend.core.canonical import content_hash
from backend.store.base import AttestationStore

SEED_CORPUS_VALUES = {"corpus", "training_corpus", "all"}


def _iter_chains(path: str):
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            chain = record.get("chain") or {}
            attestations = chain.get("attestations") or []
            product_id = chain.get("product_attestation_id")
            if product_id and attestations:
                yield str(product_id), attestations


def seed_from_corpus(store: AttestationStore, path: str) -> int:
    """Load every attestation from the corpus into ``store``. Returns the count."""
    count = 0
    for _product_id, attestations in _iter_chains(path):
        for att in attestations:
            store.put(att)
            count += 1
    return count


def build_resolve_index(path: str) -> dict[str, str]:
    """Map attestation_id -> product_id and content_hash -> product_id.

    Indexing every attestation's hash (not just the leaf) means scanning or pasting any
    node's fingerprint resolves to its product; a product leaf's id/hash maps to itself.
    """
    index: dict[str, str] = {}
    for product_id, attestations in _iter_chains(path):
        for att in attestations:
            aid = att.get("attestation_id")
            if aid:
                index[str(aid)] = product_id
            try:
                index[content_hash(att).lower()] = product_id
            except Exception:
                # A malformed/attacked attestation that can't be canonicalized is still
                # reachable by id; skip its hash entry rather than abort seeding.
                pass
    return index


def resolve(index: dict[str, str], query: str) -> str | None:
    """Resolve a free-text query (attestation id or content hash) to a product id."""
    q = str(query or "").strip()
    if not q:
        return None
    return index.get(q) or index.get(q.lower())


def seed_state(store: AttestationStore, path: str) -> dict[str, Any]:
    """Seed the store and return derived state to cache on the app (resolve index)."""
    seed_from_corpus(store, path)
    return {"resolve_index": build_resolve_index(path)}
