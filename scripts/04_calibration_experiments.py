"""Compare calibration schemes on the saved boosters (no retrain): baseline
split-conformal, recent-only, weighted, per-decile, and hybrid. Reports test
coverage + band width."""

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

TARGET_COVERAGE = 0.80
ALPHA = 1 - TARGET_COVERAGE


def finite_sample_quantile(scores: np.ndarray, alpha: float = ALPHA) -> float:
    n = len(scores)
    if n == 0:
        return 0.0
    level = min(1.0, float(np.ceil((n + 1) * (1 - alpha)) / n))
    return float(np.quantile(scores, level))


def weighted_quantile(values: np.ndarray, weights: np.ndarray, q: float) -> float:
    idx = np.argsort(values)
    v, w = values[idx], weights[idx]
    cw = np.cumsum(w) / w.sum()
    j = int(np.searchsorted(cw, q))
    j = min(j, len(v) - 1)
    return float(v[j])


def coverage_and_width(y: np.ndarray, lo: np.ndarray, hi: np.ndarray) -> tuple[float, float]:
    cov = float(np.mean((y >= lo) & (y <= hi)))
    width_k = float(np.mean(hi - lo) / 1000)
    return cov, width_k


def apply_single_q_hat(lo: np.ndarray, hi: np.ndarray, q_hat: float):
    return np.maximum(lo - q_hat, 1.0), hi + q_hat


def main() -> None:
    print("Loading + splitting…")
    df_raw = train.load_raw()
    df_all = train.engineer(df_raw)
    trn, val, test = train.temporal_split(df_all)
    trn, val, test, _lookup, _fallback = train.add_commune_feature(trn, val, test)

    print("Loading saved boosters + predicting val + test…")
    m_q10 = lgb.Booster(model_file=str(DATA / "model_q10.txt"))
    m_q90 = lgb.Booster(model_file=str(DATA / "model_q90.txt"))

    def predict_raw(frame: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        X = frame[train.FEATURES]
        q10 = np.expm1(m_q10.predict(X))
        q90 = np.expm1(m_q90.predict(X))
        lo, hi = np.minimum(q10, q90), np.maximum(q10, q90)
        y = frame[train.TARGET].to_numpy()
        return y, lo, hi

    y_val, lo_v_raw, hi_v_raw = predict_raw(val)
    y_te, lo_t_raw, hi_t_raw = predict_raw(test)
    val_dates = pd.to_datetime(val["publication_lastModificationDate"]).to_numpy()
    max_val_date = val_dates.max()

    scores_val = np.maximum(lo_v_raw - y_val, y_val - hi_v_raw)

    results: list[tuple[str, float, float, float]] = []

    # (0) baseline
    q_hat = finite_sample_quantile(scores_val)
    lo, hi = apply_single_q_hat(lo_t_raw, hi_t_raw, q_hat)
    cov, width = coverage_and_width(y_te, lo, hi)
    results.append(("(0) baseline (single q_hat, all of val)", q_hat, cov, width))

    # (1) recent-only: last 30 days of val
    cutoff = max_val_date - np.timedelta64(30, "D")
    mask = val_dates >= cutoff
    q_hat_recent = finite_sample_quantile(scores_val[mask])
    lo, hi = apply_single_q_hat(lo_t_raw, hi_t_raw, q_hat_recent)
    cov, width = coverage_and_width(y_te, lo, hi)
    results.append((f"(1) recent-only (last 30d of val, n={mask.sum()})", q_hat_recent, cov, width))

    # (2) weighted: val residuals weighted exp(−λ·days_from_boundary).
    days_from_boundary = (max_val_date - val_dates).astype("timedelta64[D]").astype(int)
    best = None
    for lam in [0.01, 0.02, 0.03, 0.05, 0.08]:
        w = np.exp(-lam * days_from_boundary)
        w /= w.sum()
        qw = weighted_quantile(scores_val, w, min(1.0, 1 - ALPHA + 1 / (len(scores_val) + 1)))
        lo, hi = apply_single_q_hat(lo_t_raw, hi_t_raw, qw)
        cov, width = coverage_and_width(y_te, lo, hi)
        if best is None or abs(cov - TARGET_COVERAGE) < abs(best[3] - TARGET_COVERAGE):
            best = (f"(2) weighted (λ={lam}, effN≈{int(w.sum()**2/np.sum(w**2))})", qw, cov, width)
    assert best is not None
    results.append((best[0], best[1], best[2], best[3]))

    # (3) per-decile q_hat, binned by val q50 prediction.
    m_q50 = lgb.Booster(model_file=str(DATA / "model_q50.txt"))
    q50_v = np.expm1(m_q50.predict(val[train.FEATURES]))
    q50_t = np.expm1(m_q50.predict(test[train.FEATURES]))

    deciles_v, bin_edges = pd.qcut(q50_v, q=10, labels=False, retbins=True, duplicates="drop")
    deciles_t = np.clip(
        np.searchsorted(bin_edges[1:-1], q50_t, side="right"),
        0, len(bin_edges) - 2,
    )
    q_hats = np.zeros(len(bin_edges) - 1)
    for b in range(len(q_hats)):
        q_hats[b] = finite_sample_quantile(scores_val[deciles_v == b])
    q_hat_per_row = q_hats[deciles_t]
    lo = np.maximum(lo_t_raw - q_hat_per_row, 1.0)
    hi = hi_t_raw + q_hat_per_row
    cov, width = coverage_and_width(y_te, lo, hi)
    results.append((f"(3) conditional by decile (q_hats: {[int(q) for q in q_hats]})", float(np.mean(q_hats)), cov, width))

    # (4) per-decile q_hat from val's last 60 days (with all-val fallback).
    mask60 = val_dates >= max_val_date - np.timedelta64(60, "D")
    q_hats_h = np.zeros(len(bin_edges) - 1)
    for b in range(len(q_hats_h)):
        m = (deciles_v == b) & mask60
        if m.sum() >= 20:
            q_hats_h[b] = finite_sample_quantile(scores_val[m])
        else:
            q_hats_h[b] = finite_sample_quantile(scores_val[deciles_v == b])
    q_hat_per_row_h = q_hats_h[deciles_t]
    lo = np.maximum(lo_t_raw - q_hat_per_row_h, 1.0)
    hi = hi_t_raw + q_hat_per_row_h
    cov, width = coverage_and_width(y_te, lo, hi)
    results.append((f"(4) hybrid decile × last-60d (q_hats: {[int(q) for q in q_hats_h]})", float(np.mean(q_hats_h)), cov, width))

    print(f"\n{'scheme':<68} {'mean q̂(€)':>10} {'cov':>7} {'width(€k)':>11}")
    print("-" * 98)
    for name, q_hat, cov, width in results:
        print(f"{name[:68]:<68} {q_hat:>10,.0f} {cov*100:>6.1f}% {width:>10.0f}")


if __name__ == "__main__":
    main()
