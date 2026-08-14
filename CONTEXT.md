# Kaiser.charon - Research Benchmark Context

Fork of [yunus-0x/charon](https://github.com/yunus-0x/charon) via [kaiserern/Kaiser.charon](https://github.com/kaiserern/Kaiser.charon).
The GitHub account `vforvaick` has pull-only access to upstream `kaiserern`; all real work lands on the fork `vforvaick/Kaiser.charon`.
PR #1 to upstream stays open as an optional contribution; do not expect it to merge.

This is a research benchmark for memecoin trading strategies, not a production trading system.
All recommendations must cite trade-level data (see AGENTS.md policy).

## What runs here

**8-cell dry-run benchmark matrix** (4 strategies x 2 decision modes) on VPS `fight-uno` (`~/prod/Kaiser.charon`), managed by PM2 (`charon-<strategy>-<llm|rules>`), secrets via Doppler project `charon` config `dev`.

- Each cell = isolated SQLite under `./data/<strategy>_<mode>.sqlite`
- Aggregation: `node scripts/matrix_reporter.js` (Equal-Capital NAV, 1 SOL starting per cell)
- Strategy params are hot-read from each cell's own `strategies` table

## Glossary

- **Cell** - one strategy x decision-mode combination (e.g. `sniper-rules`), one process, one SQLite DB.
- **Decision mode** - `llm` (LLM batch-selects entry) vs `rules` (filters pass -> auto BUY).
- **Equal-Capital NAV** - `1 SOL + realized PnL + marked open PnL` per cell. Never average `pnl_percent` across cells as portfolio return.
- **Break-even WR gap** - actual win rate minus the win rate needed given avgWin/avgLoss asymmetry. The primary tuning signal.
- **SL peaked-positive** - SL trades whose high-water mark was >5% above entry. High share = exit-config problem, not entry problem.
- **Promotion gate** (for going live): >=50 closed trades per cell, profit factor >1.2, net positive across 2+ non-overlapping windows, no single trade >50% of total profit, no material data gaps. `INCONCLUSIVE` if sample insufficient.
- **O3 / Phase 2** - deferred hardening: durable `entry_pending` DB reservation + deterministic on-chain tx signature confirm (cross-process safety).

## Where decisions live

ADRs in `docs/adr/`: architecture ladder (0001), deployment/LLM wiring (0002), data-grounded tuning (0003), LLM experiment design (0004).
