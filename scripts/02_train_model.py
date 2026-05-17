"""Train the price model: temporal split, baselines, Optuna tuning, quantile
regression heads, split-conformal calibration, and the web Parquet artefact.

Outputs:
  data/model_q{10,50,90}.txt, data/metrics.json, data/residuals_test.csv,
  data/listings_web.parquet (mirrored into web/public/).
"""

from __future__ import annotations

import json
import math
import os
import warnings
from pathlib import Path

import lightgbm as lgb
import numpy as np
import optuna
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error

warnings.filterwarnings("ignore", category=UserWarning)
optuna.logging.set_verbosity(optuna.logging.WARNING)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SEED = 42

# Cities used for distance features (lng, lat).
CITIES = {
    "brussels":  (4.3517, 50.8503),
    "antwerp":   (4.4025, 51.2194),
    "ghent":     (3.7174, 51.0543),
    "liege":     (5.5797, 50.6326),
    "bruges":    (3.2247, 51.2093),
    "charleroi": (4.4446, 50.4108),
    "namur":     (4.8722, 50.4674),
}

CATEGORICAL = [
    "heatingType", "gardenOrientation", "kitchenType", "subType",
    "terraceOrientation", "epcScore", "postalCode_cat", "province",
]
BINARY = [
    "isNewlyBuilt", "isNotarySale", "hasDoubleGlazing", "hasHeatPump",
    "hasPhotovoltaicPanels", "hasThermicPanels", "hasFireplace", "hasAttic",
    "hasBasement", "hasDiningRoom", "hasGarden", "hasLaundryRoom", "hasLift",
    "hasLivingRoom", "hasSauna", "hasSecureAccessAlarm", "hasSwimmingPool",
    "hasTerrace",
]
NUMERIC = [
    "bathroomCount", "bedroomCount", "constructionYear", "facadeCount",
    "latitude", "longitude", "netHabitableSurface", "parkingCount",
    "roomCount", "showerRoomCount", "terraceSurface", "toiletCount",
    "property_age", "surface_per_bedroom", "construction_decade",
    *[f"dist_{c}" for c in CITIES],
    "medianSellPrice", "riskMonetaryPoverty", "totalPopulation",
    "commune_median_eur_per_m2",
]
FEATURES = CATEGORICAL + BINARY + NUMERIC
TARGET = "price"

# Experimental knobs (env-overridable). Wider raw quantiles (95%) + split-conformal
# on val tend to land closer to 80% on the temporally-shifted test slice than
# fitting q=0.10/0.90 directly.
TRAINING_MONTHS = int(os.environ.get("TRAINING_MONTHS", "12"))
QUANTILE_LOW    = float(os.environ.get("QUANTILE_LOW", "0.025"))
QUANTILE_HIGH   = float(os.environ.get("QUANTILE_HIGH", "0.975"))
RECENT_WEIGHT_MULT = float(os.environ.get("RECENT_WEIGHT_MULT", "3.0"))
SKIP_TUNE = os.environ.get("SKIP_TUNE", "0") == "1"


# ---------- Load + feature engineering ---------------------------------------

def load_raw() -> pd.DataFrame:
    df = pd.read_parquet(DATA / "listings_raw.parquet")
    df[TARGET] = pd.to_numeric(df[TARGET], errors="coerce")
    df = df[df[TARGET].between(20_000, 5_000_000)].copy()
    for col in ("publication_lastModificationDate", "publication_creationDate"):
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")
    # Gold-view joins can duplicate ids; keep the most recent copy.
    before = len(df)
    df = df.sort_values("publication_lastModificationDate").drop_duplicates(
        subset="id", keep="last"
    ).reset_index(drop=True)
    if len(df) < before:
        print(f"  Dropped {before - len(df):,} duplicate id rows")
    return df


def engineer(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    now_year = pd.Timestamp.utcnow().year
    df["constructionYear"] = pd.to_numeric(df["constructionYear"], errors="coerce")
    df["property_age"] = (now_year - df["constructionYear"]).clip(lower=0, upper=200)
    df["construction_decade"] = (df["constructionYear"] // 10 * 10).clip(lower=1800, upper=now_year)

    df["netHabitableSurface"] = pd.to_numeric(df["netHabitableSurface"], errors="coerce")
    df["bedroomCount"] = pd.to_numeric(df["bedroomCount"], errors="coerce")
    df["surface_per_bedroom"] = df["netHabitableSurface"] / df["bedroomCount"].replace(0, np.nan)

    lat = pd.to_numeric(df["latitude"], errors="coerce")
    lng = pd.to_numeric(df["longitude"], errors="coerce")
    for name, (clng, clat) in CITIES.items():
        df[f"dist_{name}"] = haversine_km(lat, lng, clat, clng)

    # Postcode as a categorical string + a province code (first digit).
    df["postalCode_cat"] = df["postalCode"].astype("string").str.zfill(4)
    df["province"] = df["postalCode_cat"].str[:1].fillna("?")

    for c in CATEGORICAL:
        df[c] = df[c].fillna("Unknown").astype("category")
    for c in BINARY:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)
    for c in NUMERIC:
        if c == "commune_median_eur_per_m2":
            continue  # filled per-split in add_commune_feature
        df[c] = pd.to_numeric(df[c], errors="coerce")

    return df


def add_commune_feature(
    train: pd.DataFrame,
    val: pd.DataFrame,
    test: pd.DataFrame,
    n_folds: int = 5,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.Series, float]:
    """OOF target-encode commune-level median €/m².

    Train uses K-fold; val/test look up against a single full-train aggregate.
    Unseen postcodes get the global median.
    """
    def eur_per_m2(df: pd.DataFrame) -> pd.Series:
        return df[TARGET] / df["netHabitableSurface"].clip(lower=10)

    tr = train.copy()
    tr["__eurm2"] = eur_per_m2(tr)
    tr["commune_median_eur_per_m2"] = np.nan
    rng = np.random.default_rng(SEED)
    folds = rng.integers(0, n_folds, size=len(tr))
    for k in range(n_folds):
        in_fold = folds == k
        lookup = tr.loc[~in_fold].groupby("postalCode_cat", observed=True)["__eurm2"].median()
        tr.loc[in_fold, "commune_median_eur_per_m2"] = tr.loc[in_fold, "postalCode_cat"].map(lookup)
    tr = tr.drop(columns="__eurm2")

    full_lookup = eur_per_m2(train).groupby(train["postalCode_cat"], observed=True).median()
    fallback = float(eur_per_m2(train).median())

    v = val.copy(); t = test.copy()
    v["commune_median_eur_per_m2"] = v["postalCode_cat"].map(full_lookup)
    t["commune_median_eur_per_m2"] = t["postalCode_cat"].map(full_lookup)
    for d in (tr, v, t):
        d["commune_median_eur_per_m2"] = d["commune_median_eur_per_m2"].fillna(fallback)

    return tr, v, t, full_lookup, fallback


def haversine_km(lat1, lng1, lat2, lng2):
    R = 6371.0
    lat1r = np.radians(lat1); lat2r = np.radians(lat2)
    dlat = np.radians(np.asarray(lat2) - np.asarray(lat1))
    dlng = np.radians(np.asarray(lng2) - np.asarray(lng1))
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1r) * np.cos(lat2r) * np.sin(dlng / 2) ** 2
    return 2 * R * np.arcsin(np.sqrt(a))


# ---------- Temporal split ----------------------------------------------------

def temporal_split(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Within the last TRAINING_MONTHS, sort by date: 70/15/15 -> train/val/test."""
    cutoff = pd.Timestamp.utcnow().tz_localize(None) - pd.DateOffset(months=TRAINING_MONTHS)
    modeling = df[df["publication_lastModificationDate"] >= cutoff].copy()
    modeling = modeling.sort_values("publication_lastModificationDate").reset_index(drop=True)
    n = len(modeling)
    i1 = int(n * 0.70)
    i2 = int(n * 0.85)
    train = modeling.iloc[:i1].copy()
    val = modeling.iloc[i1:i2].copy()
    test = modeling.iloc[i2:].copy()
    print(
        f"Temporal split: train={len(train):,} "
        f"({train['publication_lastModificationDate'].min().date()}→{train['publication_lastModificationDate'].max().date()}), "
        f"val={len(val):,} "
        f"({val['publication_lastModificationDate'].min().date()}→{val['publication_lastModificationDate'].max().date()}), "
        f"test={len(test):,} "
        f"({test['publication_lastModificationDate'].min().date()}→{test['publication_lastModificationDate'].max().date()})"
    )
    return train, val, test


# ---------- Baselines ---------------------------------------------------------

def baselines(train: pd.DataFrame, test: pd.DataFrame) -> dict:
    out: dict[str, dict] = {}

    pred = np.full(len(test), train[TARGET].mean())
    out["global_mean"] = score(test[TARGET].to_numpy(), pred)

    lookup = (train[TARGET] / train["netHabitableSurface"].clip(lower=10)).groupby(
        train["postalCode_cat"], observed=True
    ).median()
    global_med = (train[TARGET] / train["netHabitableSurface"].clip(lower=10)).median()
    eur_per_m2 = test["postalCode_cat"].map(lookup).fillna(global_med).to_numpy()
    pred = eur_per_m2 * test["netHabitableSurface"].fillna(0).to_numpy()
    out["commune_median_eur_per_m2"] = score(test[TARGET].to_numpy(), pred)

    lr_feats = [
        "netHabitableSurface", "bedroomCount", "bathroomCount", "constructionYear",
        "latitude", "longitude", "dist_brussels", "medianSellPrice",
        "riskMonetaryPoverty", "totalPopulation", "commune_median_eur_per_m2",
    ]
    Xtr = train[lr_feats].fillna(train[lr_feats].median()).to_numpy()
    ytr = np.log1p(train[TARGET].to_numpy())
    Xte = test[lr_feats].fillna(train[lr_feats].median()).to_numpy()
    lr = Ridge(alpha=1.0).fit(Xtr, ytr)
    pred = np.expm1(lr.predict(Xte))
    out["ridge_basic"] = score(test[TARGET].to_numpy(), pred)

    return out


def score(y: np.ndarray, pred: np.ndarray) -> dict:
    pred = np.maximum(pred, 1.0)
    ape = np.abs(pred - y) / y
    return {
        "mae_eur": round(float(mean_absolute_error(y, pred))),
        "rmse_eur": round(float(np.sqrt(mean_squared_error(y, pred)))),
        "r2": round(float(1 - np.var(y - pred) / np.var(y)), 4),
        "mape": round(float(np.mean(ape)), 4),
        "median_ape": round(float(np.median(ape)), 4),
    }


# ---------- LightGBM: tuning + training --------------------------------------

def recency_weights(df: pd.DataFrame, max_mult: float = RECENT_WEIGHT_MULT) -> np.ndarray:
    """max_mult at <=180d, linear decay to 1.0 at 360d, flat 1.0 after."""
    now = pd.Timestamp.utcnow().tz_localize(None)
    days = (now - df["publication_lastModificationDate"]).dt.days.clip(lower=0).to_numpy()
    w = np.where(
        days <= 180,
        max_mult,
        np.clip(max_mult - (max_mult - 1.0) * (days - 180) / 180, 1.0, max_mult),
    )
    return w.astype("float64")


def make_dataset(df: pd.DataFrame, log_y: bool = True, weight=None) -> lgb.Dataset:
    X = df[FEATURES]
    y = np.log1p(df[TARGET].to_numpy()) if log_y else df[TARGET].to_numpy()
    return lgb.Dataset(X, label=y, weight=weight, categorical_feature=CATEGORICAL, free_raw_data=False)


def tune_lgbm(train: pd.DataFrame, val: pd.DataFrame, n_trials: int = 60) -> dict:
    dtr = make_dataset(train, weight=recency_weights(train))
    dval = make_dataset(val)

    y_val = val[TARGET].to_numpy()

    def objective(trial: optuna.Trial) -> float:
        params = {
            "objective": "regression",
            "metric": "rmse",
            "verbose": -1,
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.2, log=True),
            "num_leaves": trial.suggest_int("num_leaves", 31, 512),
            "max_depth": trial.suggest_int("max_depth", 4, 15),
            "min_data_in_leaf": trial.suggest_int("min_data_in_leaf", 10, 200),
            "feature_fraction": trial.suggest_float("feature_fraction", 0.6, 1.0),
            "bagging_fraction": trial.suggest_float("bagging_fraction", 0.6, 1.0),
            "bagging_freq": trial.suggest_int("bagging_freq", 0, 10),
            "lambda_l1": trial.suggest_float("lambda_l1", 1e-3, 10.0, log=True),
            "lambda_l2": trial.suggest_float("lambda_l2", 1e-3, 10.0, log=True),
            "min_gain_to_split": trial.suggest_float("min_gain_to_split", 0.0, 1.0),
            "seed": SEED,
        }
        booster = lgb.train(
            params, dtr, num_boost_round=2000, valid_sets=[dval],
            callbacks=[
                lgb.early_stopping(80, verbose=False),
                lgb.log_evaluation(0),
                optuna.integration.LightGBMPruningCallback(trial, "rmse"),
            ],
        )
        pred = np.expm1(booster.predict(val[FEATURES], num_iteration=booster.best_iteration))
        trial.set_user_attr("best_iteration", booster.best_iteration)
        return float(mean_absolute_error(y_val, pred))

    sampler = optuna.samplers.TPESampler(seed=SEED)
    pruner = optuna.pruners.MedianPruner(n_warmup_steps=200)
    study = optuna.create_study(direction="minimize", sampler=sampler, pruner=pruner)
    study.optimize(objective, n_trials=n_trials, show_progress_bar=True)
    best = dict(study.best_params)
    best["best_iteration"] = study.best_trial.user_attrs.get("best_iteration", 1000)
    print(f"Best val MAE: €{study.best_value:,.0f} with params {best}")
    return best


def train_model(
    train: pd.DataFrame,
    val: pd.DataFrame,
    params: dict,
    alpha: float,
) -> lgb.Booster:
    """Fit a quantile booster for `alpha`, early-stopping on val pinball loss."""
    dtr = make_dataset(train, weight=recency_weights(train))
    dval = make_dataset(val)
    p = {
        "objective": "quantile",
        "alpha": alpha,
        "metric": "quantile",
        "verbose": -1,
        "learning_rate": params["learning_rate"],
        "num_leaves": params["num_leaves"],
        "max_depth": params["max_depth"],
        "min_data_in_leaf": params["min_data_in_leaf"],
        "feature_fraction": params["feature_fraction"],
        "bagging_fraction": params["bagging_fraction"],
        "bagging_freq": params["bagging_freq"],
        "lambda_l1": params["lambda_l1"],
        "lambda_l2": params["lambda_l2"],
        "min_gain_to_split": params["min_gain_to_split"],
        "seed": SEED,
    }
    booster = lgb.train(
        p, dtr, num_boost_round=5000, valid_sets=[dval],
        callbacks=[lgb.early_stopping(150, verbose=False), lgb.log_evaluation(0)],
    )

    # Refit on train+val using the chosen iteration count.
    full = pd.concat([train, val], ignore_index=True)
    dfull = make_dataset(full, weight=recency_weights(full))
    best_iter = booster.best_iteration or 2000
    final = lgb.train(
        p, dfull, num_boost_round=int(best_iter * 1.1) + 1,
        callbacks=[lgb.log_evaluation(0)],
    )
    print(f"  alpha={alpha}: best_iter={best_iter} (refit to {int(best_iter*1.1)+1})")
    return final


# ---------- Web-facing artifact ----------------------------------------------

def top_shap_drivers(booster: lgb.Booster, X: pd.DataFrame, k: int = 6) -> list[list[dict]]:
    """Top-k SHAP drivers per row, each with a euro-equivalent contribution.

    Model is trained on log1p(price). For row pred_log = base + Σ s_i:
    delta_eur_i = expm1(pred_log) - expm1(pred_log - s_i). Magnitudes only sum
    approximately back to pred_eur - exp(base), but the sign of delta_eur_i
    matches s_i and the readout is in euros.
    """
    contrib = booster.predict(X, pred_contrib=True)
    sv = contrib[:, :-1]
    base_log = contrib[:, -1]
    pred_log = base_log + sv.sum(axis=1)
    pred_eur = np.expm1(pred_log)
    delta_eur = pred_eur[:, None] - np.expm1(pred_log[:, None] - sv)
    top_idx = np.argsort(-np.abs(sv), axis=1)[:, :k]
    feats = np.array(FEATURES)
    drivers: list[list[dict]] = []
    raw = X.to_numpy(dtype=object)
    for row_i in range(len(X)):
        row = []
        for j in top_idx[row_i]:
            v = raw[row_i, j]
            val = None if pd.isna(v) else (str(v) if feats[j] in CATEGORICAL else float(v))
            row.append({
                "feature": feats[j],
                "shap": round(float(sv[row_i, j]), 4),
                "shap_eur": int(round(float(delta_eur[row_i, j]) / 100.0)) * 100,
                "value": val,
            })
        drivers.append(row)
    return drivers


def build_web_frame(
    df_all: pd.DataFrame,
    m_q10: lgb.Booster,
    m_q50: lgb.Booster,
    m_q90: lgb.Booster,
    q_hat: float = 0.0,
) -> pd.DataFrame:
    X = df_all[FEATURES]
    q10 = np.expm1(m_q10.predict(X))
    q50 = np.expm1(m_q50.predict(X))
    q90 = np.expm1(m_q90.predict(X))
    # Fix quantile crossing.
    stacked = np.sort(np.stack([q10, q50, q90], axis=1), axis=1)
    q10, q50, q90 = stacked[:, 0], stacked[:, 1], stacked[:, 2]
    # Split-conformal widening (q_hat from val residuals).
    q10 = np.maximum(q10 - q_hat, 1.0)
    q90 = q90 + q_hat

    df = df_all.copy()
    df["predicted_price"] = q50.round().astype("int64")
    df["predicted_low"] = q10.round().astype("int64")
    df["predicted_high"] = q90.round().astype("int64")
    df["price_delta"] = (df[TARGET] - df["predicted_price"]).astype("int64")
    df["price_delta_pct"] = ((df[TARGET] - df["predicted_price"]) / df["predicted_price"]).round(4)

    drivers = top_shap_drivers(m_q50, X, k=6)
    df["shap_top"] = [json.dumps(d) for d in drivers]

    now = pd.Timestamp.utcnow().tz_localize(None)
    created = pd.to_datetime(df.get("publication_creationDate"), errors="coerce")
    df["days_on_market"] = (now - created).dt.days.clip(lower=0, upper=365).astype("Int32")

    keep = [
        "id", "price", "predicted_price", "predicted_low", "predicted_high",
        "price_delta", "price_delta_pct",
        "latitude", "longitude", "postalCode", "subType", "epcScore",
        "netHabitableSurface", "bedroomCount", "bathroomCount", "constructionYear",
        "hasGarden", "hasTerrace", "hasSwimmingPool",
        "publication_lastModificationDate", "days_on_market", "shap_top", "url",
    ]
    return df[keep]


def compute_similar_listings(
    web: pd.DataFrame,
    df_all: pd.DataFrame,
    booster: lgb.Booster,
    k: int = 5,
    radius_km: float = 50.0,
) -> pd.DataFrame:
    """For each active listing, top-k peers by shared LightGBM leaves,
    within the same subType and `radius_km`."""
    active_ids = web["id"].astype("int64").to_numpy()
    feats = df_all.set_index(df_all["id"].astype("int64"), drop=False).loc[active_ids, FEATURES]
    leaves = booster.predict(feats, pred_leaf=True).astype(np.int32)
    n, _T = leaves.shape

    meta = web.set_index("id", drop=False).loc[active_ids]
    lat = meta["latitude"].to_numpy()
    lng = meta["longitude"].to_numpy()
    subtype = meta["subType"].astype(str).to_numpy()
    ids = meta["id"].astype("int64").to_numpy()

    similar: list[str] = []
    for i in range(n):
        sim = (leaves == leaves[i]).sum(axis=1)
        sim[i] = -1
        same_sub = subtype == subtype[i]
        dist = np.asarray(haversine_km(lat[i], lng[i], lat, lng))
        sim = np.where(same_sub & (dist <= radius_km), sim, -1)
        order = np.argsort(-sim)
        picks = [int(ids[j]) for j in order[:k] if sim[j] > 0]
        similar.append(json.dumps(picks))

    web = web.copy()
    web["similar_ids"] = similar
    return web


def load_active_snapshot() -> pd.DataFrame | None:
    path = DATA / "active_snapshot.parquet"
    if not path.exists():
        print("No active_snapshot.parquet found — skipping online-only filter.")
        return None
    return pd.read_parquet(path)


# ---------- Main --------------------------------------------------------------

def main() -> None:
    print("=" * 78)
    print("Loading + engineering features…")
    df_raw = load_raw()
    df_all = engineer(df_raw)
    print(f"  {len(df_all):,} rows after cleanup")

    print("\nTemporal split…")
    train, val, test = temporal_split(df_all)

    print("\nAdding commune-median €/m² target encoding (OOF for train)…")
    train, val, test, lookup_eurm2, fallback_eurm2 = add_commune_feature(train, val, test)
    df_all["commune_median_eur_per_m2"] = (
        df_all["postalCode_cat"].map(lookup_eurm2).fillna(fallback_eurm2)
    )

    print("\nFitting baselines…")
    bl = baselines(train, test)
    for name, m in bl.items():
        print(f"  {name:30s}  MAE €{m['mae_eur']:,}  medAPE {m['median_ape']*100:.1f}%")

    cached_params = None
    if SKIP_TUNE:
        mf = DATA / "metrics.json"
        if mf.exists():
            cached_params = json.loads(mf.read_text()).get("best_params")
    if cached_params:
        print("\nSKIP_TUNE=1 — reusing cached best_params from data/metrics.json")
        best_params = cached_params
    else:
        n_trials = int(os.environ.get("OPTUNA_TRIALS", "60"))
        print(f"\nTuning LightGBM with Optuna ({n_trials} trials)…")
        best_params = tune_lgbm(train, val, n_trials=n_trials)

    print(f"\nTraining quantile boosters (q={QUANTILE_LOW}, 0.5, {QUANTILE_HIGH})…")
    m_q10 = train_model(train, val, best_params, alpha=QUANTILE_LOW)
    m_q50 = train_model(train, val, best_params, alpha=0.50)
    m_q90 = train_model(train, val, best_params, alpha=QUANTILE_HIGH)

    # Split-conformal (CQR-style): single additive q_hat from val residuals.
    # Negative q_hat is allowed — val can over-cover with wide raw quantiles.
    alpha = 0.20
    Xv = val[FEATURES]
    lo_v = np.expm1(m_q10.predict(Xv))
    hi_v = np.expm1(m_q90.predict(Xv))
    yv = val[TARGET].to_numpy()
    raw_cov_val = float(np.mean((yv >= lo_v) & (yv <= hi_v)))
    scores = np.maximum(lo_v - yv, yv - hi_v)
    n_cal = len(scores)
    level = min(1.0, float(np.ceil((n_cal + 1) * (1 - alpha)) / n_cal))
    q_hat = float(np.quantile(scores, level))
    print(f"  Val coverage raw: {raw_cov_val*100:.1f}%  →  conformal q_hat = €{q_hat:,.0f}")

    print("\nEvaluating on truly-held-out test set…")
    Xte = test[FEATURES]
    pred_te = np.expm1(m_q50.predict(Xte))
    lo_raw = np.expm1(m_q10.predict(Xte))
    hi_raw = np.expm1(m_q90.predict(Xte))
    lo_raw, hi_raw = np.minimum(lo_raw, hi_raw), np.maximum(lo_raw, hi_raw)
    lo_te = np.maximum(lo_raw - q_hat, 1.0)
    hi_te = hi_raw + q_hat
    lgbm_metrics = score(test[TARGET].to_numpy(), pred_te)
    y_te = test[TARGET].to_numpy()
    raw_cov = float(np.mean((y_te >= lo_raw) & (y_te <= hi_raw)))
    cal_cov = float(np.mean((y_te >= lo_te) & (y_te <= hi_te)))
    lgbm_metrics["coverage_80pct_raw"] = round(raw_cov, 4)
    lgbm_metrics["coverage_80pct_conformal"] = round(cal_cov, 4)
    lgbm_metrics["conformal_q_hat_eur"] = round(q_hat)
    lgbm_metrics["target_coverage"] = 0.80
    coverage = cal_cov
    print(f"  LightGBM (quantile median): MAE €{lgbm_metrics['mae_eur']:,}  "
          f"medAPE {lgbm_metrics['median_ape']*100:.1f}%  "
          f"R² {lgbm_metrics['r2']}  "
          f"80% band coverage {coverage*100:.1f}%")

    residuals = pd.DataFrame({
        "id": test["id"].astype("int64").to_numpy(),
        "price": test[TARGET].to_numpy(),
        "predicted": pred_te.round().astype("int64"),
        "q10": lo_te.round().astype("int64"),
        "q90": hi_te.round().astype("int64"),
        "residual_eur": (test[TARGET].to_numpy() - pred_te).round().astype("int64"),
        "ape": (np.abs(pred_te - test[TARGET].to_numpy()) / test[TARGET].to_numpy()).round(4),
        "postalCode": test["postalCode"].astype("Int64").to_numpy(),
        "subType": test["subType"].astype(str).to_numpy(),
    })
    residuals.to_csv(DATA / "residuals_test.csv", index=False)

    by_province = residuals.assign(province=residuals["postalCode"].astype("string").str[:1]) \
        .groupby("province")["ape"].agg(["median", "count"]).round(4).to_dict(orient="index")
    by_subtype = residuals.groupby("subType")["ape"].agg(["median", "count"]).round(4).to_dict(orient="index")

    metrics_out = {
        "split": {
            "n_train": int(len(train)),
            "n_val": int(len(val)),
            "n_test": int(len(test)),
            "scheme": "temporal (sorted by publication_lastModificationDate)",
        },
        "baselines": bl,
        "lightgbm": lgbm_metrics,
        "best_params": best_params,
        "median_ape_by_province": by_province,
        "median_ape_by_subtype": by_subtype,
    }
    (DATA / "metrics.json").write_text(json.dumps(metrics_out, indent=2))
    (ROOT / "web" / "public" / "metrics.json").write_text(json.dumps(metrics_out, indent=2))

    m_q50.save_model(str(DATA / "model_q50.txt"))
    m_q10.save_model(str(DATA / "model_q10.txt"))
    m_q90.save_model(str(DATA / "model_q90.txt"))

    # Score only the rows we'll ship (active + in gold view) to skip the
    # multi-minute SHAP pass on the full history.
    snapshot = load_active_snapshot()
    if snapshot is not None:
        active_ids_set = set(snapshot["id"].astype("int64").tolist())
        df_scoring = df_all[df_all["id"].astype("int64").isin(active_ids_set)].copy()
        print(f"\nScoring priceable subset: {len(df_scoring):,} rows "
              f"(out of {len(df_all):,} in gold view, "
              f"{len(active_ids_set):,} currently online)")
    else:
        active_ids_set = None
        df_scoring = df_all
        print(f"\nScoring full dataset (no active snapshot available): {len(df_scoring):,} rows")

    web = build_web_frame(df_scoring, m_q10, m_q50, m_q90, q_hat=q_hat)

    print("Computing similar listings (LightGBM leaf co-occurrence)…")
    web = compute_similar_listings(web, df_all, m_q50, k=5, radius_km=50.0)
    n_with_comps = int(web["similar_ids"].apply(lambda s: json.loads(s) != []).sum())
    print(f"  {n_with_comps:,} / {len(web):,} listings have at least one comp")
    web["priceable"] = True

    # Active listings rejected by the gold view (annuities, project listings,
    # etc.) shipped as priceable=False with null ML columns.
    if snapshot is not None:
        web_ids = set(web["id"].astype("int64").tolist())
        extras = snapshot[~snapshot["id"].astype("int64").isin(web_ids)].copy()
        extras = extras.dropna(subset=["latitude", "longitude"])
        extras["id"] = extras["id"].astype("int64")
        extras["postalCode"] = pd.to_numeric(extras["postalCode"], errors="coerce").astype("Int64")
        extras["price"] = pd.to_numeric(extras["price"], errors="coerce").astype("Int64")
        extras["bedroomCount"] = pd.to_numeric(extras["bedroomCount"], errors="coerce").astype("Int64")
        extras["netHabitableSurface"] = pd.to_numeric(
            extras["netHabitableSurface"], errors="coerce"
        ).astype("Int64")
        now = pd.Timestamp.utcnow().tz_localize(None)
        extras["days_on_market"] = (
            (now - extras["publication_lastModificationDate"]).dt.days.clip(lower=0, upper=365)
        ).astype("Int32")
        extras["priceable"] = False
        for c, default in (
            ("predicted_price", pd.NA), ("predicted_low", pd.NA), ("predicted_high", pd.NA),
            ("price_delta", pd.NA), ("price_delta_pct", pd.NA),
            ("shap_top", "[]"), ("similar_ids", "[]"),
            ("epcScore", "Unknown"),
            ("bathroomCount", pd.NA), ("constructionYear", pd.NA),
            ("hasGarden", pd.NA), ("hasTerrace", pd.NA), ("hasSwimmingPool", pd.NA),
        ):
            extras[c] = default
        extras = extras[web.columns]
        print(f"  Non-priceable: {len(extras):,}")
        web = pd.concat([web, extras], ignore_index=True)

    out = DATA / "listings_web.parquet"
    web_public = ROOT / "web" / "public" / "listings_web.parquet"
    web.to_parquet(out, index=False, compression="zstd")
    web_public.parent.mkdir(parents=True, exist_ok=True)
    web.to_parquet(web_public, index=False, compression="zstd")
    print(f"Wrote {len(web):,} rows ({web['priceable'].sum():,} priceable) to {out} "
          f"({out.stat().st_size / 1e6:.2f} MB)")
    print(f"Mirrored to {web_public}")
    print("\nDone.")


if __name__ == "__main__":
    main()
