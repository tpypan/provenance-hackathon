"""Fit statistical-detector baseline parameters from the genuine attestation distribution.

The detector flags an attestation when its implied labour rate (labour_cost / labour_hours)
or its labour hours are many robust-σ above normal *for its action_type*. Conditioning on
action_type (rather than the finer action+product) is a deliberate choice: the per-action
distributions are estimated from far more samples, so their centre (median) and spread (MAD)
are stable across resamples and generalize to held-out data. Cross-validation
(`scripts/cross_validate.py`) confirms per-action z-scores beat a per-product max-ceiling,
which is brittle (the max is a high-variance order statistic that held-out genuine data
exceeds). See `docs/statistical-detection-optimization.md`.

The model is fit on *genuine* attestations only — attacks are excluded via the labels. This
is distribution cleaning (the intended use of the labelled corpus), not answer-key training:
no classifier is fit on the labels and no attestation id is memorised.
"""

import json
import os
import statistics
from collections import defaultdict
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORPUS = os.path.join(ROOT, "training_corpus.jsonl")
OUT = os.path.join(ROOT, "backend", "model", "baseline_stats.json")
TRANSFORMS = {"component_manufacture", "subassembly", "final_integration"}

THRESHOLDS = {
    "conditioning": "action",
    "min_group_n": 40,
    "z_rate": 3.0,
    "z_hours": 3.0,
    "z_joint": 2.8,
    "origin_min_total": 20,
}


def mad(values: list[float], median: float) -> float:
    return statistics.median([abs(value - median) for value in values]) or 1e-9


def _costs(att: dict[str, Any]) -> tuple[float, float]:
    costs = att.get("costs") or {}
    return float(costs.get("labour_hours") or 0), float(costs.get("labour_cost_cad") or 0)


def _stats(values: list[float]) -> dict[str, float]:
    median = statistics.median(values)
    return {"median": median, "mad": mad(values, median), "max": max(values), "n": len(values)}


def bad_ids(labels: dict[str, Any]) -> set[str]:
    """Attestation ids that are NOT genuine in this row (perturbed or otherwise attacked).

    Excluding these keeps the fitted distribution a model of *genuine* attestations only,
    drawn from every chain (clean and attacked alike), not just the clean chains."""
    bad: set[str] = set(labels.get("t4_perturbed", []) or [])
    for anomaly in labels.get("anomalies", []) or []:
        aid = anomaly.get("attestation_id")
        if aid:
            bad.add(str(aid))
    return bad


def build_model(chains: list[tuple[dict[str, Any], set[str]]]) -> dict[str, Any]:
    """Build the baseline model dict from (chain, ids-to-skip) pairs.

    Shared by `main()` (full corpus) and `cross_validate.py` (per-fold training split)."""
    rate_by_action: dict[str, list[float]] = {a: [] for a in TRANSFORMS}
    hours_by_action: dict[str, list[float]] = {a: [] for a in TRANSFORMS}
    rate_by_an: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    hours_by_an: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    supplier_country: dict[str, dict[str, int]] = {}
    timing: dict[str, dict[str, int]] = {}

    for chain, skip in chains:
        for att in chain["attestations"]:
            if att.get("attestation_id") in skip:
                continue
            action = att.get("action_type")
            labour_hours, labour_cost = _costs(att)
            if action in TRANSFORMS and labour_hours > 0:
                name = str((att.get("output") or {}).get("name"))
                rate = labour_cost / labour_hours
                rate_by_action[action].append(rate)
                hours_by_action[action].append(labour_hours)
                rate_by_an[action][name].append(rate)
                hours_by_an[action][name].append(labour_hours)

            supplier = str(att.get("supplier_id"))
            country = str(att.get("performed_in_country"))
            supplier_country.setdefault(supplier, {})
            supplier_country[supplier][country] = supplier_country[supplier].get(country, 0) + 1

            timestamp = att.get("timestamp") or ""
            time_of_day = timestamp[11:] if len(timestamp) >= 20 else ""
            timing.setdefault(str(action), {})
            timing[str(action)][time_of_day] = timing[str(action)].get(time_of_day, 0) + 1

    action_stats = {
        action: {"rate": _stats(rate_by_action[action]), "hours": _stats(hours_by_action[action])}
        for action in TRANSFORMS
        if rate_by_action[action]
    }
    action_name_stats: dict[str, dict[str, dict[str, dict[str, float]]]] = {}
    for action in TRANSFORMS:
        action_name_stats[action] = {
            name: {"rate": _stats(rate_by_an[action][name]), "hours": _stats(hours_by_an[action][name])}
            for name in rate_by_an[action]
        }

    return {
        "action_stats": action_stats,
        "action_name_stats": action_name_stats,
        "supplier_country": supplier_country,
        "timing_whitelist": {action: sorted(times) for action, times in timing.items()},
        "thresholds": dict(THRESHOLDS),
    }


def load_training_chains() -> list[tuple[dict[str, Any], set[str]]]:
    chains: list[tuple[dict[str, Any], set[str]]] = []
    with open(CORPUS) as corpus:
        for line in corpus:
            row = json.loads(line)
            chains.append((row["chain"], bad_ids(row["labels"])))
    with open(os.path.join(ROOT, "worked-example", "recovery_drone_chain.json")) as f:
        chains.append((json.load(f), set()))
    return chains


def main() -> None:
    model = build_model(load_training_chains())
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(model, f, indent=2, sort_keys=True)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
