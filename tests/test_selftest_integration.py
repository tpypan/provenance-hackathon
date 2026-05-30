import json
import os
from typing import Any

from backend.model.baseline import load_baseline
from backend.registry import load_registry
from backend.verify import verify_chain

ROOT = os.path.dirname(os.path.dirname(__file__))
M = load_baseline()
REG = load_registry()


def _rows(limit: int | None = None) -> list[dict[str, Any]]:
    rows = [json.loads(line) for line in open(os.path.join(ROOT, "training_corpus.jsonl"))]
    return rows[:limit] if limit else rows


def test_clean_chain_false_positive_rate_is_low() -> None:
    # The statistical detectors accept a small, deliberate false-positive rate on clean
    # chains in exchange for materially higher recall on the t4 statistical attacks (cost
    # outliers in particular). Cross-validation shows this maximizes the overall score.
    # This guards against gross over-flagging regressions, not the handful of genuine
    # high-rate attestations that overlap the attack distribution.
    fp = 0
    total = 0
    for row in _rows():
        if row["labels"].get("attack", "clean") != "clean":
            continue
        total += 1
        res = verify_chain(row["chain"], M, REG)
        if res["anomalies"]:
            fp += 1
    assert fp / total < 0.02, f"{fp}/{total} clean chains falsely flagged (> 2%)"


def test_clean_designation_and_percentage_accurate() -> None:
    bad = 0
    for row in _rows():
        if row["labels"].get("attack", "clean") != "clean":
            continue
        res = verify_chain(row["chain"], M, REG)
        labels = row["labels"]
        if res["designation"] != labels["designation"]:
            bad += 1
        elif abs(res["canadian_content_percentage"] - labels["canadian_content_percentage"]) > 0.5:
            bad += 1
    assert bad == 0, f"{bad} clean chains had wrong designation/percentage"
