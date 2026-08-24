# ADR-0004: LLM Benchmark Experiment Design

Status: Accepted (2026-08-15)
Deciders: Shiroe, Oracle second-opinion

## Context

Prior run (documented in `docs/archive/STRATEGY_ANALYSIS.md`) produced 0 LLM-issued BUY verdicts across 36 batch screens due to prompt conservatism ("unusually strong asymmetric opportunity"), plus 5-15s latency per batch. In the current 8-cell run, LLM cells had 0 trades because `LLM_API_KEY` was unconfigured until 2026-08-15.

Shiroe asked: "If we don't use LLM, will LLM improve all strategies?"

## Decision

**We do NOT know yet - any claim without data violates the research-first policy.**

Experiment design to get empirical data:

1. Enabled LLM cells using `omniroute` combo `scout` (primary) -> `code-low` (fallback) with `stream: false` forced in code (ADR-0002).
2. Run LLM cells in parallel with rule-based cells over the same candidate stream.
3. Compare head-to-head per pair:
   - `sniper-llm` vs `sniper-rules`
   - `dip_buy-llm` vs `dip_buy-rules`
   - `smart_money-llm` vs `smart_money-rules`
   - `degen-llm` vs `degen-rules`
4. Primary metric: does LLM's selectivity raise the win rate / profit factor enough to compensate for (a) latency penalty and (b) LLM API cost?

## Evaluation criteria

- LLM cell succeeds ONLY IF its net PnL / profit factor beats its rule-based pair.
- If LLM cell returns 0 BUYs or underperforms rule-based pair, rule-based wins by Ponytail (simpler, faster, cheaper).
- Minimum sample: 3-5 days of active LLM decisions.

## Consequences

- First E2E test confirmed real LLM verdicts are issued (`PASS conf 75`, rug-risk reasoning) in ~8s.
- `decision_cache` table prevents duplicate LLM calls for repeated candidates.
