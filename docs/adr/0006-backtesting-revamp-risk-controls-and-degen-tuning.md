# ADR-0006: SPEC-004 Backtesting Revamp, SPEC-005 Risk Controls, and Degen Mcap Tuning

## Status

Accepted

## Context

Across August 2026, the 8-cell dry-run benchmark matrix accumulated 3,600+ closed trades. Comprehensive quantitative backtesting revealed that `degen-rules` was the sole systematically profitable strategy (+0.2538 SOL raw PnL, 2.06x payoff ratio), while `sniper-rules` suffered heavy stop-loss drag (-4.4121 SOL). Two independent Oracle reviews identified architectural and data integrity blockers:

1. Legacy backtesting evaluated trades independently, ignoring portfolio slot constraints (`max_open_positions: 5`).
2. Candidate snapshots stored summarized metrics without raw forward prices, precluding counterfactual false-negative analysis.
3. Pre-swap execution paths lacked durable, fail-closed runtime circuit breakers.
4. Telemetry forward price resolution ran in all 8 PM2 workers, creating Jupiter API 429 contention.
5. In `degen-rules`, entries with mcap > $80,000 had negative expected value (-0.0414 SOL, PF 0.69, WR 25.0%).

## Decisions

1. **Adopted 4-Stage Promotion Pipeline & SPEC-004 Backtest Architecture**:
   - **Stage 1 (Causal Replay)**: PortfolioSimulator enforcing slot contention, 95% Day-Clustered Bootstrap LCB > 0, Profit Factor >= 1.20, Daily Win Consistency >= 70%, two positive non-overlapping windows (H1 & H2 > 0), and single trade profit <= 50%.
   - **Stage 2 (Forward Shadow)**: Minimum N >= 100 closed trades on live VPS matrix across >= 2 non-overlapping windows.
   - **Stage 3 (0.025 SOL Canary)**: Bounded live deployment with hard circuit breakers.
   - **Stage 4 (Scale-Up)**: Operator-reviewed capital expansion.
2. **Single-Seam Forward Telemetry (`signal_captures`)**:
   - Asynchronous queue-based signal capture hooked before worker capacity drops.
   - Forward mark resolution isolated to a single designated PM2 worker (`ENABLE_FORWARD_RESOLVER=true`), cross-scanning all cell databases under a global budget.
3. **Fail-Closed Runtime Circuit Breakers (`circuitBreakers.js`)**:
   - Daily loss limit (0.025 SOL), 3 consecutive losses, rolling 7-day loss (0.075 SOL), lifetime canary loss (0.15 SOL), stale quotes (>30s), slippage (>500 bps), and Jupiter API backoff.
   - Centralized inside `withEntryLock()` pre-swap gate across all automated and manual live buy paths.
4. **Tuned Canonical Degen Strategy**:
   - Capped `max_mcap_usd` to $80,000 (was $100,000), eliminating drag from the unprofitable >$80k bucket.
5. **Test Suite Isolation**:
   - Configured `test/setup.js` creating temporary isolated SQLite databases for test executions, eliminating test mutation on production data.

## Consequences

- `degen-rules` is designated as the sole primary candidate advancing through Stage 2 Forward Shadow ($N=174$, Realized NAV 1.301 SOL, +30.1%).
- Forward telemetry has begun collecting point-in-time forward marks (3,800+ completed captures) to power future counterfactual alpha-leakage analysis.
- Live entries are strictly guarded by fail-closed circuit breakers.
