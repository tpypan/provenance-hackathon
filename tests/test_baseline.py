from backend.model.baseline import load_baseline

M = load_baseline()


def test_rate_z_extreme_for_thousand_per_hour() -> None:
    # An extreme labour rate is many robust-sigma above the genuine mean for any action.
    assert M.rate_z("component_manufacture", None, 1000.0) > M.thresholds["z_rate"]


def test_rate_z_low_for_normal() -> None:
    # A typical component_manufacture rate sits well inside the genuine distribution.
    assert abs(M.rate_z("component_manufacture", None, 65.0)) < 1.0


def test_ca_origin_novel_false_for_canadian_supplier() -> None:
    # A supplier whose dominant country is CA has not got a novel CA origin.
    ca_supplier = next(
        (s for s, c in M.supplier_country.items() if c.get("CA", 0) > 0),
        None,
    )
    assert ca_supplier is not None
    assert M.ca_origin_novel(ca_supplier) is False


def test_ca_origin_novel_true_for_foreign_supplier() -> None:
    # A supplier with substantial history but never seen in CA -> novel CA origin.
    foreign = next(
        (s for s, c in M.supplier_country.items()
         if sum(c.values()) >= 20 and c.get("CA", 0) == 0),
        None,
    )
    if foreign is not None:
        assert M.ca_origin_novel(foreign) is True


def test_valid_time_whitelist() -> None:
    assert M.is_valid_time("raw_material_supply", "09:00:00Z") is True
    assert M.is_valid_time("final_integration", "04:03:21Z") is False
