---
type: meta
title: "Hot Cache"
updated: 2026-08-27T07:30:00
---

# Recent Context

## Last Updated

2026-08-27. Landed SPEC-004 (Backtest Revamp), SPEC-005 (Live Canary Risk Controls & Degen Tuning), and ADR-0006.

## Key Recent Facts

- **Live Benchmark Status**: `degen-rules` is the primary advancing candidate: **Realized NAV 1.301 SOL (+30.1% / +0.3011 SOL)** across $N=174$ closed trades.
- **Degen Mcap Tuning**: Tuned canonical corridor to $25k–$80k, cutting unprofitable upper-bucket drag.
- **Fail-Closed Circuit Breakers**: Full pre-swap risk controller active in `circuitBreakers.js` (daily loss 0.025 SOL, 3 consecutive losses, 7d loss 0.075 SOL, canary lifetime 0.15 SOL, slippage 500 bps, stale quotes >30s, API backoff).
- **Telemetry Resolver Online**: Single-worker designated resolution active on `charon-sniper-rules`, accumulating 7,300+ complete forward captures across all cell databases.
- **4-Stage Promotion Pipeline**: Formally documented in ADR-0006 (`Causal Replay` -> `Forward Shadow` -> `0.025 SOL Canary` -> `Scale-Up`).

## Recent Pages Created

- ADRs: `docs/adr/0006-backtesting-revamp-risk-controls-and-degen-tuning.md`
- Specs: `docs/specs/0002-backtest-system-enhancements.md`, `docs/specs/0003-canary-circuit-breakers-and-telemetry-isolation.md`
- Modules: `src/execution/circuitBreakers.js`, `src/telemetry/forwardCapture.js`, `src/backtest/portfolioSimulator.js`, `src/backtest/statisticalRigor.js`, `src/backtest/promotionScorecard.js`

## Active Threads

- Accumulate Stage 2 Forward Shadow sample on `degen-rules` toward $N \ge 250\text{--}300$ trades.
- Analyze initial forward-capture confusion matrix for false-negative alpha leakage.
