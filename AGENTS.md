# AGENTS.md

## Research-first repo

This repo is a research benchmark for memecoin trading strategies, not a production trading system.
Every recommendation, tuning, improvement, or decision the agent proposes must be grounded in the
collected dry-run data (SQLite per-cell databases under `./data/`, aggregated via `scripts/matrix_reporter.js`).
Never propose a change from intuition or convention alone; always cite the metric, trade count, or
benchmark finding that justifies it.

When presenting options, give the data behind each option (trade count, win rate, profit factor,
drawdown, sample span) and the risk of acting on insufficient sample.

## Agent skills

### Issue tracker

Issues and specs for this repo live as GitHub issues. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context repository layout (`CONTEXT.md` + `docs/adr/` at root). See `docs/agents/domain.md`.
