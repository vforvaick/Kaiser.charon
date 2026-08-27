# SPEC-005: Live Canary Risk Controls, Degen Strategy Tuning, and Telemetry Worker Isolation

## Problem Statement

Following comprehensive quantitative backtesting across 3,645+ live dry-run matrix trades and second-opinion architectural validation, three critical system gaps prevent `Kaiser.charon` from safely bridging Stage 2 (Forward Shadow) to Stage 3 (Bounded Real Money Canary):

1. **Absence of Hard Loss Circuit Breakers**: The current execution codebase enforces position concurrency (`max_open_positions`), duplicate symbol locks, and past-win cooldowns, but completely lacks runtime capital loss circuit breakers (daily loss limits, consecutive loss trips, rolling drawdown stops, and lifetime canary loss ceilings). Without durable fail-closed circuit breakers, live capital cannot be deployed safely.
2. **Strategy Drag in the >$80k Mcap Corridor**: Empirical trade-level data on 168 closed `degen-rules` trades reveals that positions entered above $80,000 market cap suffer negative expected value (-0.0414 SOL net PnL, 25.0% win rate, 0.69 profit factor), dragging down the overall strategy profit factor from 1.36 to 1.27.
3. **Telemetry Multi-Process API Contention**: The background forward mark resolver currently initializes an independent interval timer inside every PM2 worker process (`src/app.js`), multiplying periodic Jupiter price polling requests by 8x and risking API gateway rate limits (429 errors).
4. **Discrepancies in Backtest CLI Parameters & Governance**: The Python backtest simulator previously used fixed parameters (0.05 SOL size, 5 slots) across all strategy replays instead of reading dynamic strategy configuration definitions from the database seed, and did not fully reconcile the multi-window consistency requirements of `CONTEXT.md`.

## Solution

1. **Durable Fail-Closed Risk & Circuit Breaker Subsystem**:
   - Implement an automated risk controller module enforcing:
     - **Per-Trade Emergency Loss Cap**: Hard kill-switch if single-trade loss exceeds 0.005 SOL (-20%).
     - **Daily Realized Loss Circuit Breaker**: Immediate execution halt if calendar-day losses reach 0.025 SOL or if 3 consecutive losses occur.
     - **Rolling 7-Day & Lifetime Canary Breaker**: Persistent shutoff if 7-day loss exceeds 0.075 SOL or lifetime canary drawdown hits 0.15 SOL (manual operator reset required).
     - **Operational Circuit Breaker**: Automatic entry freeze if quote slippage $> 5\%$, quotes are stale ($>30\text{s}$), or API 429 backoff is active.
2. **Degen Strategy Mcap Tuning ($25k–$80k)**:
   - Update canonical `degen` strategy configuration to restrict entries to the high-conviction $25k–$80k corridor (`min_mcap_usd: 25000, max_mcap_usd: 80000`), cutting unprofitable upper-bucket drag and elevating baseline profit factor to 1.36.
3. **Single-Process Dedicated Telemetry Forward Resolver**:
   - Isolate the forward price mark resolver into a dedicated process or primary-worker instance (`FORWARD_RESOLVER_ENABLED=true`), eliminating duplicate 8x background polling.
4. **Dynamic Configuration Backtest Runner & Reconciled Promotion Scorecard**:
   - Update `comprehensive_edge_backtest.py` to extract dynamic strategy position sizes and slot limits directly from the database or CLI options.
   - Enforce reconciled Stage 1 scorecard criteria: $N \ge 50$ trades, Profit Factor $\ge 1.20$, 95% Bootstrap LCB $> 0$, Daily Positive Consistency $\ge 70\%$, Positive PnL in $\ge 2$ non-overlapping time windows, and single trade profit contribution $\le 50\%$.

## User Stories

1. As a live capital operator, I want the bot to automatically halt trading if daily losses hit 0.025 SOL, so that daily capital drawdown is strictly capped.
2. As a risk manager, I want an automatic trading halt after 3 consecutive loss trades, so that the bot pauses during hostile or illiquid market regimes.
3. As a portfolio protector, I want a lifetime canary circuit breaker that locks execution if cumulative losses reach 0.15 SOL, requiring an explicit manual operator reset before resuming.
4. As an automated trader, I want an emergency stop triggered if single-position loss reaches 0.005 SOL, so that tail-risk slippage and flash dumps are mitigated.
5. As an execution engineer, I want entries blocked if quote-to-fill slippage exceeds 5% or API error rates spike, preventing entries during network degradation.
6. As a strategy researcher, I want the `degen` strategy mcap ceiling lowered from $100k to $80k, so that capital is concentrated in the proven $40k–$60k sweet spot and protected from the negative >$80k bucket.
7. As an infrastructure engineer, I want forward telemetry marks resolved by exactly one dedicated background worker, so that Jupiter API quotas are preserved and 429 errors are prevented.
8. As a quantitative analyst, I want the Python backtester to dynamically simulate exact strategy configuration parameters (sizing and slots), ensuring that backtests reflect true strategy profiles.
9. As a governance lead, I want the promotion scorecard to verify positive PnL across at least two non-overlapping chronological halves, ensuring that edge is persistent and not an artifact of a single lucky window.
10. As an automated auditor, I want all circuit breaker trips, latches, and resets logged to a dedicated audit table in SQLite, ensuring full post-mortem visibility.

## Implementation Decisions

- **Risk Controller Module (`src/execution/circuitBreakers.js`)**:
  - State machine tracking: `daily_realized_loss_sol`, `consecutive_loss_count`, `rolling_7d_loss_sol`, `lifetime_canary_loss_sol`, and `is_circuit_breaker_latched`.
  - Stored in SQLite table `risk_circuit_breakers` to ensure persistence across process restarts.
  - Method `canOpenPositionRiskCheck({ strategyId, sizeSol, mode })`:
    - Evaluates daily loss $\le 0.025$ SOL.
    - Evaluates consecutive losses $< 3$.
    - Evaluates lifetime canary cumulative loss $< 0.15$ SOL.
    - Evaluates quote age and slippage thresholds.
    - Returns `{ allowed: boolean, reason?: string }`.
  - Method `tripCircuitBreaker(breakerType, reason)` and `resetCircuitBreaker(operatorSignature)`.
- **Pre-Execution Pipeline Seam**:
  - Wire `canOpenPositionRiskCheck` into `src/pipeline/orchestrator.js` and `src/liveExecutor.js` as a mandatory pre-entry gate preceding transaction building.
- **Strategy Tuning (`src/db/connection.js`)**:
  - Update `degen` seed configuration: `max_mcap_usd: 80000` (was 100000).
- **Dedicated Telemetry Worker Configuration (`src/app.js` & `ecosystem.matrix.config.cjs`)**:
  - Forward mark resolver is executed only when `process.env.ENABLE_FORWARD_RESOLVER === 'true'` (defaulting to primary worker or dedicated process), preventing multi-process duplicate polling.
- **Backtest CLI & Promotion Governance (`scripts/comprehensive_edge_backtest.py` & `src/backtest/promotionScorecard.js`)**:
  - Backtest extracts `position_size_sol` and `max_open_positions` from the specific strategy row in the SQLite database.
  - Adds chronological two-window split validation (First Half vs Second Half PnL) to the Stage 1 scorecard checks.

## Testing Decisions

- **Circuit Breaker Unit Tests**:
  - Test that 3 consecutive loss closes trip the consecutive-loss breaker and reject subsequent entry intents.
  - Test that daily loss accumulation exceeding 0.025 SOL trips the daily-loss breaker.
  - Test that lifetime loss reaching 0.15 SOL latches the canary breaker and persists across state reloads.
  - Test that manual operator reset cleanly clears the latch and restores trading status.
  - Test that stale quote (>30s) or high slippage (>5%) blocks entry.
- **Strategy Parameter Tests**:
  - Test that `degen` strategy rejects candidates at $85k mcap and passes candidates at $50k mcap.
- **Telemetry Isolation Tests**:
  - Test that forward mark resolver does not initialize when `ENABLE_FORWARD_RESOLVER` is false or unset.
- **Prior Art**: Modeled after `lp-dlmm` canary risk controls and Kaiser.charon's `test/strategy_profiles.test.js`.

## Out of Scope

- Multi-signature on-chain wallet governance.
- Deploying live real money prior to formal operator review of forward shadow data.
- Modifying underlying Solana RPC node websocket streams.

## Further Notes

- This specification satisfies the mandatory prerequisites highlighted in the Oracle review for future Stage 3 canary deployment while optimizing Stage 2 forward shadow performance.
