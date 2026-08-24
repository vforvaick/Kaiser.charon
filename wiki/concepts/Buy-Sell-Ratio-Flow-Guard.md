---
type: concept
title: "Buy-Sell Ratio Flow Guard"
created: 2026-08-25
updated: 2026-08-25
tags:
  - concept
  - trading-edge
  - flow-filter
status: mature
related:
  - "[[wiki/entities/Kaiser-Charon]]"
  - "[[wiki/concepts/8-Cell-Benchmark-Matrix]]"
sources:
  - "[[wiki/sources/kaiser-charon-fork]]"
complexity: intermediate
domain: "Quantitative Trading & Order Flow"
aliases:
  - "Buy-Pressure Guard"
  - "1h Buy-Sell Ratio"
---

# Buy-Sell Ratio Flow Guard

## Definition

The **Buy-Sell Ratio Flow Guard** is a pre-filter check that computes net buying pressure over 1-hour and 5-minute windows:

$$\text{Ratio}_{1\text{h}} = \frac{\text{BuyVolume}_{1\text{h}}}{\text{SellVolume}_{1\text{h}}}$$

It acts as an empirical filter to eliminate tokens where selling volume outpaces organic buyer interest, effectively filtering out post-pump dumps and slow bleed rugs.

## Empirical Evidence & Holdout Evaluation

In a full-sample backtest of 1,917 closed positions on `sniper_rules.sqlite`:

- Requiring $\text{Ratio}_{1\text{h}} \ge 2.0$ slashed the Stop-Loss (SL) rate from **39.4% down to 9.8%**, turning overall PnL from -3.201 SOL to +0.460 SOL with a 92% daily win consistency.

### Chronological Holdout Split (Aug 10–15 vs Aug 16–21)

Rigorous holdout testing revealed important regime dependence:

- **Train Window (Aug 10–15, $N=1,084$)**: Baseline PnL -1.034 SOL. With $\ge 2.0$: **+0.4918 SOL** (SL 7.2%).
- **Test Window (Aug 16–21, $N=836$)**: Baseline PnL -2.135 SOL. With $\ge 2.0$: **-0.0828 SOL** (SL 6.9%).

### Key Takeaway

While the filter successfully suppresses ~80% of stop-losses across both regimes, overall profitability in adverse markets requires additional momentum scoring. Hence, the parameter is maintained with full infrastructure support (`min_buy_sell_ratio_1h: 0`) and enabled only after validated multi-week holdout confirmation.
