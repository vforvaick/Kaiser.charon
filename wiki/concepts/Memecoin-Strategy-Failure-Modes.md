---
type: concept
title: "Memecoin Strategy Failure Modes"
created: 2026-09-18
updated: 2026-09-18
tags:
  - concept
  - root-cause
  - risk-management
  - diagnostics
status: mature
related:
  - "[[wiki/concepts/Degen-Rules-Strategy-Profile]]"
  - "[[wiki/concepts/Buy-Sell-Ratio-Flow-Guard]]"
  - "[[wiki/concepts/Bundler-Detection-Trap]]"
sources:
  - "[[wiki/sources/kaiser-charon-fork]]"
complexity: intermediate
domain: "Algorithmic Risk Management"
aliases:
  - "Trading Failure Modes"
  - "Strategy Post-Mortem"
---

# Memecoin Strategy Failure Modes

## Overview

Analysis of 4,500+ trade records in the Kaiser.charon benchmark matrix revealed four distinct failure archetypes that explain why generic or un-tuned memecoin trading configurations systematically bleed capital.

## Archetype 1: The "100% TP Target" Trap (`smart_money-rules`)

- **Symptom**: Win rate collapsed to 18.4% with -6.51 SOL net loss across 722 trades.
- **Root Cause**: Strategy configured with `tp_percent: 100` and `trailing_enabled: false`.
- **Empirical Proof**:
  - 295 trades (40.9%) pumped $\ge +30\%$ above entry.
  - 226 trades (31.3%) pumped $\ge +50\%$ above entry.
  - Yet only 133 trades were closed in profit!
- **Mechanism**: 162 profitable surges were forced to round-trip completely into -25% stop-losses because trailing profit-taking was disabled. Additionally, `saved_wallets` was unpopulated, converting intended wallet-following into random 0.1 SOL trades.
- **Tuning Solution**: Lower base TP to 35%, activate 10% trailing stop, downsize position to 0.05 SOL.

## Archetype 2: The Top-Chasing Toxic Flow Trap (`sniper-rules`)

- **Symptom**: Rapid losses totaling -4.51 SOL across 3,635 trades with 38.3% win rate.
- **Root Cause**: `min_buy_sell_ratio_1h: 0`, `trending_max_rug_ratio: 1.0`, `trending_max_bundler_rate: 1.0`, `max_mcap_usd: 0`.
- **Empirical Proof**:
  - 1,165 losing trades (52.0% of all losses) had High Water Mark $\le 0\%$ (never saw green for even a single tick).
  - 53.4% of losses hit SL in $< 5$ minutes (29.1% in $< 1$ minute).
- **Mechanism**: Entering Jupiter trending tokens at the peak of 5-minute green candles where market makers and early snipers were actively dumping supply.
- **Tuning Solution**: Filter by `min_buy_sell_ratio_1h >= 1.5` and cap `max_mcap_usd <= 150000`. Full-sample backtest proves PnL flips from -4.51 SOL to +1.44 SOL (PF 1.38).

## Archetype 3: The Zombie Position Slot Clogging (`degen-rules` & `dip_buy-rules`)

- **Symptom**: Capacity skip rate reached 14% to 85%, missing subsequent fresh runner entries.
- **Root Cause**: `max_hold_ms: 0` (unlimited hold duration without timeout).
- **Empirical Proof**:
  - 51.2% of losing trades took $> 1$ hour to slowly bleed into Stop Loss.
  - Zombie positions routinely sat in slots for 10 to 35 hours (`$Peigengoo` 20h, `$Slop` 35h).
- **Mechanism**: Max open position limit (e.g. 5/5) remained permanently saturated by stagnant tokens, blocking fresh entry signals.
- **Tuning Solution**: Enforce `max_hold_ms: 14400000` (4 hours) timeout to automatically liberate capacity.

## Archetype 4: The Outlier Profit Mirage (`dip_buy-rules`)

- **Symptom**: Apparent massive profitability (+95.32 SOL raw NAV).
- **Root Cause**: Extreme single-trade concentration disqualifying organic reproducibility.
- **Empirical Proof**:
  - 1 single trade (`$WROON100`) accounted for **100.3% of total profits** (+95.56 SOL, a 191,000% jump on manipulated liquidity).
  - The remaining 93 organic trades lost -0.2434 SOL with a dismal 0.68 Profit Factor and 29.0% Win Rate.
- **Governance Gate**: ADR-0006 mandates disqualifying any strategy where a single trade contributes $> 50\%$ of profits.
