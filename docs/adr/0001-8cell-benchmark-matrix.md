# ADR-0001: 8-Cell Benchmark Matrix as Isolated PM2 Workers

Status: Accepted (2026-08-09)
Deciders: Shiroe, Oracle second-opinion

## Context

The goal: dry-run benchmark 4 strategies (sniper, dip_buy, smart_money, degen) x 2 decision modes (LLM, rule-based) = 8 cells, to find which combination is consistently profitable before any multimode live deployment.

Charon's `activeStrategy()` reads `SELECT * FROM strategies WHERE enabled = 1 LIMIT 1` - designed for ONE active strategy per process/database.

## Options

1. **8 independent PM2 processes, one SQLite per cell** - zero trading-engine changes, full isolation.
2. Single-process multi-strategy engine (refactor orchestrator to loop all strategies) - major refactor, shared failure domain.
3. Hub-and-spoke ingestion broker + 8 workers - dedup signal fetching, moderate refactor.

## Decision

**Option 1 now, with an upgrade ladder.** Oracle's assessment: option 1 is the correct starting point but NOT zero-code (needed env overrides, DB bootstrap, Telegram worker mode). Option 2 only viable for small mode counts accepting shared failure domain.

Rationale:

- No refactor of the live trading engine = no regression risk to trading logic.
- Separate SQLite files = zero WAL write contention.
- 8 x ~180MB RAM (~1.4GB) fits fight-uno (23GB).
- The Telegram 409-conflict is solved by `DISABLE_TELEGRAM_POLLING=true` on 7 workers; only one process polls.

**Ladder (in order):**

```text
2-cell canary -> 8 isolated dry-run workers -> hub-and-spoke only if parity/load requires it -> central portfolio/risk allocator BEFORE any multimode live
```

Multimode live is NEVER "flip TRADING_MODE=live on 8 workers": it requires one signal hub -> evaluators -> central risk allocator -> single execution engine -> canonical position ledger.

## Consequences

- Env overrides added: `DB_PATH`, `ACTIVE_STRATEGY_ID`, `FORCE_USE_LLM`, `DISABLE_TELEGRAM_POLLING`.
- `scripts/bootstrap_matrix_db.js` creates+migrates+seeds each cell DB deterministically.
- `ecosystem.matrix.config.cjs` (note: must be `.config.cjs` - `package.json` has `"type": "module"` so PM2 configs need CJS extension).
- 8x duplicate external polling (Jupiter/Helius/pump.fun) - acceptable within free-tier quotas, verified over 30h+ uptime.
- Known limitation: all cells see the same market window, so cell results are correlated, not independent edges. Promotion gates must account for this.
