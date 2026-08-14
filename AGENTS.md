# AGENTS.md

## Research-first repo

This repo is a research benchmark for memecoin trading strategies, not a production trading system.
Every recommendation, tuning, improvement, or decision the agent proposes must be grounded in the
collected dry-run data (SQLite per-cell databases under `./data/`, aggregated via `scripts/matrix_reporter.js`).
Never propose a change from intuition or convention alone; always cite the metric, trade count, or
benchmark finding that justifies it.

When presenting options, give the data behind each option (trade count, win rate, profit factor,
drawdown, sample span) and the risk of acting on insufficient sample.

## Verify-validate with data before recommending

Before proposing any recommendation (tuning, pause, enable, disable, refactor), run the data analysis
that proves it.
Do NOT recommend "pause strategy X" or "strategy X is broken" based on a single top-line metric
(net PnL, profit factor) alone.
Root-cause the failure or the opportunity using the trade-level data first:
exit-reason breakdown, peak unrealized gain distribution (high_water vs entry), mcap buckets,
win/loss size asymmetry, session/time windows, and sample span.
Only then state the recommendation with the evidence that supports it.
This prevents misdirected debugging and wasted cycles on the wrong fix.

## Critical Gotchas (PM2 & Doppler)

- **PM2 env refresh trap**: `pm2 restart <app> --update-env` does NOT re-fetch Doppler secrets; it reuses stale env. To apply new Doppler secrets: `pm2 delete ecosystem.matrix.config.cjs && doppler run -- pm2 start ecosystem.matrix.config.cjs && pm2 save`. (ADR-0002)
- **Omniroute non-stream requirement**: Omniroute multi-model combos (scout/code-low) default to SSE streaming. `src/pipeline/llm.js` MUST set `stream: false` in the body payload, otherwise axios hangs 25s waiting for a non-stream response. (ADR-0002)

## Agent skills

### Issue tracker

Issues and specs for this repo live as GitHub issues. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context repository layout (`CONTEXT.md` + `docs/adr/` at root). See `docs/agents/domain.md`.
