"""Per-price-decile conformal calibration vs single-q_hat baseline."""

from __future__ import annotations

import importlib.util
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

ALPHA = 0.20
N_BINS = 10


def finite_sample_quantile(scores: np.ndarray, alpha: float = ALPHA) -> float:
    n = len(scores)
    if n == 0:
        return 0.0
    level = min(1.0, float(np.ceil((n + 1) * (1 - alpha)) / n))
    return float(np.quantile(scores, level))


def main() -> None:
    print("Loading + splitting…")
    df_raw = train.load_raw()
    df_all = train.engineer(df_raw)
    trn, val, test = train.temporal_split(df_all)
    trn, val, test, _, _ = train.add_commune_feature(trn, val, test)

    print("Loading saved boosters…")
    m_q10 = lgb.Booster(model_file=str(DATA / "model_q10.txt"))
    m_q50 = lgb.Booster(model_file=str(DATA / "model_q50.txt"))
    m_q90 = lgb.Booster(model_file=str(DATA / "model_q90.txt"))

    def predict(frame: pd.DataFrame):
        X = frame[train.FEATURES]
        q10 = np.expm1(m_q10.predict(X))
        q50 = np.expm1(m_q50.predict(X))
        q90 = np.expm1(m_q90.predict(X))
        lo, hi = np.minimum(q10, q90), np.maximum(q10, q90)
        return q50, lo, hi

    q50_v, lo_v, hi_v = predict(val)
    q50_t, lo_t, hi_t = predict(test)
    y_v = val[train.TARGET].to_numpy()
    y_t = test[train.TARGET].to_numpy()

    scores_v = np.maximum(lo_v - y_v, y_v - hi_v)
    q_hat_single = finite_sample_quantile(scores_v)
    lo_t_single = np.maximum(lo_t - q_hat_single, 1.0)
    hi_t_single = hi_t + q_hat_single
    cov_single = float(np.mean((y_t >= lo_t_single) & (y_t <= hi_t_single)))
    print(f"\nBaseline (single q_hat = €{q_hat_single:,.0f}) — test coverage {cov_single*100:.1f}%")

    deciles_v, bin_edges = pd.qcut(q50_v, q=N_BINS, labels=False, retbins=True, duplicates="drop")
    n_bins_actual = len(bin_edges) - 1
    q_hats = np.zeros(n_bins_actual)
    for b in range(n_bins_actual):
        q_hats[b] = finite_sample_quantile(scores_v[deciles_v == b])
    print(f"\nPer-decile q_hat (bin -> €):")
    for b, q in enumerate(q_hats):
        edge_lo = int(bin_edges[b] / 1000)
        edge_hi = int(bin_edges[b + 1] / 1000)
        print(f"  D{b+1:<2} (€{edge_lo:>4}k..€{edge_hi:<4}k): q_hat = €{q:>8,.0f}")

    deciles_t = np.clip(
        np.searchsorted(bin_edges[1:-1], q50_t, side="right"),
        0, n_bins_actual - 1,
    )
    q_hat_per_row = q_hats[deciles_t]
    lo_t_cond = np.maximum(lo_t - q_hat_per_row, 1.0)
    hi_t_cond = hi_t + q_hat_per_row
    cov_cond = float(np.mean((y_t >= lo_t_cond) & (y_t <= hi_t_cond)))
    width_cond = float(np.mean(hi_t_cond - lo_t_cond) / 1000)

    print(f"\nConditional test coverage: {cov_cond*100:.1f}%  (avg band width €{width_cond:,.0f}k)")
    print(f"\nPer-decile test coverage (conditional):")
    for b in range(n_bins_actual):
        m = deciles_t == b
        if m.sum() == 0:
            continue
        c = float(np.mean((y_t[m] >= lo_t_cond[m]) & (y_t[m] <= hi_t_cond[m])))
        print(f"  D{b+1:<2}  n={int(m.sum()):>4}  coverage {c*100:>5.1f}%")


if __name__ == "__main__":
    main()
