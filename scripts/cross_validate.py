"""5-fold cross-validation of the verifier against the training corpus.

The in-sample self-test systematically *hides* false-positive risk: the statistical model is
fit on the same attestations it is then scored against, so genuine values never exceed their
own learned bounds. This script is the honest held-out estimate — it refits the genuine
distribution on 4/5 of the chains and scores the held-out 1/5, repeated over all folds, using
the harness's exact per-case formula (`self_test.score_case`).

Use this, not the in-sample number, to judge whether a detector change actually generalizes.
See `docs/statistical-detection-optimization.md`.

    python3 scripts/cross_validate.py
"""

import json
import os
import random
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from backend.model.baseline import Baseline  # noqa: E402
from backend.registry import load_registry  # noqa: E402
from backend.verify import verify_chain  # noqa: E402
from scripts.fit_model import bad_ids, build_model  # noqa: E402
from self_test import score_case  # noqa: E402

N_FOLDS = 5
SEED = 42


def main() -> None:
    registry = load_registry()
    with open(os.path.join(ROOT, "training_corpus.jsonl")) as f:
        rows = [json.loads(line) for line in f]

    order = list(range(len(rows)))
    random.Random(SEED).shuffle(order)
    folds = [order[i::N_FOLDS] for i in range(N_FOLDS)]

    agg: dict[str, list[float]] = defaultdict(lambda: [0.0, 0])
    total = 0.0
    clean_fp = 0
    for fold in folds:
        val = set(fold)
        train_chains = [(rows[i]["chain"], bad_ids(rows[i]["labels"]))
                        for i in order if i not in val]
        model = Baseline(**build_model(train_chains))  # type: ignore[arg-type]
        for i in fold:
            row = rows[i]
            labels = row["labels"]
            kind = labels.get("attack", "clean")
            resp = verify_chain(row["chain"], model, registry)
            score = score_case(kind, labels, labels.get("t4_perturbed", []), resp)
            total += score
            agg[kind][0] += score
            agg[kind][1] += 1
            if kind == "clean" and resp["anomalies"]:
                clean_fp += 1

    print(f"\n{N_FOLDS}-fold CV overall: {total / len(rows) * 100:.1f}%  ({len(rows)} cases)\n")
    print(f"{'category':28s}  avg     n")
    for kind in sorted(agg):
        score_sum, count = agg[kind]
        print(f"{kind:28s}  {score_sum / count * 100:5.1f}  {count:4d}")
    print(f"\nclean chains falsely flagged: {clean_fp}/{agg['clean'][1]}")


if __name__ == "__main__":
    main()
