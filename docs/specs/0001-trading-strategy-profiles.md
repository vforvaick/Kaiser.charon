# SPEC-001: Verified Degen-Rules Production Strategy Profile

## Problem Statement

The benchmark matrix dry-run data has proven that the `degen-rules` configuration is currently the only systematically profitable strategy cell in Kaiser.charon (+0.1793 SOL net PnL across $N=138$ closed trades, 2.03x win/loss payoff ratio, 43.1% win rate in the $40k–$60k mcap bucket). However, this profitable parameterization exists only within individual database overrides rather than as a first-class, versioned, seed-level strategy profile in the codebase with automated regression tests.

## Solution

Formalize the verified `degen-rules` configuration into a canonical strategy profile (`degen`) across the seed database, runtime strategy defaults, and benchmark configurations, with parameter guards matching empirical performance data ($25k–$100k mcap corridor, +30% TP, -15% SL, 10% trailing stop, 5 concurrent position limit, 0.05 SOL sizing).

## User Stories

1. As an algorithmic trader, I want a standardized `degen` strategy configuration based on verified empirical dry-run data, so that my bot operates with positive expected value in live and benchmark environments.
2. As a risk manager, I want strict position sizing of 0.05 SOL with a maximum of 5 concurrent open positions, so that total capital at risk is capped at 0.25 SOL per strategy cycle.
3. As a strategy evaluator, I want an entry corridor between $25k and $100k market cap with optimal weighting in the $40k–$60k range, so that the bot captures tokens in their highest win-rate growth phase.
4. As a bot operator, I want automated take-profit (+30%) and trailing stop-loss (10% trail after activation) triggers, so that the bot secures profits on runners while containing drawdown on reversions to -15%.
5. As a system maintainer, I want seed migrations and strategy loader functions to register this profile deterministically, so that new instances launch with verified parameters without manual SQLite patching.

## Implementation Decisions

- **Strategy Configuration Definition**: Establish `degen` strategy settings with:
  - `entry_mode`: immediate
  - `min_mcap_usd`: 25000, `max_mcap_usd`: 100000
  - `tp_percent`: 30, `sl_percent`: -15, `trailing_enabled`: true, `trailing_percent`: 10
  - `position_size_sol`: 0.05, `max_open_positions`: 5
  - `min_holders`: 30, `max_top20_holder_percent`: 100
  - `trending_max_bundler_rate`: 0.7, `trending_max_rug_ratio`: 0.5
  - `use_llm`: false (rules baseline) / true (LLM counterpart)
- **Database Seed Consistency**: Update default strategy seed schemas in database connection initialization so that fresh clones inherit the verified configuration.
- **Matrix Integration**: Ensure `ecosystem.matrix.config.cjs` maps `charon-degen-rules` and `charon-degen-llm` directly to this unified specification.

## Testing Decisions

- Test that loading strategy by ID `degen` produces exact numerical boundaries for TP, SL, trailing, and mcap corridor.
- Test that candidate filter rejects candidates below $25k mcap and above $100k mcap when `degen` strategy is active.
- Test that position sizing and max position limits strictly enforce the 5-position cap under simulated concurrent entries.
- Prior art: `test/buy_pressure_filter.test.js` and `test/momentum_gate.test.js`.

## Out of Scope

- Modifying execution routing or slippage logic on Jupiter/Solana RPC.
- Altering the LLM prompt structure for `degen-llm` (covered in a separate prompt evaluation ticket).

## Further Notes

- Root-cause validation: This strategy's profitability flipped positive after decoupling Jupiter chart 429 backoff from quote evaluation (ADR-0005).

---

# SPEC-002: Obicle Degen Pre-Graduation Trench Strategy Profile

## Problem Statement

Traders operating in the high-risk micro-cap "trenches" on Pump.fun need a specialized strategy that enters bonding curve tokens prior to Raydium graduation. Standard strategies either enter too late (post-graduation at higher mcaps) or use tight stop-losses (-15% to -25%) that get prematurely shaken out by normal bonding curve volatility.

## Solution

Introduce a dedicated `obicle_degen` strategy profile tailored for pre-graduation bonding curves ($7k–$20k mcap corridor) with wide asymmetric exit boundaries (-80% to -90% stop-loss, +50% take-profit with +30% trailing stop), combined with anti-rug heuristic gates (`dev_migrations <= 7`, `fast_migration_0s` hard rejection).

## User Stories

1. As a meme trench trader, I want to capture tokens early on the Pump.fun bonding curve ($7k–$20k market cap), so that I achieve 3x–10x upside before DEX graduation.
2. As a risk manager, I want a wide stop-loss (-80% to -90%) paired with small position size (0.025–0.05 SOL), so that normal bonding curve chop does not trigger premature exits while preserving high payoff asymmetry.
3. As an automated trader, I want a trailing take-profit (+30% trail after +50% threshold), so that the bot lets micro-cap runners expand into parabolic moves (+200% to +500%).
4. As a bot operator, I want automated dev migration filtering (`dev_migrations <= 7`), so that serial rug-factory deployers are filtered before capital is committed.
5. As a safety auditor, I want instant rejection of tokens with 0-second migration flags, so that bot-deployed instant pump-and-dump tokens are never traded.

## Implementation Decisions

- **Strategy Configuration Definition**: Add `obicle_degen` strategy settings with:
  - `entry_mode`: immediate
  - `min_mcap_usd`: 7000, `max_mcap_usd`: 20000
  - `tp_percent`: 50, `sl_percent`: -85, `trailing_enabled`: true, `trailing_percent`: 30
  - `position_size_sol`: 0.03, `max_open_positions`: 4
  - `require_fee_claim`: false
  - `trending_max_rug_ratio`: 0.4, `trending_max_bundler_rate`: 0.5
  - `min_holders`: 15
- **Pre-Filter Enforcement**: Wire `candidateBuilder.js` to enforce maximum dev migration threshold ($\le 7$) and reject `fast_migration_0s` pattern flags on candidates evaluated under this strategy.
- **Route Affinity**: Optimize signal routing for `pumpfun_new` and `pumpfun_pregrad` WebSocket channels.

## Testing Decisions

- Test that `obicle_degen` rejects tokens with mcap $< \$7\text{k}$ or $> \$20\text{k}$.
- Test that tokens with dev migration count $> 7$ are rejected with explicit failure reason.
- Test that tokens with `fast_migration_0s` pattern flag are rejected under fresh grad checks.
- Test that exit monitor triggers trailing stop only after passing +50% unrealized gain and trailing down 30% from high water mark.

## Out of Scope

- Trading post-graduation tokens on Raydium/Orca pools.
- Manual transaction signing or custom Jito tip adjustments.

## Further Notes

- Sizing is kept conservative (0.03 SOL) due to the wide -85% SL floor, keeping max loss per trade at ~0.0255 SOL.

---

# SPEC-003: El Ponny Anti-Rug Safe Decentralized Strategy Profile

## Problem Statement

Post-graduation memecoin trading suffers from heavy developer and insider supply concentration (bundling and top-10 wallet domination), which leads to sudden liquidity drain and high stop-loss rates (historical sniper SL rate was ~39.4%).

## Solution

Introduce an `el_ponny` conservative strategy profile that enforces strict holder decentralization and organic volume heuristics: Top-10 concentration ceiling ($<30\%$), bundler rate ceiling ($<30\%$), minimum 24h organic swap volume (5,000+ swaps, $50k+ volume), and moderate profit targets (+40% TP, -20% SL, 15% trailing stop).

## User Stories

1. As a conservative algorithmic trader, I want to trade only tokens where top-10 non-pool holders hold $<30\%$ of total supply, so that single-wallet dumps cannot destroy the liquidity pool.
2. As a risk manager, I want strict rejection of tokens with bundler rates $\ge 30\%$, so that insider-coordinated launch dumps are filtered before entry.
3. As a volume-focused trader, I want tokens to prove at least 5,000 unique swaps and $50k 24h volume, so that low-liquidity illiquid traps are eliminated.
4. As a bot operator, I want standard balanced risk parameters (+40% TP, -20% SL, 15% trail), so that capital is turned over reliably with high win-rate consistency.
5. As an ecosystem observer, I want zero exposure to blacklisted or dev-associated saved wallets, ensuring clean organic community distribution.

## Implementation Decisions

- **Strategy Configuration Definition**: Add `el_ponny` strategy settings with:
  - `entry_mode`: immediate
  - `min_mcap_usd`: 30000, `max_mcap_usd`: 150000
  - `tp_percent`: 40, `sl_percent`: -20, `trailing_enabled`: true, `trailing_percent`: 15
  - `position_size_sol`: 0.05, `max_open_positions`: 3
  - `max_top20_holder_percent`: 30 (mapped to top concentration)
  - `trending_max_bundler_rate`: 0.30
  - `trending_max_rug_ratio`: 0.25
  - `trending_min_volume_usd`: 50000, `trending_min_swaps`: 5000
- **Pre-Filter Enforcement**: Ensure `candidateBuilder.js` checks `max_top20_holder_percent`, `trending_max_bundler_rate`, `trending_min_volume_usd`, and `trending_min_swaps` against strategy configurations.

## Testing Decisions

- Test that tokens with top holder concentration $\ge 30\%$ are rejected.
- Test that tokens with bundler rate $> 30\%$ or rug ratio $> 0.25$ are rejected.
- Test that tokens with 24h swaps $< 5000$ or volume $< \$50\text{k}$ fail pre-filter.
- Test that compliant tokens pass pre-filter and execute with +40% / -20% exit parameters.

## Out of Scope

- Real-time on-chain Geyser transaction parsing (third-party telemetry used as initial baseline).
- Micro-cap bonding curve pre-graduation trading ($< \$30\text{k}$ mcap).

## Further Notes

- This profile acts as the conservative counterpart to `sniper-rules`, trading higher quality setups with lower overall trade frequency (estimated 2–5 trades/day).
