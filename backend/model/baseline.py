import json
from dataclasses import dataclass
from typing import Any

from backend import config

Stats = dict[str, float]  # {"median","mad","max","n"}


@dataclass
class Baseline:
    # action -> {"rate": Stats, "hours": Stats}
    action_stats: dict[str, dict[str, Stats]]
    # action -> output.name -> {"rate": Stats, "hours": Stats}
    action_name_stats: dict[str, dict[str, dict[str, Stats]]]
    supplier_country: dict[str, dict[str, int]]
    timing_whitelist: dict[str, list[str]]
    thresholds: dict[str, Any]

    def _group(self, action: str | None, name: str | None, kind: str) -> Stats | None:
        """Reference distribution for (action, product, kind).

        Conditioning on action_type generalizes more reliably than on the finer
        (action, output.name): the per-action labour-rate / hours distributions are
        estimated from far more samples, so their centre and spread are stable across
        resamples (validated by cross-validation). Product-level conditioning is used
        only when explicitly enabled and the product group is large enough."""
        if self.thresholds.get("conditioning") == "product":
            by_name = self.action_name_stats.get(str(action), {})
            group = by_name.get(str(name))
            if group and group.get(kind, {}).get("n", 0) >= self.thresholds.get("min_group_n", 40):
                return group[kind]
        fallback = self.action_stats.get(str(action))
        return fallback[kind] if fallback else None

    def _z(self, action: str | None, name: str | None, kind: str, value: float) -> float:
        stats = self._group(action, name, kind)
        if not stats:
            return 0.0
        return (value - stats["median"]) / (1.4826 * (stats["mad"] or 1e-9))

    def rate_z(self, action: str | None, name: str | None, rate: float) -> float:
        return self._z(action, name, "rate", rate)

    def hours_z(self, action: str | None, name: str | None, hours: float) -> float:
        return self._z(action, name, "hours", hours)

    def ca_origin_novel(self, supplier: str | None) -> bool:
        """True if a CA origin is novel for this supplier: it has enough history and was
        never seen working in CA. Only CA novelty matters — claiming Canadian work for a
        supplier that operates abroad is how Canadian content gets inflated. Flagging novel
        *foreign* countries would false-positive on suppliers legitimately expanding."""
        counts = self.supplier_country.get(str(supplier))
        if not counts:
            return False
        total = sum(counts.values())
        return total >= self.thresholds.get("origin_min_total", 20) and counts.get("CA", 0) == 0

    def is_valid_time(self, action: str | None, time_of_day: str) -> bool:
        whitelist = self.timing_whitelist.get(str(action))
        if not whitelist:
            return True
        return time_of_day in whitelist


def load_baseline() -> Baseline:
    with open(config.MODEL_PATH) as f:
        data: dict[str, Any] = json.load(f)
    return Baseline(
        action_stats=data["action_stats"],
        action_name_stats=data["action_name_stats"],
        supplier_country=data["supplier_country"],
        timing_whitelist=data["timing_whitelist"],
        thresholds=data["thresholds"],
    )
