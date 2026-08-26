# SPEC-004: Production-Grade Portfolio Backtesting, Forward-Capture Telemetry, and Promotion Pipeline Engine

## Problem Statement

The current backtesting toolset in `Kaiser.charon` (`scripts/comprehensive_edge_backtest.py`) has fundamental data and methodological limitations that prevent it from providing capital-grade empirical evidence:

1. **Independent Trade Assumption & Phantom Trades**: The legacy backtest evaluates every entered position as an isolated trade, ignoring portfolio-level capital constraints and concurrent position limits (`max_open_positions: 5`). In live trading, signals arriving when slots are full are dropped before persistence (`src/pipeline/orchestrator.js`), meaning the historical database cannot reconstruct true capacity-skipped opportunity loss without an immutable pre-guard signal capture.
2. **Missing Counterfactual Forward Outcomes**: Historical candidate records in the `candidates` table only store summarized metrics at the time of screening, without raw timestamped forward candle series or executable forward quotes. Furthermore, mutable candidate rows (`updated_at_ms != created_at_ms`) risk temporal leakage.
3. **Statistical Clustered Risk & Naive Bootstrap Flaws**: Memecoin trading returns exhibit heavy regime clustering (day-by-day and session-by-session dependencies). Applying naive IID per-trade bootstrap resampling produces artificially narrow confidence intervals.
4. **Promotion Gate Alignment**: The system lacks an automated quantitative scorecard reconciling `CONTEXT.md` standards with formal 4-stage deployment promotion criteria (`Causal Replay` $\rightarrow$ `Forward Shadow` $\rightarrow$ `0.05 SOL Canary` $\rightarrow$ `Scale-Up`).

## Solution

Establish a multi-tiered backtesting and telemetry architecture:

1. **Tier 1: Accepted-Position Chronological Portfolio Replay (`bounded-modeled`)**:
   - An event-driven simulator that orders historical entered positions by `opened_at_ms`, schedules exits at `closed_at_ms`, enforces `max_open_positions`, models cash balance locking, and computes **Realized-Event Equity Curves** and **Closed-Event Maximum Drawdown**.
2. **Tier 2: Single-Seam Immutable Forward-Capture Foundation (`capital-grade` telemetry)**:
   - An additive, non-blocking telemetry table (`signal_captures`) populated by a single isolated collector seam before orchestrator capacity dropping.
   - Records immutable signal timestamps (`observed_at_ms`), strategy decision outcomes, filter failure reasons, and forward price marks at predefined horizons (e.g., 5m, 15m, 1h) without duplicating Jupiter API polling across workers.
3. **Tier 3: Day-Clustered Statistical Rigor & Provenance Engine**:
   - Implements **Moving-Block / Day-Clustered Bootstrap Resampling** (1,000 to 10,000 iterations) to determine the 95% Lower Confidence Bound (LCB) of net trade expectancy.
   - Computes **Conditional Value at Risk (CVaR 95% / Expected Shortfall)** with explicit tail-sample sufficiency checks.
   - Generates reproducible report fingerprints: queried dataset SHA-256 hash, git commit SHA, strategy config hash, and deterministic random seed.
4. **Tier 4: Counterfactual Signal & False-Negative Analyzer**:
   - Analyzes accumulated Tier 2 forward captures to compute filter confusion matrices (True Positives, False Positives, True Negatives, False Negatives) and quantify **Alpha Leakage** from overly restrictive filter gates.
5. **Tier 5: Multi-Strategy Replay & 4-Stage Promotion Scorecard**:
   - CLI flags (`--portfolio-sim`, `--compare-all`, `--counterfactual`) evaluating `sniper`, `degen`, `dip_buy`, `smart_money`, `obicle_degen`, and `el_ponny` side-by-side with an automated Stage 1 promotion assessment.

## User Stories

1. As an algorithmic trader, I want to simulate chronological portfolio event order for accepted positions with strict `max_open_positions` enforcement, so that my backtested PnL reflects realistic wallet slot constraints.
2. As a risk manager, I want the portfolio simulator to compute the Realized-Event Peak-to-Trough Maximum Drawdown and drawdown duration, so that equity drawdowns are visible before capital allocation.
3. As a quantitative researcher, I want a single-seam forward telemetry collector that immutably records all incoming signals and forward price marks, so that future counterfactual backtests have point-in-time outcome data.
4. As a strategy evaluator, I want the backtest to use day-clustered bootstrap resampling rather than naive IID resampling, so that confidence intervals properly account for memecoin market regime clustering.
5. As a safety auditor, I want CVaR 95% calculations to measure tail loss severity and flag when tail sample sizes are too small to be conclusive.
6. As a compliance auditor, I want every backtest report stamped with the SHA-256 hash of the exact queried dataset rows and git commit SHA, ensuring 100% research reproducibility.
7. As a strategy developer, I want to evaluate filter confusion matrices on forward-captured signals, identifying false negatives and measuring alpha leakage from strict filter rules.
8. As a research lead, I want an automated 4-Stage Promotion Scorecard assessing whether a strategy satisfies Stage 1 Causal Replay criteria (95% bootstrap LCB $> 0$, Profit Factor $> 1.2\text{--}1.4$, positive consistency in $\ge 2$ non-overlapping windows).

## Implementation Decisions

- **Event-Driven Portfolio Simulator (`PortfolioSimulator`)**:
  - Implements deterministic event priority: at identical timestamps, exit events are processed before entry events to free slots and capital immediately.
  - Secondary tie-breaking uses event type and unique position/row ID.
  - Maintains `active_positions` dictionary, `available_slots`, `locked_capital_sol`, and `realized_cash_sol`.
  - Flags overflow signals as `capacity_skipped: true` and computes realized-event drawdown.
- **Single-Seam Forward Telemetry Foundation (`src/telemetry/forwardCapture.js`)**:
  - Additive database table `signal_captures`:
    `id, signal_id, mint, strategy_id, observed_at_ms, decision_at_ms, passed_prefilter, failure_reasons_json, entry_price_usd, forward_5m_price, forward_15m_price, forward_1h_price, capture_status, created_at_ms`.
  - Hooked into signal ingestion pipeline *before* worker position capacity drop.
  - Uses central rate-limited scheduling for forward price resolution to prevent Jupiter 429 cascades.
- **Clustered Bootstrap & Tail Risk Engine**:
  - Resamples entire calendar days (or UTC trading sessions) as discrete blocks with replacement.
  - Computes 95% bootstrap Lower Confidence Bound (empirical 5th percentile of bootstrap distribution).
  - CVaR 95%: mean return of observations at or below the 5th percentile, returning `INCONCLUSIVE` if tail count $< 5$.
  - Dataset Fingerprinting: computes `crypto.createHash('sha256').update(canonical_rows_json).digest('hex')`.
- **4-Stage Promotion Protocol**:
  - **Stage 1 (Causal Replay)**: 95% bootstrap LCB $> 0$, Profit Factor $> 1.2\text{--}1.4$, Daily positive consistency $\ge 70\%$, no single trade $> 50\%$ of profit.
  - **Stage 2 (Forward Shadow)**: Minimum $N \ge 50\text{--}100$ closed trades on live VPS dry-run matrix across $\ge 2$ non-overlapping windows.
  - **Stage 3 (Bounded Canary)**: 0.025–0.05 SOL live probe size with max cumulative loss circuit breaker (0.15 SOL).
  - **Stage 4 (Scale-Up)**: Operator-reviewed capital expansion.

## Testing Decisions

- **Simulator Unit Tests**: Validate capacity contention, deterministic tie-breaking (exit before entry), slot release, and drawdown calculations on synthetic chronological trade schedules.
- **Telemetry Unit Tests**: Validate immutable signal capture insertion, schema constraints, and fail-closed handling for missing forward marks.
- **Statistical Unit Tests**: Validate day-block bootstrap confidence intervals and CVaR calculations against known standard distributions.
- **Prior Art**: Modeled after `lp-dlmm` causal replay engine (`meridian/fight/comparative-strategy-backtest.js`) and Kaiser.charon's `test/strategy_profiles.test.js`.

## Out of Scope

- Live Solana on-chain transaction execution or wallet key management.
- Modifying PM2 worker process configuration or live matrix identities.
- Retroactive synthesis of missing historical candles for pre-capture legacy rows.

## Further Notes

- Legacy backtest results on existing databases are explicitly classified as `Tier 1: Bounded-Modeled`. Capital-grade counterfactual outcomes will unlock as Tier 2 forward captures accumulate.
