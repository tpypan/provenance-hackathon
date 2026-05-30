from backend.core.computation import ComputationResult, compute
from backend.core.dag import build_context
from backend.core.parsing import parse_request
from backend.detectors.base import Anomaly
from backend.detectors.runner import (
    DETERMINISTIC_DETECTORS,
    STATISTICAL_DETECTORS,
    assemble_response,
    run_detectors,
)
from backend.model.baseline import Baseline
from backend.registry import Registry


def _fallback(payload: object) -> dict[str, object]:
    product_id = ""
    if isinstance(payload, dict):
        product_id = str(payload.get("product_attestation_id", "") or "")
    return {
        "product_attestation_id": product_id,
        "canadian_content_percentage": 0.0,
        "designation": "none",
        "chain_valid": False,
        "anomalies": [],
    }


def verify_chain(payload: object, model: Baseline, registry: Registry) -> dict[str, object]:
    """Pure stateless chain verification. This function returns a response for all inputs.

    The three stages — context build, percentage computation, anomaly detection — are
    independent: a failure in one must not erase the others. Only an unrecoverable
    parse/DAG-build failure produces the empty fallback, because without a context there is
    nothing to report.
    """
    if not isinstance(payload, dict):
        return _fallback(payload)
    try:
        ctx = build_context(parse_request(payload), model=model, registry=registry)
    except Exception:
        return _fallback(payload)

    try:
        comp = compute(ctx)
    except Exception:
        comp = ComputationResult(0.0, "none", "", 0.0, 0.0)

    anomalies: list[Anomaly] = []
    try:
        anomalies = run_detectors(ctx, DETERMINISTIC_DETECTORS)
        if not any(anomaly.severity == "hard" for anomaly in anomalies):
            anomalies.extend(run_detectors(ctx, STATISTICAL_DETECTORS))
    except Exception:
        pass

    return assemble_response(ctx, comp, anomalies)
