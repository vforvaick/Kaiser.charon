---
type: meta
title: "Hot Cache"
updated: 2026-09-18T15:00:00
---

# Recent Context

## Last Updated

2026-09-18. Landed ADR-0007 transitioning Kaiser.charon to a lean 4-cell Rules Matrix and retiring the 4 LLM benchmark cells.

## Key Recent Facts

- **Rules Won Head-to-Head (ADR-0007)**: 34-day longitudinal benchmark (37,263 batches) proved Rules decisively beat LLMs on win rate (35.8% vs 18.9%), net PnL (+86.3 SOL vs -0.84 SOL), latency (<5ms vs 8-15s), and operational costs.
- **Matrix Reduced to 4 Lean Workers**: `ecosystem.matrix.config.cjs` now runs exclusively the 4 tuned rules cells (`degen-rules`, `sniper-rules`, `smart_money-rules`, `dip_buy-rules`), cutting VPS CPU and memory consumption in half.
- **Comprehensive Strategy Tuning**:
  - `sniper`: `min_buy_sell_ratio_1h: 1.5`, `max_mcap_usd: 150k` (slashes 52% instant dumps, backtested PnL flip to +1.44 SOL).
  - `smart_money`: `tp_percent: 35`, `sl_percent: -15`, `trailing: 10%`, `size: 0.05 SOL` (rescues 162 profitable pumps from round-tripping into SL).
  - `degen` & `dip_buy`: `max_hold_ms: 14400000` (4h timeout prevents dead zombie positions from clogging slots).
- **Fail-Closed Risk & Telemetry**: Full pre-swap circuit breaker suite in `circuitBreakers.js` and single-process forward mark resolution on `charon-sniper-rules`.

## Recent Pages Created

- ADRs: `docs/adr/0007-rules-only-matrix-and-llm-retirement.md`
- Audits: `scripts/run_promotion_audit.js`, `scripts/run_counterfactual_analysis.js`

## Active Threads

- Monitor the 4-cell tuned rules matrix on VPS `fight-uno` toward Stage 3 Canary qualification.
