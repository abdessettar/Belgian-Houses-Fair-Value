"""Slice the 80% band coverage gap between val and test by month, subtype,
price decile, and province. Read-only — uses the saved boosters."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

spec = importlib.util.spec_from_file_location("train_mod", ROOT / "scripts" / "02_train_model.py")
assert spec is not None and spec.loader is not None
train = importlib.util.module_from_spec(spec)
spec.loader.exec_module(train)


def empirical_coverage(y: np.ndarray, lo: np.ndarray, hi: np.ndarray) -> float:
    return float(np.mean((y >= lo) & (y <= hi)))


def widen_bin(lo: np.ndarray, hi: np.ndarray, q_hat: float):
    return np.maximum(lo - q_hat, 1.0), hi + q_hat


def slice_report(
    name: str,
    keys: pd.Series,
    y: np.ndarray,
    lo: np.ndarray,
    hi: np.ndarray,
    min_count: int = 30,
) -> None:
    print(f"\n--- {name} ---")
    print(f"{'group':<28} {'n':>5} {'coverage':>9} {'avg band (€k)':>14}")
    rows = []
    for k, mask in [(g, (keys == g).to_numpy()) for g in sorted(keys.dropna().unique(), key=str)]:
        n = int(mask.sum())
        if n < min_count:
            continue
        cov = empirical_coverage(y[mask], lo[mask], hi[mask])
        width_k = float(np.mean(hi[mask] - lo[mask]) / 1000)
        rows.append((str(k), n, cov, width_k))
    rows.sort(key=lambda r: r[2])  # worst-coverage groups first
    for k, n, cov, width in rows:
        label = (k[:26] + "..") if len(k) > 28 else k
        print(f"{label:<28} {n:>5d} {cov*100:>8.1f}% {width:>13.0f}")


def main() -> None:
    print("Loading + splitting…")
    df_raw = train.load_raw()
    df_all = train.engineer(df_raw)
    trn, val, test = train.temporal_split(df_all)
    trn, val, test, _lookup, _fallback = train.add_commune_feature(trn, val, test)

    print("\nLoading saved boosters…")
    m_q10 = lgb.Booster(model_file=str(DATA / "model_q10.txt"))
    m_q50 = lgb.Booster(model_file=str(DATA / "model_q50.txt"))
    m_q90 = lgb.Booster(model_file=str(DATA / "model_q90.txt"))

    q_hat = float(json.loads((DATA / "metrics.json").read_text())["lightgbm"]["conformal_q_hat_eur"])
    print(f"  Conformal q_hat from metrics.json: €{q_hat:,.0f}")

    def predict(frame: pd.DataFrame):
        X = frame[train.FEATURES]
        q10 = np.expm1(m_q10.predict(X))
        q50 = np.expm1(m_q50.predict(X))
        q90 = np.expm1(m_q90.predict(X))
        lo, hi = np.minimum(q10, q90), np.maximum(q10, q90)
        lo, hi = widen_bin(lo, hi, q_hat)
        return q50, lo, hi

    y_val = val[train.TARGET].to_numpy()
    _, lo_v, hi_v = predict(val)
    y_te = test[train.TARGET].to_numpy()
    _, lo_t, hi_t = predict(test)

    cov_val = empirical_coverage(y_val, lo_v, hi_v)
    cov_test = empirical_coverage(y_te, lo_t, hi_t)
    print(f"\nHeadline: val coverage {cov_val*100:.1f}%,  test coverage {cov_test*100:.1f}%, "
          f"gap {(cov_val - cov_test)*100:.1f} pp")

    # Monthly coverage across val + test.
    combined = pd.concat([val.assign(__split="val"), test.assign(__split="test")], ignore_index=True)
    y_c = combined[train.TARGET].to_numpy()
    _, lo_c, hi_c = predict(combined)
    months = combined["publication_lastModificationDate"].dt.to_period("M").astype(str)
    slice_report(
        "Coverage by month (val+test combined, sorted by coverage asc)",
        months.where(combined["__split"] == "val", other=months + " [TEST]"),
        y_c, lo_c, hi_c, min_count=50,
    )

    slice_report(
        "Coverage by subType (test only)",
        test["subType"].astype(str), y_te, lo_t, hi_t, min_count=50,
    )

    deciles = pd.qcut(test[train.TARGET], q=10, labels=[f"D{i+1}" for i in range(10)], duplicates="drop")
    slice_report(
        "Coverage by price decile (test only)",
        deciles.astype(str), y_te, lo_t, hi_t, min_count=50,
    )

    slice_report(
        "Coverage by province (test only)",
        test["postalCode_cat"].astype(str).str[:1], y_te, lo_t, hi_t, min_count=50,
    )

    cutoff = val["publication_lastModificationDate"].max() - pd.Timedelta(days=30)
    in_last30 = (val["publication_lastModificationDate"] >= cutoff).to_numpy()
    lo_last30, hi_last30 = lo_v[in_last30], hi_v[in_last30]
    y_last30 = y_val[in_last30]
    lo_rest, hi_rest = lo_v[~in_last30], hi_v[~in_last30]
    y_rest = y_val[~in_last30]
    print("\n--- Val split: last 30 days vs rest ---")
    print(f"last 30 days : n={len(y_last30):>5}   coverage {empirical_coverage(y_last30, lo_last30, hi_last30)*100:>5.1f}%")
    print(f"rest of val  : n={len(y_rest):>5}   coverage {empirical_coverage(y_rest, lo_rest, hi_rest)*100:>5.1f}%")

    widths = hi_t - lo_t
    y_mid = y_te
    avg_width_pct = float(np.mean(widths / y_mid) * 100)
    print(f"\nTest set band width stats (€): median €{np.median(widths)/1000:,.0f}k  "
          f"mean €{np.mean(widths)/1000:,.0f}k  mean-as-%-of-price {avg_width_pct:.1f}%")


if __name__ == "__main__":
    main()
