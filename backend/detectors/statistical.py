from backend.core.computation import TRANSFORM_ACTIONS
from backend.core.dag import ChainContext
from backend.core.parsing import get_costs, get_output
from backend.detectors.base import Anomaly
from backend.model.baseline import Baseline


def detect_statistical(ctx: ChainContext) -> list[Anomaly]:
    """Flag attestations whose values are anomalous relative to the genuine distribution
    learned from clean chains, conditioned on action_type.

    - cost: the implied labour rate (cost / hours) is many robust-σ above normal, OR it is
      moderately elevated while the hours are below average — inflating cost on a short job
      to spike the rate while keeping the (separately-watched) hours unremarkable. That
      high-rate / low-hours combination does not occur in genuine chains.
    - labour: labour_hours is many robust-σ above normal for the action.
    - origin: a CA origin that is novel for a supplier with substantial foreign history
      (Canadian-content inflation).

    Thresholds are robust z-scores (median / MAD), chosen by cross-validation to maximise
    the expected held-out score, not the in-sample score. In-distribution perturbations
    (values overlapping genuine data) are deliberately left uncaught."""
    out: list[Anomaly] = []
    model = ctx.model
    if not isinstance(model, Baseline):
        return out
    th = model.thresholds
    z_rate = th.get("z_rate", 3.0)
    z_hours = th.get("z_hours", 3.0)
    z_joint = th.get("z_joint", 2.8)

    for aid, att in ctx.attestations.items():
        action = att.get("action_type")
        name = get_output(att).get("name")
        _material, hours, labour = get_costs(att)

        if action in TRANSFORM_ACTIONS and hours > 0:
            rate = labour / hours
            rate_z = model.rate_z(action, name, rate)
            hours_z = model.hours_z(action, name, hours)
            if rate_z > z_rate or (rate_z > z_joint and hours_z < -0.5):
                out.append(Anomaly("cost_anomaly", aid, "soft", f"labour rate {rate:.0f}/h (z={rate_z:+.1f})"))
            if hours_z > z_hours:
                out.append(Anomaly("labour_anomaly", aid, "soft", f"labour {hours}h (z={hours_z:+.1f})"))

        supplier = att.get("supplier_id")
        if att.get("performed_in_country") == "CA" and supplier and model.ca_origin_novel(str(supplier)):
            out.append(Anomaly("origin_anomaly", aid, "soft", f"CA origin unseen for supplier {supplier}"))

        timestamp = att.get("timestamp") or ""
        time_of_day = timestamp[11:] if len(timestamp) >= 20 else ""
        if time_of_day and not model.is_valid_time(str(action), time_of_day):
            out.append(Anomaly("timing_anomaly", aid, "soft", f"time-of-day {time_of_day} unexpected"))
    return out
