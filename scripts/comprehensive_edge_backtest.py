#!/usr/bin/env python3
"""
Comprehensive edge backtest: extract ALL enrichment fields, sweep single-field thresholds,
test best combos, and verify daily consistency.
"""
import argparse
import glob
import hashlib
import json
import os
import sqlite3
import subprocess
import sys
from collections import defaultdict
from collections.abc import Callable
from datetime import datetime
from typing import Any


def safe_float(v: Any, default: float | None = None) -> float | None:
    """Parse float, return default if None/empty/error."""
    try:
        if v is None:
            return default
        return float(v)
    except (ValueError, TypeError):
        return default


def safe_int(v: Any, default: int | None = None) -> int | None:
    try:
        if v is None:
            return default
        return int(v)
    except (ValueError, TypeError):
        return default


def extract_features(row: sqlite3.Row) -> dict[str, Any]:
    """Extract ALL numeric features from candidate_json."""
    try:
        cj = json.loads(row['candidate_json']) if row['candidate_json'] else {}
    except Exception:
        cj = {}
    c = cj.get('candidate', cj)

    me = c.get('metrics', {}) or {}
    si = c.get('signals', {}) or {}
    ja = c.get('jupiterAsset', {}) or {}
    au = ja.get('audit', {}) or {}
    ho = c.get('holders', {}) or {}
    fi = c.get('filters', {}) or {}
    ex = c.get('executionRefresh', {}) or {}
    tr = c.get('trending', {}) or {}

    feats: dict[str, Any] = {
        # Meta
        'pnl_sol': row['pnl_sol'] or 0,
        'exit': row['exit_reason'] or '',
        'entry_mcap': row['entry_mcap'] or 0,
        'route': row['route'] or 'unknown',
        'opened_at_ms': row['opened_at_ms'] or 0,
        'closed_at_ms': row['closed_at_ms'] or 0,
        'day': datetime.fromtimestamp((row['opened_at_ms'] or 0) / 1000).strftime('%Y-%m-%d'),

        # Metrics
        'me_priceUsd': safe_float(me.get('priceUsd'), 0),
        'me_marketCap': safe_float(me.get('marketCapUsd'), 0),
        'me_liquidity': safe_float(me.get('liquidityUsd'), 0),
        'me_holderCount': safe_int(me.get('holderCount'), 0),
        'me_gmgnTotalFees': safe_float(me.get('gmgnTotalFeesSol'), 0),
        'me_trendingVolume': safe_float(me.get('trendingVolumeUsd'), 0),
        'me_trendingSwaps': safe_int(me.get('trendingSwaps'), 0),
        'me_trendingHotLevel': safe_int(me.get('trendingHotLevel'), 0),
        'me_trendingSmartDegen': safe_int(me.get('trendingSmartDegenCount'), 0),

        # Signals
        'si_hasTrending': 1 if si.get('hasTrending') else 0,
        'si_hasGraduated': 1 if si.get('hasGraduated') else 0,
        'si_hasFeeClaim': 1 if si.get('hasFeeClaim') else 0,

        # JupiterAsset
        'ja_mcap': safe_float(ja.get('mcap'), 0),
        'ja_fdv': safe_float(ja.get('fdv'), 0),
        'ja_liquidity': safe_float(ja.get('liquidity'), 0),
        'ja_bondingCurve': safe_float(ja.get('bondingCurve'), 0),
        'ja_organicScore': safe_float(ja.get('organicScore'), 0),
        'ja_holderCount': safe_int(ja.get('holderCount'), 0),
        'ja_fees': safe_float(ja.get('fees'), 0),
        'ja_usdPrice': safe_float(ja.get('usdPrice'), 0),

        # Audit
        'au_topHoldersPct': safe_float(au.get('topHoldersPercentage'), 0),
        'au_devMigrations': safe_int(au.get('devMigrations'), 0),
        'au_devMints': safe_int(au.get('devMints'), 0),
        'au_botHoldersCount': safe_int(au.get('botHoldersCount'), 0),
        'au_botHoldersPct': safe_float(au.get('botHoldersPercentage'), 0),

        # Bundler
        'au_bundlerHoldingPct': safe_float((au.get('bundlerStats') or {}).get('holdingPct'), 0),
        'au_bundlerPercent': safe_float((au.get('bundlerStats') or {}).get('percent'), 0),
        'au_bundlerCount': safe_int((au.get('bundlerStats') or {}).get('count'), 0),
        'au_hasBundler': 1 if au.get('bundlerStats') else 0,

        # Stats5m
        's5m_priceChange': safe_float((ja.get('stats5m') or {}).get('priceChange'), 0),
        's5m_buyVol': safe_float((ja.get('stats5m') or {}).get('buyVolume'), 0),
        's5m_sellVol': safe_float((ja.get('stats5m') or {}).get('sellVolume'), 0),
        's5m_numBuys': safe_int((ja.get('stats5m') or {}).get('numBuys'), 0),
        's5m_numSells': safe_int((ja.get('stats5m') or {}).get('numSells'), 0),
        's5m_numTraders': safe_int((ja.get('stats5m') or {}).get('numTraders'), 0),
        's5m_numNetBuyers': safe_int((ja.get('stats5m') or {}).get('numNetBuyers'), 0),
        's5m_holderChange': safe_float((ja.get('stats5m') or {}).get('holderChange'), 0),
        's5m_liquidityChange': safe_float((ja.get('stats5m') or {}).get('liquidityChange'), 0),

        # Stats1h
        's1h_priceChange': safe_float((ja.get('stats1h') or {}).get('priceChange'), 0),
        's1h_buyVol': safe_float((ja.get('stats1h') or {}).get('buyVolume'), 0),
        's1h_sellVol': safe_float((ja.get('stats1h') or {}).get('sellVolume'), 0),
        's1h_numBuys': safe_int((ja.get('stats1h') or {}).get('numBuys'), 0),
        's1h_numSells': safe_int((ja.get('stats1h') or {}).get('numSells'), 0),
        's1h_numTraders': safe_int((ja.get('stats1h') or {}).get('numTraders'), 0),
        's1h_numNetBuyers': safe_int((ja.get('stats1h') or {}).get('numNetBuyers'), 0),

        # Stats24h
        's24h_priceChange': safe_float((ja.get('stats24h') or {}).get('priceChange'), 0),
        's24h_buyVol': safe_float((ja.get('stats24h') or {}).get('buyVolume'), 0),
        's24h_sellVol': safe_float((ja.get('stats24h') or {}).get('sellVolume'), 0),

        # Holders
        'ho_count': safe_int(ho.get('count'), 0),
        'ho_top20Percent': safe_float(ho.get('top20Percent'), 0),
        'ho_maxHolderPercent': safe_float(ho.get('maxHolderPercent'), 0),

        # Filters
        'fi_softScore': safe_int(fi.get('softScore'), 0),
        'fi_softThreshold': safe_int(fi.get('softThreshold'), 0),

        # Execution refresh
        'ex_marketCap': safe_float(ex.get('marketCapUsd'), 0),
        'ex_priceUsd': safe_float(ex.get('priceUsd'), 0),
        'ex_liquidity': safe_float(ex.get('liquidityUsd'), 0),

        # Trending
        'tr_price': safe_float(tr.get('price'), 0),
        'tr_market_cap': safe_float(tr.get('market_cap'), 0),
        'tr_liquidity': safe_float(tr.get('liquidity'), 0),
        'tr_holder_count': safe_int(tr.get('holder_count'), 0),
        'tr_volume': safe_float(tr.get('volume'), 0),
        'tr_swaps': safe_int(tr.get('swaps'), 0),
        'tr_buys': safe_int(tr.get('buys'), 0),
        'tr_sells': safe_int(tr.get('sells'), 0),
        'tr_change5m': safe_float(tr.get('change5m'), 0),
        'tr_totalSupply': safe_int(tr.get('totalSupply'), 0),

        # Derived
        'buy_sell_ratio_5m': 0,
        'buy_sell_ratio_1h': 0,
        'net_buyer_ratio_5m': 0,
        'net_buyer_ratio_1h': 0,
    }

    # Derived ratios
    if feats['s5m_sellVol'] > 0:
        feats['buy_sell_ratio_5m'] = feats['s5m_buyVol'] / feats['s5m_sellVol']
    if feats['s1h_sellVol'] > 0:
        feats['buy_sell_ratio_1h'] = feats['s1h_buyVol'] / feats['s1h_sellVol']
    if feats['s5m_numTraders'] > 0:
        feats['net_buyer_ratio_5m'] = feats['s5m_numNetBuyers'] / feats['s5m_numTraders']
    if feats['s1h_numTraders'] > 0:
        feats['net_buyer_ratio_1h'] = feats['s1h_numNetBuyers'] / feats['s1h_numTraders']

    return feats


def analyze(subset: list[dict[str, Any]]) -> tuple[int, float, float, float, float, float] | None:
    """Return (n, wr, pnl, sl_rate, tp_rate, avg_pnl)."""
    if len(subset) < 10:
        return None
    n = len(subset)
    wr = sum(1 for d in subset if d['pnl_sol'] > 0) / n * 100
    pnl = sum(d['pnl_sol'] for d in subset)
    sl = sum(1 for d in subset if d['exit'] == 'SL')
    tp = sum(1 for d in subset if d['exit'] == 'TRAILING_TP')
    return n, wr, pnl, sl / n * 100, tp / n * 100, pnl / n


def make_filter(field_name: str, thresh: float) -> Callable[[dict[str, Any]], bool]:
    if field_name == 'au_hasBundler':
        return lambda d: d[field_name] == 0
    return lambda d: d[field_name] >= thresh


def make_combo_filter(
    fn1: Callable[[dict[str, Any]], bool],
    fn2: Callable[[dict[str, Any]], bool],
) -> Callable[[dict[str, Any]], bool]:
    return lambda d: fn1(d) and fn2(d)


def daily_consistency(
    data: list[dict[str, Any]],
    fn: Callable[[dict[str, Any]], bool],
    label: str,
) -> tuple[list[dict[str, Any]], int, int, int]:
    """Check if filter holds daily."""
    days: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for d in data:
        days[d['day']].append(d)

    results = []
    for day in sorted(days):
        day_data = [d for d in days[day] if fn(d)]
        all_base = analyze(days[day])
        day_filtered = analyze(day_data)
        if all_base is None or day_filtered is None:
            continue
        base_n, base_wr, base_pnl, _, _, _ = all_base
        n, wr, pnl, sl, tp, _ = day_filtered
        base_pnl_per = base_pnl / base_n if base_n > 0 else 0
        pnl_per = pnl / n if n > 0 else 0
        results.append({
            'day': day,
            'n': n,
            'wr': wr,
            'pnl': pnl,
            'pnl_per': pnl_per,
            'base_pnl_per': base_pnl_per,
            'base_n': base_n,
            'delta_per': pnl_per - base_pnl_per,
        })

    # Count positive days
    pos_days = sum(1 for r in results if r['delta_per'] > 0)
    neg_days = sum(1 for r in results if r['delta_per'] < 0)
    total_days = len(results)

    return results, pos_days, neg_days, total_days


def run_backtest(db_path: str, options: dict[str, Any] | None = None) -> None:
    if not os.path.exists(db_path):
        print(f"Error: database not found at {db_path}", file=sys.stderr)
        return

    db = sqlite3.connect(f'file:{os.path.abspath(db_path)}?mode=ro', uri=True)
    db.row_factory = sqlite3.Row

    rows = db.execute('''
        SELECT p.pnl_sol, p.pnl_percent, p.exit_reason, p.entry_mcap, p.opened_at_ms, p.closed_at_ms,
               json_extract(p.snapshot_json, '$.candidate.signals.route') as route,
               c.candidate_json
        FROM dry_run_positions p
        LEFT JOIN candidates c ON p.candidate_id = c.id
        WHERE p.status = 'closed' AND c.candidate_json IS NOT NULL
        ORDER BY p.closed_at_ms
    ''').fetchall()

    if not rows:
        print(f"No closed trades with candidate_json found in {db_path}")
        return

    # Provenance Header
    ds_hash = "unknown"
    try:
        canonical_bytes = json.dumps([dict(r) for r in rows], sort_keys=True).encode('utf-8')
        ds_hash = hashlib.sha256(canonical_bytes).hexdigest()
    except Exception as e:
        ds_hash = f"err_{type(e).__name__}"

    git_sha = "unknown"
    try:
        git_sha = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], stderr=subprocess.DEVNULL).decode().strip()
    except Exception as e:
        git_sha = f"err_{type(e).__name__}"

    print("=" * 100)
    print(f"DATABASE: {db_path} | Dataset Rows SHA-256: {ds_hash} | Git: {git_sha}")
    print("=" * 100)

    data = [extract_features(r) for r in rows]
    base_res = analyze(data)
    if base_res is None:
        print(f"Insufficient trade samples (<10 trades) in {db_path}")
        return

    base_n, base_wr, base_pnl, base_sl, base_tp, base_avg = base_res

    print(f"BASELINE: {base_n} trades | {base_wr:.1f}% WR | {base_pnl:+.3f} SOL | SL {base_sl:.1f}% | TP {base_tp:.1f}% | avg {base_avg:+.3f} SOL/trade")
    print(f"Days: {len({d['day'] for d in data})}")
    print()

    # ─── PHASE 1: Single-field threshold sweep ───
    print("=" * 100)
    print("PHASE 1: SINGLE-FIELD THRESHOLD SWEEP (top 30 by PnL delta)")
    print("=" * 100)

    fields: list[tuple[str, list[float]]] = [
        ('me_liquidity', [1000, 2000, 3000, 5000, 8000, 10000, 15000, 20000]),
        ('me_marketCap', [10000, 20000, 30000, 50000, 80000, 100000, 150000]),
        ('me_holderCount', [10, 20, 30, 50, 75, 100, 150]),
        ('me_gmgnTotalFees', [1, 3, 5, 10, 20, 50]),
        ('me_trendingVolume', [10000, 30000, 50000, 100000]),
        ('ja_bondingCurve', [50, 60, 70, 80, 85, 90, 95]),
        ('ja_organicScore', [30, 50, 70, 90]),
        ('ja_fees', [0.5, 1, 3, 5, 10]),
        ('au_topHoldersPct', [5, 10, 15, 20, 30, 50]),
        ('au_devMigrations', [3, 5, 10, 15]),
        ('au_botHoldersPct', [10, 20, 30, 50, 80]),
        ('au_hasBundler', [0.5]),
        ('ho_count', [10, 20, 30, 50, 75, 100, 150]),
        ('ho_maxHolderPercent', [5, 10, 15, 20, 30, 50]),
        ('ho_top20Percent', [20, 30, 40, 50, 60, 80]),
        ('s5m_priceChange', [-20, -10, 0, 10, 20, 50]),
        ('s5m_numNetBuyers', [-10, 0, 10, 20, 50]),
        ('s5m_numTraders', [10, 20, 50, 100, 200]),
        ('s1h_priceChange', [-50, -20, 0, 20, 50, 100]),
        ('s1h_numNetBuyers', [-50, -10, 0, 10, 50, 100]),
        ('s1h_numTraders', [50, 100, 200, 500]),
        ('buy_sell_ratio_5m', [0.5, 0.8, 1.0, 1.2, 1.5, 2.0]),
        ('buy_sell_ratio_1h', [0.5, 0.8, 1.0, 1.2, 1.5, 2.0]),
        ('net_buyer_ratio_5m', [-0.2, 0, 0.2, 0.4, 0.6]),
        ('net_buyer_ratio_1h', [-0.2, 0, 0.2, 0.4, 0.6]),
        ('fi_softScore', [30, 40, 50, 60, 70, 80]),
        ('tr_volume', [10000, 30000, 50000, 100000]),
        ('tr_change5m', [-10, -5, 0, 5, 10, 20]),
    ]

    all_results = []

    for field_name, thresholds in fields:
        for thresh in thresholds:
            label = f"{field_name} = 0" if field_name == 'au_hasBundler' else f"{field_name} >= {thresh}"
            fn = make_filter(field_name, thresh)

            subset = [d for d in data if fn(d)]
            r = analyze(subset)
            if r is None:
                continue
            n, wr, pnl, sl, tp, avg = r
            pnl_delta = pnl - base_pnl
            wr_delta = wr - base_wr

            # Daily consistency
            if pnl_delta > 0:
                daily_r, pos_d, neg_d, tot_d = daily_consistency(data, fn, label)
                if tot_d < 3:
                    continue
                consistency = pos_d / tot_d * 100
            else:
                consistency = 0

            all_results.append({
                'label': label,
                'field': field_name,
                'thresh': thresh,
                'n': n,
                'wr': wr,
                'pnl': pnl,
                'sl': sl,
                'tp': tp,
                'pnl_delta': pnl_delta,
                'wr_delta': wr_delta,
                'pct_keep': n / base_n * 100,
                'consistency': consistency,
                'fn': fn,
            })

    # Sort by PnL delta
    all_results.sort(key=lambda x: x['pnl_delta'], reverse=True)

    print(f"{'Filter':50s} | {'N':>4s} | {'WR':>6s} | {'PnL':>9s} | {'ΔPnL':>8s} | {'SL':>6s} | {'%keep':>5s} | {'Daily':>6s}")
    print("-" * 105)

    for r in all_results[:30]:
        print(f"{r['label']:50s} | {r['n']:4d} | {r['wr']:5.1f}% | {r['pnl']:+8.3f} | {r['pnl_delta']:+7.3f} | SL {r['sl']:4.1f}% | {r['pct_keep']:4.0f}% | {r['consistency']:5.0f}%")

    # ─── PHASE 2: Best combos from top-10 single fields ───
    print("\n" + "=" * 100)
    print("PHASE 2: BEST COMBOS (top 10 single fields, pairs only)")
    print("=" * 100)

    top10 = all_results[:10]
    combo_results = []

    for i, r1 in enumerate(top10):
        for r2 in top10[i + 1:]:
            fn1 = r1['fn']
            fn2 = r2['fn']
            label = f"{r1['label']} & {r2['label']}"
            combo_fn = make_combo_filter(fn1, fn2)

            subset = [d for d in data if combo_fn(d)]
            r = analyze(subset)
            if r is None:
                continue
            n, wr, pnl, sl, tp, avg = r
            pnl_delta = pnl - base_pnl

            if pnl_delta > 0:
                daily_r, pos_d, neg_d, tot_d = daily_consistency(data, combo_fn, label)
                consistency = pos_d / tot_d * 100 if tot_d >= 3 else 0
            else:
                consistency = 0

            combo_results.append({
                'label': label,
                'n': n,
                'wr': wr,
                'pnl': pnl,
                'sl': sl,
                'tp': tp,
                'pnl_delta': pnl_delta,
                'pct_keep': n / base_n * 100,
                'consistency': consistency,
            })

    combo_results.sort(key=lambda x: x['pnl_delta'], reverse=True)

    print(f"{'Filter':80s} | {'N':>4s} | {'WR':>6s} | {'PnL':>9s} | {'ΔPnL':>8s} | {'SL':>6s} | {'%keep':>5s} | {'Daily':>6s}")
    print("-" * 135)

    for r in combo_results[:20]:
        print(f"{r['label']:80s} | {r['n']:4d} | {r['wr']:5.1f}% | {r['pnl']:+8.3f} | {r['pnl_delta']:+7.3f} | SL {r['sl']:4.1f}% | {r['pct_keep']:4.0f}% | {r['consistency']:5.0f}%")

    # ─── PHASE 3: Daily consistency of top 5 filters ───
    print("\n" + "=" * 100)
    print("PHASE 3: DAILY CONSISTENCY — TOP 5 FILTERS")
    print("=" * 100)

    top_filters = all_results[:3]  # single-field top 3
    # Add top 3 combos with fn reconstructed
    for cr in combo_results[:3]:
        # Reconstruct fn from label
        label = cr['label']
        parts = label.split(' & ')
        fn1 = next((r['fn'] for r in all_results if r['label'] == parts[0]), None)
        fn2 = next((r['fn'] for r in all_results if r['label'] == parts[1]), None)
        if fn1 and fn2:
            cr['fn'] = make_combo_filter(fn1, fn2)
            top_filters.append(cr)

    for rank, f in enumerate(top_filters):
        daily_r, pos_d, neg_d, tot_d = daily_consistency(data, f['fn'], f['label'])
        print(f"\n  [{rank+1}] {f['label']}")
        print(f"      Overall: {f['n']} trades, {f['wr']:.1f}% WR, {f['pnl']:+.3f} SOL")
        print(f"      Daily consistency: {pos_d}/{tot_d} days positive ({pos_d/tot_d*100:.0f}%)" if tot_d > 0 else "      Daily consistency: N/A")
        print(f"      {'Day':12s} | {'Base N':>6s} | {'Filt N':>6s} | {'Base/t':>8s} | {'Filt/t':>8s} | {'Delta/t':>8s} | {'WR':>6s}")
        print(f"      {'-'*65}")
        for d in daily_r:
            print(f"      {d['day']:12s} | {d['base_n']:6d} | {d['n']:6d} | {d['base_pnl_per']:+7.4f} | {d['pnl_per']:+7.4f} | {d['delta_per']:+7.4f} | {d['wr']:5.1f}%")

    # ─── PHASE 4: Per-route edge ───
    print("\n" + "=" * 100)
    print("PHASE 4: PER-ROUTE EDGE")
    print("=" * 100)

    routes: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for d in data:
        routes[d['route']].append(d)

    for route in sorted(routes, key=lambda r: len(routes[r]), reverse=True):
        route_data = routes[route]
        if len(route_data) < 10:
            continue
        base_r = analyze(route_data)
        if base_r is None:
            continue

        # Find best single field for this route
        best_pnl = 0.0
        best_label = ""
        best_r = None

        for field_name, thresholds in fields:
            for thresh in thresholds:
                field_fn = make_filter(field_name, thresh)
                subset = [d for d in route_data if field_fn(d)]
                r = analyze(subset)
                if r is None:
                    continue
                n, wr, pnl, sl, tp, avg = r
                pnl_delta = pnl - base_r[2]
                if pnl_delta > best_pnl:
                    best_pnl = pnl_delta
                    best_label = f"{field_name} >= {thresh}"
                    best_r = r

        print(f"\n  {route} ({base_r[0]} trades, {base_r[1]:.1f}% WR, {base_r[2]:+.3f} SOL)")
        if best_r:
            print(f"    Best: {best_label} → {best_r[0]} trades, {best_r[1]:.1f}% WR, {best_r[2]:+.3f} SOL (+{best_pnl:+.3f})")
        else:
            print("    No filter improves PnL")

    # =========================================================================
    # SECTION 5: Profile Replays (Obicle & El Ponny Evaluation)
    # =========================================================================
    print("\n" + "=" * 80)
    print("STRATEGY PROFILE REPLAY EVALUATION")
    print("=" * 80)

    # Obicle Degen: Mcap $7k-$20k, dev_migrations <= 7
    obicle_candidates = [
        d for d in data
        if 7000 <= d['entry_mcap'] <= 20000 and d['au_devMigrations'] <= 7
    ]
    obicle_res = analyze(obicle_candidates)
    if obicle_res:
        n, wr, pnl, sl, tp, avg = obicle_res
        print(f"  [Obicle Degen ($7k-$20k mcap, dev_mig<=7)]: N={n} trades | WR={wr:.1f}% | PnL={pnl:+.4f} SOL | SL={sl} | TP={tp} | Avg={avg:+.2f}%")
    else:
        print("  [Obicle Degen]: 0 matching trades found in sample")

    # El Ponny Safe Decentralized: Top10 < 30%, Bundler < 30%, Mcap $30k-$150k
    elponny_candidates = [
        d for d in data
        if 30000 <= d['entry_mcap'] <= 150000
        and d['au_topHoldersPct'] <= 30
        and (d['au_bundlerPercent'] <= 30 or d['au_bundlerHoldingPct'] <= 30)
    ]
    elponny_res = analyze(elponny_candidates)
    if elponny_res:
        n, wr, pnl, sl, tp, avg = elponny_res
        print(f"  [El Ponny Safe (Top10<=30%, Bundler<=30%, $30k-$150k)]: N={n} trades | WR={wr:.1f}% | PnL={pnl:+.4f} SOL | SL={sl} | TP={tp} | Avg={avg:+.2f}%")
    else:
        print("  [El Ponny Safe]: 0 matching trades found in sample")

    # =========================================================================
    # SECTION 6: Portfolio Capacity Simulation & Statistical Provenance (SPEC-004)
    # =========================================================================
    print("\n" + "=" * 80)
    print("PORTFOLIO CAPACITY SIMULATION & STATISTICAL PROVENANCE (SPEC-004)")
    print("=" * 80)

    # 1. Chronological Event Simulator
    events = []
    for d in data:
        opened_ms = d.get('opened_at_ms') or 0
        closed_ms = d.get('closed_at_ms') or opened_ms + 1000
        pnl = d.get('pnl_sol') or 0
        size = 0.05
        events.append({'type': 'ENTRY', 'time': opened_ms, 'prio': 2, 'pnl': pnl, 'size': size, 'd': d})
        events.append({'type': 'EXIT', 'time': closed_ms, 'prio': 1, 'pnl': pnl, 'size': size, 'd': d})

    events.sort(key=lambda x: (x['time'], x['prio']))

    max_slots = 5
    active_count = 0
    executed = []
    skipped = []
    cash = 1.0
    peak_equity = 1.0
    max_dd_sol = 0.0

    for ev in events:
        if ev['type'] == 'EXIT':
            if ev['d'] in executed:
                active_count = max(0, active_count - 1)
                cash += (ev['size'] + ev['pnl'] - 0.0005)
                eq = cash + (active_count * ev['size'])
                if eq > peak_equity:
                    peak_equity = eq
                dd = peak_equity - eq
                if dd > max_dd_sol:
                    max_dd_sol = dd
        elif ev['type'] == 'ENTRY':
            if active_count >= max_slots or cash < ev['size']:
                skipped.append(ev['d'])
            else:
                active_count += 1
                cash -= ev['size']
                executed.append(ev['d'])

    exec_pnl = sum(d.get('pnl_sol', 0) - 0.0005 for d in executed)
    print("  Fidelity Tier: Bounded-Modeled (Realized Portfolio Events)")
    print(f"  Slots Limit: {max_slots} | Total Signals: {len(data)} | Executed: {len(executed)} | Capacity-Skipped: {len(skipped)} ({100*len(skipped)/len(data):.1f}%)" if data else "")
    print(f"  Realized Net PnL: {exec_pnl:+.4f} SOL | Realized Max Drawdown: {max_dd_sol:.4f} SOL ({(max_dd_sol/peak_equity)*100:.1f}%)" if peak_equity > 0 else "")

    # 2. Clustered Bootstrap (Day-Block)
    days_dict = defaultdict(list)
    for d in executed:
        days_dict[d['day']].append(d['pnl_sol'] - 0.0005)

    lcb95 = 0.0
    if len(days_dict) >= 5:
        import random
        random.seed(42)
        day_keys = list(days_dict.keys())
        b_means = []
        for _ in range(1000):
            resampled = []
            for _ in range(len(day_keys)):
                k = random.choice(day_keys)
                resampled.extend(days_dict[k])
            b_means.append(sum(resampled) / len(resampled) if resampled else 0)
        b_means.sort()
        try:
            lcb95 = b_means[int(len(b_means) * 0.05)]
            median = b_means[int(len(b_means) * 0.50)]
            print(f"  Clustered Bootstrap (1,000 runs, {len(day_keys)} day-blocks): Median Expectancy: {median:+.5f} SOL/trade | 95% LCB: {lcb95:+.5f} SOL/trade")
        except Exception:
            print("  Clustered Bootstrap: Error calculating bounds")
    else:
        print("  Clustered Bootstrap: INCONCLUSIVE (< 5 daily blocks found)")

    # 3. CVaR 95% Tail Risk
    pnl_list = [d['pnl_sol'] - 0.0005 for d in executed]
    pnl_list.sort()
    try:
        tail_cut = max(1, int(len(pnl_list) * 0.05))
        tail_trades = pnl_list[:tail_cut]
    except Exception:
        tail_trades = []

    if len(tail_trades) >= 5:
        cvar95 = sum(tail_trades) / len(tail_trades)
        print(f"  CVaR 95% (Expected Shortfall on worst 5% tail): {cvar95:+.5f} SOL | Worst Single: {tail_trades[0]:+.5f} SOL")
    else:
        print(f"  CVaR 95%: INSUFFICIENT_TAIL_SAMPLES (found {len(tail_trades)}, required 5)")

    # 4. 4-Stage Promotion Scorecard Check
    pf = 0.0
    wins = [p for p in pnl_list if p > 0]
    losses = [p for p in pnl_list if p <= 0]
    if losses:
        gross_loss = abs(sum(losses))
        pf = sum(wins) / gross_loss if gross_loss > 0 else 0
    elif wins:
        pf = 999.0

    pos_days = sum(1 for v in days_dict.values() if sum(v) > 0)
    day_consist = (pos_days / len(days_dict) * 100) if days_dict else 0

    print("\n  [Stage 1: Causal Replay Scorecard]")
    pass_n = len(executed) >= 50
    pass_pf = pf >= 1.2
    pass_consist = day_consist >= 70.0
    pass_lcb = lcb95 > 0
    print(f"    - Sample Size Floor (>=50): {'PASS' if pass_n else 'FAIL'} ({len(executed)} trades)")
    print(f"    - Profit Factor (>=1.20): {'PASS' if pass_pf else 'FAIL'} (PF: {pf:.2f})")
    print(f"    - Daily Consistency (>=70%): {'PASS' if pass_consist else 'FAIL'} ({day_consist:.1f}%)")
    print(f"    - 95% Bootstrap LCB (>0): {'PASS' if pass_lcb else 'FAIL'} ({lcb95:+.5f} SOL/trade)")
    stage1_status = "STAGE_1_PASS" if (pass_n and pass_pf and pass_consist and pass_lcb) else "STAGE_1_FAIL"
    print(f"    => Stage 1 Verdict: {stage1_status}")




def resolve_db_paths(cli_args: list[str]) -> list[str]:
    """Resolve SQLite database paths from CLI args, env var, or default data dir."""
    if cli_args:
        paths = []
        for arg in cli_args:
            if os.path.exists(arg):
                paths.append(arg)
            else:
                print(f"Warning: database file not found: {arg}", file=sys.stderr)
        if paths:
            return paths

    env_path = os.environ.get('CHARON_DB_PATH')
    if env_path and os.path.exists(env_path):
        return [env_path]

    # Search in ./data or ../data relative to script or cwd
    script_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(os.getcwd(), 'data'),
        os.path.join(script_dir, '..', 'data'),
        '/home/ubuntu/projects/charon',
    ]

    target_files = ['sniper_rules.sqlite', 'degen_rules.sqlite']
    found = []

    for d in candidates:
        if os.path.isdir(d):
            for name in target_files:
                p = os.path.join(d, name)
                if os.path.exists(p) and p not in found:
                    found.append(p)
            if not found:
                for p in sorted(glob.glob(os.path.join(d, '*_rules.sqlite'))):
                    if p not in found:
                        found.append(p)
            if found:
                break

    return found


def main() -> None:
    parser = argparse.ArgumentParser(description='Comprehensive edge backtest on Charon trade data.')
    parser.add_argument('--db', nargs='*', default=[], help='Path to SQLite database file(s)')
    parser.add_argument('--portfolio-sim', action='store_true', help='Run chronological portfolio simulation')
    parser.add_argument('--compare-all', action='store_true', help='Compare all registered strategies side-by-side')
    parser.add_argument('--counterfactual', action='store_true', help='Run counterfactual signal analysis on signal_captures')
    args, unknown = parser.parse_known_args()

    cli_inputs = list(args.db) + [u for u in unknown if not u.startswith('-')]
    db_paths = resolve_db_paths(cli_inputs)

    if not db_paths:
        print("Error: No valid database files found via CLI, CHARON_DB_PATH, or ./data/*.sqlite", file=sys.stderr)
        sys.exit(1)

    opts = {
        'portfolio_sim': args.portfolio_sim,
        'compare_all': args.compare_all,
        'counterfactual': args.counterfactual,
    }

    for path in db_paths:
        run_backtest(path, opts)


if __name__ == '__main__':
    main()
