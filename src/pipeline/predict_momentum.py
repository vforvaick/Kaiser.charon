#!/usr/bin/env python3
"""
Momentum prediction for Charon candidate entry filter.
Called from Node.js via subprocess. Receives candidate JSON on stdin,
returns momentum score + features on stdout.

Usage: python3 predict_momentum.py < candidate.json
Output: {"momentum_score": 0.0-1.0, "features": {...}}
"""

import json
import os
import pickle
import sys
from typing import Any

import numpy as np

MODEL_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(MODEL_DIR, "..", "..", "models", "momentum_model.pkl")
SCALER_PATH = os.path.join(MODEL_DIR, "..", "..", "models", "momentum_scaler.pkl")
FEATURES_PATH = os.path.join(MODEL_DIR, "..", "..", "models", "momentum_features.json")

# Load model once at module level
_model: Any = None
_scaler: Any = None
_feature_cols: list[str] | None = None


def load_model() -> bool:
    global _model, _scaler, _feature_cols
    if _model is not None and _scaler is not None and _feature_cols is not None:
        return True
    try:
        with open(MODEL_PATH, "rb") as f:
            _model = pickle.load(f)  # noqa: S301 # nosec
        with open(SCALER_PATH, "rb") as f:
            _scaler = pickle.load(f)  # noqa: S301 # nosec
        with open(FEATURES_PATH) as f:
            _feature_cols = json.load(f)
        return True
    except Exception as e:
        print(json.dumps({"error": f"Failed to load model: {e}", "momentum_score": -1}), file=sys.stderr)
        return False


def safe_float(v: Any, default: float = 0.0) -> float:
    try:
        return float(v) if v is not None else default
    except (ValueError, TypeError):
        return default


def extract_features(candidate: dict[str, Any]) -> dict[str, float]:
    """Extract features from candidate JSON (same logic as backtest)."""
    metrics = candidate.get("metrics", {}) or {}
    if not isinstance(metrics, dict):
        metrics = {}
    gmgn = candidate.get("gmgn") or {}
    if not isinstance(gmgn, dict):
        gmgn = {}
    gmgn_price = gmgn.get("price")
    price_obj = gmgn_price if isinstance(gmgn_price, dict) else {}
    trenches = candidate.get("trenchesEntry") or {}
    if not isinstance(trenches, dict):
        trenches = {}
    jupiter_asset = candidate.get("jupiterAsset") or {}
    if not isinstance(jupiter_asset, dict):
        jupiter_asset = {}
    trending = candidate.get("trending") or {}
    if not isinstance(trending, dict):
        trending = {}

    # Resolve current price from GMGN (number or dict), Jupiter asset, metrics, trending, or trenches
    price_current_raw = None
    if isinstance(gmgn_price, (int, float)):
        price_current_raw = gmgn_price
    elif isinstance(gmgn_price, dict):
        price_current_raw = gmgn_price.get("price")
    elif isinstance(gmgn_price, str):
        price_current_raw = gmgn_price

    if price_current_raw is None or safe_float(price_current_raw) <= 0:
        price_current_raw = (
            jupiter_asset.get("usdPrice")
            or metrics.get("priceUsd")
            or trending.get("price")
            or trenches.get("price")
        )

    f: dict[str, float] = {}
    f["price_current"] = safe_float(price_current_raw)
    f["price_1m"] = safe_float(price_obj.get("price_1m"))
    f["price_5m"] = safe_float(price_obj.get("price_5m"))
    f["price_1h"] = safe_float(price_obj.get("price_1h"))

    if f["price_5m"] > 0 and f["price_current"] > 0:
        f["price_velocity_5m"] = (f["price_current"] - f["price_5m"]) / f["price_5m"]
    else:
        f["price_velocity_5m"] = 0.0

    if f["price_5m"] > 0 and f["price_1m"] > 0:
        vel_1m = (f["price_current"] - f["price_1m"]) / f["price_1m"]
        f["price_acceleration"] = vel_1m - f["price_velocity_5m"]
    else:
        f["price_acceleration"] = 0.0

    f["volume_1m"] = safe_float(price_obj.get("volume_1m"))
    f["volume_5m"] = safe_float(price_obj.get("volume_5m"))
    f["volume_1h"] = safe_float(price_obj.get("volume_1h"))
    f["buy_volume_1m"] = safe_float(price_obj.get("buy_volume_1m"))
    f["sell_volume_1m"] = safe_float(price_obj.get("sell_volume_1m"))

    if f["sell_volume_1m"] > 0:
        f["buy_sell_ratio_1m"] = f["buy_volume_1m"] / f["sell_volume_1m"]
    else:
        f["buy_sell_ratio_1m"] = f["buy_volume_1m"] if f["buy_volume_1m"] > 0 else 0.0

    if f["volume_1h"] > 0:
        f["volume_5m_ratio"] = f["volume_5m"] / f["volume_1h"]
    else:
        f["volume_5m_ratio"] = 0.0

    f["swaps_1m"] = safe_float(price_obj.get("swaps_1m"))
    f["swaps_5m"] = safe_float(price_obj.get("swaps_5m"))
    f["buys_1m"] = safe_float(price_obj.get("buys_1m"))
    f["sells_1m"] = safe_float(price_obj.get("sells_1m"))

    if f["sells_1m"] > 0:
        f["buy_swap_ratio"] = f["buys_1m"] / f["sells_1m"]
    else:
        f["buy_swap_ratio"] = f["buys_1m"] if f["buys_1m"] > 0 else 0.0

    mcap_raw = metrics.get("marketCapUsd") or jupiter_asset.get("mcap") or trending.get("market_cap") or trenches.get("market_cap")
    f["market_cap"] = safe_float(mcap_raw)

    liq_raw = metrics.get("liquidityUsd") or jupiter_asset.get("liquidity") or trending.get("liquidity") or gmgn.get("liquidity")
    f["liquidity"] = safe_float(liq_raw)
    f["liquidity_ratio"] = f["liquidity"] / f["market_cap"] if f["market_cap"] > 0 else 0.0

    holders_raw = metrics.get("holderCount") or jupiter_asset.get("holderCount") or trending.get("holder_count")
    f["holder_count"] = safe_float(holders_raw)
    smart_wallets = (gmgn.get("wallet_tags_stat") or {}).get("smart_wallets", 0)
    f["smart_degen_count"] = safe_float(metrics.get("trendingSmartDegenCount") or smart_wallets)
    f["sniper_count"] = safe_float(trenches.get("sniper_count", 0))
    f["smart_holder_ratio"] = f["smart_degen_count"] / f["holder_count"] if f["holder_count"] > 0 else 0.0

    f["top_10_holder_rate"] = safe_float(trenches.get("top_10_holder_rate"))
    f["bot_degen_rate"] = safe_float(trenches.get("bot_degen_rate"))
    f["bundler_rate"] = safe_float(trenches.get("bundler_trader_amount_rate"))
    f["rug_ratio"] = safe_float(trenches.get("rug_ratio"))
    f["fresh_wallet_rate"] = safe_float(trenches.get("fresh_wallet_rate"))

    chart = gmgn.get("chart") or {}
    if not isinstance(chart, dict):
        chart = {}
    f["below_ath_pct"] = safe_float(chart.get("belowHighPercent") or chart.get("distanceFromAthPercent"))
    f["ath_change_pct"] = 0.0
    f["swing_change_pct"] = 0.0
    for w in chart.get("windows", []):
        label = w.get("label", "")
        if "ath_context" in label:
            f["ath_change_pct"] = safe_float(w.get("changePercent"))
        if "swing_7d" in label:
            f["swing_change_pct"] = safe_float(w.get("changePercent"))

    twitter = candidate.get("twitterNarrative") or {}
    if not isinstance(twitter, dict):
        twitter = {}
    tw_metrics = twitter.get("metrics") or {}
    if not isinstance(tw_metrics, dict):
        tw_metrics = {}
    tw_virality = twitter.get("virality") or {}
    if not isinstance(tw_virality, dict):
        tw_virality = {}

    f["twitter_followers"] = safe_float(tw_metrics.get("authorFollowers"))
    f["twitter_engagement"] = safe_float(tw_virality.get("engagement"))
    f["twitter_views"] = safe_float(tw_metrics.get("views"))
    f["engagement_per_follower"] = f["twitter_engagement"] / f["twitter_followers"] if f["twitter_followers"] > 0 else 0.0

    f["graduated_volume"] = safe_float(metrics.get("graduatedVolumeUsd"))
    f["trending_volume"] = safe_float(metrics.get("trendingVolumeUsd"))
    f["token_age_seconds"] = safe_float(trenches.get("complete_cost_time"))
    f["creation_to_open"] = safe_float(trenches.get("open_timestamp", 0)) - safe_float(trenches.get("created_timestamp", 0))

    return f


def predict(candidate_json: dict[str, Any]) -> dict[str, Any]:
    """Predict momentum score for a candidate."""
    if not load_model() or _model is None or _scaler is None or _feature_cols is None:
        return {"momentum_score": -1, "error": "model_not_loaded"}

    candidate = candidate_json.get("candidate", candidate_json)
    if not isinstance(candidate, dict):
        candidate = {}

    features = extract_features(candidate)

    # Build feature vector in the correct order
    X = np.array([[features.get(col, 0.0) for col in _feature_cols]])
    X_scaled = _scaler.transform(X)
    proba = _model.predict_proba(X_scaled)[0, 1]  # probability of class 1 (runner)

    return {
        "momentum_score": round(float(proba), 4),
        "features": {k: features.get(k, 0.0) for k in _feature_cols[:5]},  # top 5 for logging
    }


if __name__ == "__main__":
    try:
        input_data = json.loads(sys.stdin.read())
        result = predict(input_data)
        print(json.dumps(result))
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON input: {e}", "momentum_score": -1}))
    except Exception as e:
        print(json.dumps({"error": str(e), "momentum_score": -1}))
