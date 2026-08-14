# ADR-0003: First Data-Grounded Tuning Round (sniper mcap, smart_money trailing)

Status: Accepted (2026-08-15)
Deciders: Shiroe
Data span: 2.7 days / 65h, per-cell trade counts below.

## Context

First benchmark read-out showed every cell negative on top-line net PnL. Policy (AGENTS.md) requires root-causing trade-level data before any recommendation. One initially-proposed action ("pause smart_money - it's broken") was retracted after data analysis proved it wrong.

## Data findings (rule-based cells)

| Cell | n closed | WR actual | WR break-even | Gap | PF | Root cause |
| --- | --- | --- | --- | --- | --- | --- |
| sniper-rules | 555 | 36.8% | 41.5% | -4.8pp | 0.82 | entry quality (bad mcap bucket) |
| smart_money-rules | 239 | 15.5% | 24.4% | -8.9pp | 0.54 | exit config, NOT strategy |
| dip_buy-rules | 27 | 29.6% | 32.5% | -2.8pp | 1.03 | sample too small |
| degen-rules | 47 | 36.2% | 35.5% | +0.7pp | 1.03 | already above break-even |

Key evidence:

- **smart_money**: 119/202 SL trades (59%) peaked positive before dumping (49 peaked +5-20%, 38 peaked +20-50%, 32 peaked +50-100%). `trailing_enabled=false` + hard TP +100% converts winners into SL losses. Conservative rescue simulation: -3.45 SOL -> +2.13 SOL.
- **sniper**: mcap <30k bucket = 90 trades averaging -1.8% (worst bucket). Cutting it is mechanical, low-overfit.
- **Session-time windows REJECTED by data**: user-proposed 4 WIB windows selected WORSE trades (PF 0.74) than the excluded set (PF 0.86). The tempting "profitable hours" set (1-7h+20h UTC, PF 1.17) is driven by a single hour (03h UTC, n=26, +0.225 SOL) - classic single-driver overfit at 2.7-day sample.

## Decision

Applied to cell DBs on fight-uno (hot-read, no restart needed):

1. `sniper-rules`: `min_mcap_usd` 25000 -> 30000.
2. `smart_money-rules`: `trailing_enabled` false -> true, `trailing_percent` 15.
3. `dip_buy-rules` and `degen-rules`: NO change (insufficient sample / already positive).
4. Session-time filter: deferred, re-evaluate at 5-7 days when per-hour n >= 50.

## Consequences

- Data collected after 2026-08-15 is post-tuning; pre/post comparison is direct.
- Re-evaluation gate: wait for >=100 closed trades per tuned cell before judging the tuning.
- Lesson codified in AGENTS.md: never recommend from top-line metrics; root-cause exit-reason breakdown, peak-gain distribution, mcap buckets first.
