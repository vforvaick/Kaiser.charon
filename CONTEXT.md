# Kaiser.charon - Research Benchmark Context

Fork of [yunus-0x/charon](https://github.com/yunus-0x/charon) via [kaiserern/Kaiser.charon](https://github.com/kaiserern/Kaiser.charon).
The GitHub account `vforvaick` has pull-only access to upstream `kaiserern`; all real work lands on the fork `vforvaick/Kaiser.charon`.
PR #1 to upstream stays open as an optional contribution; do not expect it to merge.

This is a research benchmark for memecoin trading strategies, not a production trading system.
All recommendations must cite trade-level data (see AGENTS.md policy).

## What runs here

**4-cell dry-run rules matrix** (4 tuned strategies: `degen`, `sniper`, `smart_money`, `dip_buy`) on VPS `fight-uno` (`~/prod/Kaiser.charon`), managed by PM2 (`charon-<strategy>-rules`), secrets via Doppler project `charon` config `dev`.
The 4 LLM benchmark cells were retired after a 34-day longitudinal study proved Rules decisively beat LLMs across all metrics (ADR-0007).

- Each cell = isolated SQLite under `./data/<strategy>_<mode>.sqlite`
- Aggregation: `node scripts/matrix_reporter.js` (Equal-Capital NAV, 1 SOL starting per cell)
- Strategy params are hot-read from each cell's own `strategies` table
- Telemetry resolver: single designated worker (`charon-sniper-rules`) resolves forward price marks across all cell databases under strict global budget cap.

## Glossary

- **Cell** - one strategy execution unit (e.g. `degen-rules`), one process, one SQLite DB.
- **Decision mode** - `rules` (active production benchmark: filters pass -> auto BUY) vs `llm` (retired benchmark archive per ADR-0007).
- **Equal-Capital NAV** - `1 SOL + realized PnL + marked open PnL` per cell. Never average `pnl_percent` across cells as portfolio return.
- **Break-even WR gap** - actual win rate minus the win rate needed given avgWin/avgLoss asymmetry. The primary tuning signal.
- **SL peaked-positive** - SL trades whose high-water mark was >5% above entry. High share = exit-config problem, not entry problem.
- **Promotion gate** (for going live): 4-Stage Promotion Pipeline per ADR-0006:
  - Stage 1 (Causal Replay): >=50 closed trades, profit factor >=1.20, 95% bootstrap LCB > 0, daily consistency >=70%, positive PnL across 2+ non-overlapping windows (H1 & H2 > 0), no single trade >50% profit.
  - Stage 2 (Forward Shadow): >=100 closed trades on VPS matrix across 2+ windows.
  - Stage 3 (Canary): 0.025 SOL probe size with fail-closed circuit breakers (daily loss 0.025 SOL, 3x loss, 7d loss 0.075 SOL, canary lifetime 0.15 SOL).
  - Stage 4 (Scale-Up): Operator-reviewed capital expansion.
- **O3 / Phase 2** - deferred hardening: durable `entry_pending` DB reservation + deterministic on-chain tx signature confirm (cross-process safety).

## Where decisions live

ADRs in `docs/adr/`:

- 0001: 8-cell benchmark matrix architecture
- 0002: deployment/LLM wiring and Doppler secrets
- 0003: data-grounded tuning round 1
- 0004: LLM experiment design (rules vs LLM criteria)
- 0005: chart caching, rate-limit isolation, and degen mcap bucket analysis
- 0006: backtesting revamp (SPEC-004), canary risk controls (SPEC-005), and degen tuning
- 0007: rules-only matrix and retirement of LLM benchmark cells (rules won head-to-head)
