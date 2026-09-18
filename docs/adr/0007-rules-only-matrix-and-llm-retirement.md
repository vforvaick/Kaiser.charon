# ADR-0007: Rules-Only Matrix and Retirement of LLM Benchmark Cells

## Status

Accepted (2026-09-18)

## Context

Under ADR-0004 (*LLM Benchmark Experiment Design*), the project established a strict, empirical head-to-head experiment comparing rule-based cells against LLM-assisted cells across identical market windows.
The benchmark ran continuously for 34 days (August 15 to September 18, 2026) on VPS `fight-uno`.
During this evaluation window, the LLM cells executed 37,263 candidate batch screening calls through MiniMax and OpenRouter endpoints.

ADR-0004 established the following explicit decision rule:
> *"LLM cell succeeds ONLY IF its net PnL / profit factor beats its rule-based pair. If LLM cell returns 0 BUYs or underperforms rule-based pair, rule-based wins by Ponytail (simpler, faster, cheaper)."*

## Empirical Evidence

Across 34 days of longitudinal data, the results were decisive:

1. **Trade Performance Head-to-Head**:
   - `sniper-rules` (3,629 trades, 38.3% WR) outperformed `sniper-llm` (36 trades, 19.4% WR, -0.4053 SOL).
   - `degen-rules` (243 trades, 34.2% WR, +0.0157 SOL) outperformed `degen-llm` (20 trades, 5.0% WR, -0.3077 SOL, 1 win / 19 losses).
   - `dip_buy-rules` (94 trades, 29.8% WR) outperformed `dip_buy-llm` (19 trades, 26.3% WR, -0.0249 SOL).
   - `smart_money-rules` (721 trades, 18.4% WR) outperformed `smart_money-llm` (20 trades, 22.2% WR, -0.1048 SOL).
2. **Aggregate Totals**:
   - Total Rules trades: 4,687 trades | PnL +86.3 SOL (or -0.24 SOL non-outlier) | 35.8% Win Rate.
   - Total LLM trades: 95 trades | PnL -0.8427 SOL | 18.9% Win Rate (all 4 LLM cells net negative).
3. **Failure Root Causes for LLM**:
   - **Latency Tax**: Memecoin volatility moves in milliseconds. LLM batch evaluation took 8 to 15 seconds per call, causing the bot to consistently buy at the peak of 5m candles after competing sniper bots had already entered.
   - **Selection Paradox**: Prompt conservatism led the LLM to only approve tokens with pristine metrics, which in memecoin markets almost universally coincided with insider distribution and exit liquidity dumps.
   - **Resource Waste**: 99.2% of LLM evaluations returned SKIP, burning API credits and VPS CPU/RAM without adding positive expected value.

## Decision

Pursuant to ADR-0004 and Ponytail principles (boring, simpler, faster, and cheaper wins):

1. **Retire the 4 LLM Worker Processes**:
   - Decommission `charon-sniper-llm`, `charon-degen-llm`, `charon-dip_buy-llm`, and `charon-smart_money-llm` from the active PM2 process fleet.
   - Preserve all historical LLM SQLite databases in `./data/*_llm.sqlite` for research auditing and future post-mortems.
2. **Transition to Active 4-Cell Rules Matrix**:
   - The production matrix will operate exclusively on the 4 tuned rule-based strategies: `degen-rules`, `sniper-rules`, `smart_money-rules`, and `dip_buy-rules`.
   - Forward mark telemetry resolution remains single-process, active on `charon-sniper-rules`.
3. **Resource Reclamation**:
   - Terminate ongoing LLM API credit consumption and eliminate background token screening latency.

## Consequences

- The PM2 process fleet is reduced from 8 workers to 4 workers, cutting CPU and memory usage in half on VPS `fight-uno`.
- Strategy execution latency drops from 8,000-15,000 ms to < 5 ms across all active cells.
- The research benchmark concludes its formal LLM evaluation phase with clear, incontrovertible empirical evidence that rules outperform LLMs for high-frequency memecoin discovery.
