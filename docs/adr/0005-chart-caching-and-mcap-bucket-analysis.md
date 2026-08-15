# 0005. Chart Caching, Rate-Limit Isolation, and Degen Mcap Bucket Findings

Date: 2026-08-15
Status: Accepted

## Context

During dry-run benchmark monitoring on VPS `fight-uno`, open positions in `degen-rules` remained open for >90 hours while PM2 logs exhibited continuous HTTP 429 rate-limiting from `datapi.jup.ag`.
Analysis revealed that each process tick invoked `fetchJupiterChartContext()`, issuing 3 HTTP requests per open position.
Across 8 parallel PM2 matrix processes with 13+ open positions, ~40 requests per tick flooded `datapi.jup.ag`, causing HTTP 429 backoff that prevented price updates and exit evaluation.

Simultaneously, `degen-rules` reached $n = 60$ closed trades, providing sufficient sample size ($n \ge 50$) for trade-level empirical analysis.

## Decision

1. **Per-Process Chart Caching & Rate-Limit Isolation**:
   - Implemented a 60-second TTL in-memory cache (`jupiterChartCache`) for `fetchJupiterChartContext()`.
   - Created an independent `jupiterChartBackoffUntil` timestamp for chart endpoints.
     HTTP 429 rate limits on `datapi.jup.ag` chart queries no longer activate global quote backoff (`quoteBackoffUntil`), ensuring spot price quotes on `lite-api.jup.ag` remain available for TP/SL exit monitoring.
   - Added 0–2000ms random startup jitter to desynchronize poll ticks across the 8 PM2 processes.

2. **Matrix Integrity over Strategy Pruning**:
   - Evaluated and **rejected** disabling failing rules cells to reduce API load.
   - Preserved all 8 cells to maintain control group parity between Rules and LLM pairs across identical market windows.
   - API quota pressure is solved via infrastructure caching rather than destroying experiment validity.

3. **Logger & Setting Alignment**:
   - Fixed `orchestrator.js` logger to display `strat.max_open_positions` (5/5 for `degen`) rather than global default setting `numSetting('max_open_positions', 3)`.

4. **Empirical Trade-Level Findings ($n = 60$ closed trades in `degen-rules`)**:
   - Exit breakdown: 41 SL (-0.3842 SOL), 19 TRAILING_TP (+0.3274 SOL). Net: -0.0568 SOL.
   - Market cap bucket analysis:
     - $<40\text{k}$: 16 trades, win rate 31.3%, -0.0306 SOL
     - $40\text{k}\text{--}60\text{k}$: 23 trades, win rate 43.5%, +0.0509 SOL (Profitable sweet spot)
     - $60\text{k}\text{--}80\text{k}$: 16 trades, win rate 18.8%, -0.0504 SOL
     - $>80\text{k}$: 5 trades, win rate 20.0%, -0.0267 SOL
   - Strategy tuning (restricting `degen` to $40\text{k}\text{--}60\text{k}$) is **deferred** to prevent overfitting until post-fix trade sample reaches $n \ge 50$.

## Consequences

- **Positive**:
  - Chart API traffic reduced by ~80-90%.
  - Spot price exit monitoring remains fully functional even when chart endpoints rate-limit.
  - Multi-process PM2 poll spikes are desynchronized via jitter.
  - Benchmark matrix control group parity is preserved.
- **Risks**:
  - Chart ATR dynamic stop loss updates are subject to 60s cache resolution (well within 5m candle resolution).
