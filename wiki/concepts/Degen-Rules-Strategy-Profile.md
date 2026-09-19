---
type: concept
title: "Degen-Rules Strategy Profile"
created: 2026-09-18
updated: 2026-09-18
tags:
  - concept
  - trading-strategy
  - empirical-evidence
  - degen
status: mature
related:
  - "[[wiki/concepts/8-Cell-Benchmark-Matrix]]"
  - "[[wiki/concepts/Obicle-Degen-Strategy]]"
  - "[[wiki/concepts/Memecoin-Strategy-Failure-Modes]]"
sources:
  - "[[wiki/sources/kaiser-charon-fork]]"
complexity: intermediate
domain: "Quantitative Memecoin Trading"
aliases:
  - "Canonical Degen"
  - "degen-rules"
---

# Degen-Rules Strategy Profile

## Definition

**`degen-rules`** is the primary advancing trading strategy in Kaiser.charon. It operates as a deterministic rule-based engine targeting micro-cap bonding curve and early DEX graduation tokens in a strictly bounded market cap corridor ($25,000 to $80,000 USD).

## Canonical Configuration (Tuned via SPEC-005)

- **Market Cap Corridor**: `min_mcap_usd: 25000`, `max_mcap_usd: 80000` (tuned from 100k to cut negative EV in the >$80k bucket).
- **Position Sizing & Limits**: `position_size_sol: 0.05`, `max_open_positions: 5`.
- **Take Profit & Trailing**: `tp_percent: 30`, `trailing_enabled: true`, `trailing_percent: 10`.
- **Stop Loss**: `sl_percent: -15`.
- **Max Hold Timeout**: `max_hold_ms: 14400000` (4 hours timeout preventing zombie slot clogging).
- **Holder & Flow Filters**: `min_holders: 30`, `max_top20_holder_percent: 100`, `trending_max_rug_ratio: 0.5`, `trending_max_bundler_rate: 0.7`.

## Empirical Performance (39.7 Calendar Days / 22 Active Trading Days)

Accumulated over 252 closed trades on VPS `fight-uno` (August 10 – September 18, 2026):

| Evaluation Mode | Trades ($N$) | Net PnL (SOL) | Return (%) | Win Rate | Profit Factor |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Realized Portofolio (Bounded-Modeled)** | **218 executed** (34 skipped) | **`+0.1338 SOL`** | **`+13.4%`** | **35.3%** | **1.10** |
| **Raw Cumulative (Unconstrained)** | **252 total** | **`+0.2363 SOL`** | **`+23.6%`** | **35.7%** | **1.16** |

### Phase Breakdown

1. **Phase 1 (Aug 10 – Aug 27, 17 active days)**: 179 trades | Net PnL `+0.3002 SOL (+30.0%)` | Strong bonding curve tail momentum.
2. **Freeze Window (Aug 27 – Sep 14, 18 days)**: 0 trades (system paused by mode-wide circuit breaker latch).
3. **Phase 2 (Sep 14 – Sep 18, 4 active days)**: 73 trades | Net PnL `-0.0639 SOL (-6.4%)` | Absorbed severe market-wide dump with tight -15% SL cuts, then rebounded on Sep 17-18 (+0.0110 SOL batch).

## Market Cap Corridor Attribution

Empirical analysis across 168 initial trades proved that profitability is heavily concentrated:

- **$40k – $60k (Sweet Spot)**: $N=66$ | Net PnL `+0.2267 SOL` | WR 45.5% | PF 1.67
- **$60k – $80k (Moderate)**: $N=40$ | Net PnL `+0.0183 SOL` | WR 32.5% | PF 1.08
- **> $80k (Negative EV Drag)**: $N=20$ | Net PnL `-0.0414 SOL` | WR 25.0% | PF 0.69 (Eliminated in SPEC-005)

## Stage 2 Promotion Assessment

- Meets Sample Size Floor ($N=218 \ge 50$).
- Positive net return on portfolio (`+13.4%` net of fees).
- Rebounded post-dump, but requires 95% Bootstrap LCB to turn strictly $>0$ and Daily Consistency to reach $\ge 70\%$ before Stage 3 Real-Money Canary.
