# Statistical Anomaly Detection — Optimization Log

How the `t4_*` statistical detectors were tuned to maximise the **overall harness score**,
the methods that were tried, what was kept vs rejected, and why. This is the honest record:
every decision here is validated against **held-out generalization**, not the in-sample
self-test number.

## Goal and rules of engagement

- **Maximise the overall held-out score.** The harness grades on a held-out set "in the same
  format, a bit harder" (see `FAQ.md`). The training corpus is a *proxy*, not the target.
- **No fudging.** No memorising `attestation_id`s, no per-case thresholds, no tuning to the
  specific self-test cases. Every detector is a smooth statistical model of *genuine* supply
  chains.
- **No self-test answer key in the decision.** The `labels` field (attack type /
  `t4_perturbed`) is used only to separate genuine attestations from attacks when estimating
  the genuine distribution — the challenge's intended use of the labelled corpus. It is never
  used to train a classifier or pick which attestation to flag.
- **Generalization is measured, not assumed.** Threshold and design choices are selected by
  5-fold cross-validation on the genuine distribution (`scripts/cross_validate.py`), because
  the in-sample self-test systematically *hides* false-positive risk.

## What actually moves the overall score

Per-case scoring (`self_test.py`):

- **`t4_*` cases:** F1 over the perturbed `attestation_id`s only. Over-flagging hurts.
- **all other cases:** `0.30·pct + 0.35·anomaly_F1 + 0.20·designation + 0.15·classification`.

The deterministic categories (signatures, hash links, mass balance, structural, invariants)
are already at 100% and are out of scope here. The only headroom is the four statistical
categories: `t4_cost_outlier`, `t4_labour_outlier`, `t4_origin_outlier`, `t4_timing_outlier`.
**70.5 % of chains are clean**, so a false positive anywhere is expensive (a clean chain
drops from 1.0 to 0.65).

## The central lesson: in-sample ≠ held-out

The single most important finding. An early design used a **per-product (action,
output.name) max-ceiling**: flag a value above the genuine maximum for that product type
(plus a small margin). In-sample it looked flawless — **zero** false positives, overall
98.4 %.

5-fold cross-validation told a very different story:

| design | in-sample | **5-fold CV (held-out proxy)** | t4_cost | clean FPs |
|---|---|---|---|---|
| per-product max-ceiling | 98.4 % | **97.1 %** | 53 % | **36** |
| per-action robust z-score | 98.7 % | **98.8 %** | 82 % | 4 |

The max is a high-variance order statistic: on unseen data, genuine attestations routinely
exceed the training maximum, so the "zero FP" was an illusion. A per-**action** robust
z-score (median / MAD) is a *stable* statistic — its centre and spread barely move across
resamples — so it generalizes. This is why the final detector conditions on `action_type`,
not on the finer `(action, output.name)`.

## Methods tried

| # | Method | Result | Verdict |
|---|---|---|---|
| 1 | Per-**action** robust z-score (median/MAD) on implied rate & hours | CV 98.8 %, stable | **KEPT** |
| 2 | "High-rate / low-hours" joint cost rule (`rate_z > 2.8 AND hours_z < −0.5`) | catches borderline cost outliers; combination absent from genuine chains | **KEPT** |
| 3 | **CA-only** origin novelty (flag novel CA origin for suppliers with foreign history) | removed ~15 CV false positives vs flagging *any* novel country; no recall loss | **KEPT** |
| 4 | CV-based threshold selection (round values: `z_rate=3.0`, `z_hours=3.0`, `z_joint=2.8`) | smooth optimum, not knife-edge | **KEPT** |
| 4a | Conservative action-specific labour threshold (`subassembly: hours_z > 2.6`) | improves t4 labour recall 75.0 % → 78.6 % in CV with one additional clean false positive | **KEPT** |
| 5 | Per-product `(action, output.name)` conditioning | CV worse for cost (98.3 % vs 98.8 %); finer groups noisier | rejected |
| 6 | Per-product **max-ceiling** + margin | brittle; 36 CV false positives | rejected |
| 7 | Per-**supplier** (or supplier×product) conditioning | sampling artifact — per-supplier hours medians cluster tightly (gimbal: 9.7–14.8 around global 12.2); tight per-supplier maxima are undersampling, not real supplier effects | rejected |
| 8 | Joint `(hours, rate)` correlation / 2-D outlier model | genuine `corr(hours, rate) ≈ 0` for every product → no extra signal | rejected |
| 9 | Anchor-registry cross-check for t4 chains | the `t4_*` chains are **entirely unanchored** (0/124 perturbed atts anchored) | rejected |
| 10 | Hours normalised by `output.quantity_produced` | genuine spans the same range at `qty=1`; no separation | rejected |
| 11 | Numeric / decimal-precision fingerprint of perturbed costs | genuine and perturbed have the same precision profile | rejected |
| 12 | Country-conditioned labour rate | rates are identical across countries (±2 %) | rejected |
| 13 | Supervised classifier (IsolationForest + LogisticRegression on `t4_perturbed` labels) | uses the answer key (against the rules) **and** is vestigial — disabling it changes the score by 0.0 %; the rule-based detectors already fire first | rejected |

Detail on #13: a sibling branch trained a `LogisticRegression` on the `t4_perturbed` labels.
This was investigated directly — with the ML models disabled the score was **identical**
(the hard rules always fire first). The genuine cost-recall gain on that branch came entirely
from the label-free rules (#1, #2), which were adopted here; the label-trained model was
dropped as both non-compliant and useless. Its hard-coded timestamp hours (`{9, 14}`) were
also dropped in favour of a learned time-of-day whitelist (more robust to held-out variation).

## The information-theoretic ceiling

A fixed fraction of perturbations are drawn **inside** the genuine distribution for their
product type, on every feature derivable from a single attestation. These are unseparable
from genuine data — flagging them necessarily flags genuine attestations (false positives),
which lowers the overall score. Concrete examples:

- **cost:** a flight-controller perturbed to rate 97.35, where genuine flight controllers
  from the same supplier run 92.5 and 98.3 — the perturbation sits *between* two real values.
- **labour:** an EO/IR gimbal at 22.7 h, where genuine gimbals reach 23.7 h.
- **origin:** `sup-0009 → CA`, where CA is that supplier's genuine home 94.8 % of the time.

So the legitimate ceilings are roughly **cost ≈ 82 %, labour ≈ 79 %, origin ≈ 97 %** with
the current conservative thresholding. Pushing past them requires either memorising IDs
(fails on held-out) or sub-genuine thresholds whose false positives cost more than they gain.
Both are out of bounds.

## Final detector

For each transformation attestation (`hours > 0`), using the per-`action_type` genuine
distribution (median / MAD), with `rate = labour_cost / labour_hours`:

- **cost_anomaly** if `rate_z > 3.0` **or** (`rate_z > 2.8` **and** `hours_z < −0.5`).
- **labour_anomaly** if `hours_z > 3.0`, except `subassembly` uses the conservative
  action-specific threshold `hours_z > 2.6`.
- **origin_anomaly** if `performed_in_country == CA` and the supplier has ≥ 20 prior
  appearances, none in CA.
- **timing_anomaly** if the time-of-day is outside the learned per-action whitelist.

Thresholds live in `backend/model/baseline_stats.json` (`thresholds`), fit by
`scripts/fit_model.py`. The model is fit on genuine attestations only (attacks excluded via
labels — distribution cleaning, not answer-key training).

## Results

Verified with the real Docker pipeline (`python3 self_test.py http://localhost:8000/verify`)
and `scripts/cross_validate.py`:

| | overall | t4_cost | t4_labour | t4_origin | t4_timing | clean | deterministic |
|---|---|---|---|---|---|---|---|
| start | 98.0 % | 35.3 | 73.8 | 96.5 | 100 | 100 | 100 |
| **final (in-sample)** | **98.8 %** | **82.4** | **78.6** | **97.4** | 100 | 99.7 | 100 |
| **final (5-fold CV)** | **98.8 %** | 82.4 | 78.6 | 97.4 | 100 | 99.8 | 100 |

The final design accepts ~5 clean false positives (0.7 %) in exchange for cost recall
53 % → 82 % and labour recall 75 % → 78.6 %; cross-validation confirms the change preserves
the held-out proxy score while improving the remaining statistical category. The in-sample /
CV gap remains ~0, i.e. the model generalizes.

## Reproduce

```bash
python3 scripts/fit_model.py                       # refit the genuine-distribution model
python3 scripts/cross_validate.py                  # 5-fold held-out estimate (the real test)
docker compose up -d --build
python3 self_test.py http://localhost:8000/verify  # in-sample category breakdown
```
