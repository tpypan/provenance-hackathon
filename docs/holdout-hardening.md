# Held-out Hardening — Optimization Log (part 2)

Companion to [`statistical-detection-optimization.md`](statistical-detection-optimization.md).
That log tuned the statistical `t4_*` detectors against the **in-sample** self-test. This log
records changes that **do not move the in-sample score** but target the **held-out** set the
harness actually grades ("a bit harder, harder cases weigh more" — `FAQ.md`).

## The premise: in-sample is at its legitimate ceiling

A full component-level breakdown of the 1000-case self-test (overall **98.72 %**) shows the
entire 1.28 % loss is concentrated and unbeatable without fudging:

| loss source | overall cost | why it can't move legitimately |
|---|---|---|
| `t4_labour` recall | 0.70 % | perturbed hours (20–24 h) sit *inside* the genuine subassembly range (max 23.7 h) |
| `t4_cost` recall | 0.30 % | caught attacks and clean false-positives are **interleaved** on `rate_z` (FP 3.02–3.47; attacks 2.86–4.18) — no separating threshold |
| 5 clean false-positives | 0.18 % | genuine naturally-high-rate attestations, statistically identical to attacks |
| `t4_origin` recall | 0.10 % | in-distribution CA origins (supplier's genuine home) |
| **pct / designation / classification / all deterministic** | **0.00 %** | **already perfect in-sample** |

These were re-verified independently (not taken on faith from part 1): the missed labour
cases, the cost FP/attack `rate_z` interleaving, and the per-component zero-loss on
pct/designation. **Conclusion: the self-test number cannot rise without sub-genuine
thresholds (net-negative false positives) or attestation-id memorisation (fails on held-out)
— both fudging.** The only honest headroom is making the 98.72 % *hold* on a harder held-out
set, and catching what the in-sample corpus never exercised.

## A. Anchor-pathway correctness (`backend/detectors/hashlink.py`)

**Finding.** The anchor registry ships **3 147 anchored attestations across 120 products**, yet
**0 of the 25 433 corpus attestations are anchored**. The anchor-based detectors
(`anchor_mismatch`, `replay_cross_chain`) therefore never fire in self-test — completely
untested in-sample — while `spec/anchor-registry.md` is explicit that the held-out set *does*
use them ("Some cases are anchored — the registry is the discriminator").

**Bug.** `replay_cross_chain` derived the expected product from the **leaf's** anchor
(`expected_product = registry.anchor(ctx.product_id).product_id`). When the leaf is a *new,
unanchored* product, that is `None`, so the check was skipped — a genuine anchored component
spliced into a new product's chain (textbook cross-product replay) was **missed**.

**Fix.** Compare each anchored attestation's `product_id` against `ctx.product_id` directly
(the leaf attestation id *is* the product identifier; the registry's 120 product_ids are all
leaf attestation ids). Equivalent to the old logic when the leaf is anchored, strictly more
correct when it isn't. Cannot false-positive on a clean unanchored chain (no anchored atts →
no firing). Zero in-sample change (0 anchored corpus atts), by construction.

Tests: `tests/test_hashlink.py::test_replay_cross_chain_flagged_when_leaf_unanchored`
(the bug), `…_when_leaf_anchored` (regression guard), `…_clean_anchored_chain_has_no_anchor_anomalies`
(over-fire guard).

## B. Robustness hardening (`backend/core/dag.py`, `backend/verify.py`)

**B1 — Iterative cycle detection.** `_detect_cycles` was a recursive DFS. It survived in-sample
only because corpus chains arrive parent-first (max depth 6); a deep chain submitted in another
order — and `FAQ.md` guarantees "sometimes a child appears before its parent" — overflowed
Python's 1000-frame limit, raising `RecursionError` that the broad `try/except` swallowed into
the `pct=0, designation=none` fallback (a near-zero case score). Rewrote it as an explicit-stack
three-colour DFS producing **identical** `cycle_nodes` output (all `test_structural.py` cycle
tests, including the inverted-edge attribution, stay green). Now order- and depth-independent.

**B2 — Independent stages in `verify_chain`.** The old single `try/except` was all-or-nothing:
any failure erased pct **and** designation **and** all detected anomalies. Split into three
independent stages — build (the only unrecoverable one → fallback), `compute()`, and
detection — so a failure in one never zeroes the others. A held-out chain whose percentage
computation hits an unforeseen field still reports its integrity violations, and vice-versa.

Tests: `tests/test_verify.py::test_deep_reverse_ordered_chain_computes_percentage`,
`…_compute_failure_still_returns_detected_anomalies`.

## Results

| | overall self-test | full test suite | held-out exposure addressed |
|---|---|---|---|
| before | 98.72 % | 68 passed | — |
| after A + B | **98.72 %** (identical, every category unchanged) | **73 passed** | anchored cases; deep/any-order chains; partial-failure isolation |

The in-sample number is unchanged **by design** — these are held-out bets, unmeasurable
locally. They are safe: none can lower the score (A never fires on unanchored chains; B only
adds robustness). Verified in-process via `verify_chain` (the exact function the `/verify`
app calls) against the full corpus, plus the unit suite.

## Reproduce

```bash
python3 -m pytest -q                               # 73 passed
python3 self_test.py http://localhost:8000/verify  # 98.72 %, unchanged breakdown
```
