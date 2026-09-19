## [2026-09-18] ingest | Degen Strategy Profile, Failure Modes & ADR-0007 LLM Retirement

- Sources:
  - SQLite dry-run databases (4,500+ trades on `sniper_rules`, `smart_money_rules`, `degen_rules`, `dip_buy_rules`)
  - `docs/adr/0007-rules-only-matrix-and-llm-retirement.md`
- Concepts Created & Updated:
  - [[wiki/concepts/Degen-Rules-Strategy-Profile]]: Full analysis of 252 trades (+13.4% net portfolio gain, timespan 39.7d / 22 active days, Phase 1 vs Phase 2).
  - [[wiki/concepts/Memecoin-Strategy-Failure-Modes]]: Detailed post-mortem of why smart_money (100% TP flaw) and sniper (unfiltered top-chasing) failed.
  - [[wiki/thesis/LLM-vs-Rules-Alpha-Hypothesis]]: Formally updated to resolved/rejected per ADR-0007 (Rules beat LLM 35.8% vs 18.9% WR).
- Key Insight: Documented empirical failure archetypes and established data-driven tuning paths for active rules strategies.

## [2026-08-25] ingest | Telegram Export, Upstream Charon & Kaiser.charon Fork

- Sources:
  - `.raw/telegram/transcript.txt` (12,829 community messages)
  - `https://github.com/yunus-0x/charon` (upstream codebase)
  - `https://github.com/kaiserern/Kaiser.charon` (research fork)
- Summary Pages Created:
  - [[wiki/sources/telegram-meridian-charon-export]]
  - [[wiki/sources/yunus0x-charon-upstream]]
  - [[wiki/sources/kaiser-charon-fork]]
- Entities Created:
  - [[wiki/entities/Charon-Bot]]
  - [[wiki/entities/Kaiser-Charon]]
  - [[wiki/entities/Yunus-0x]]
- Concepts & Synthesis Created:
  - [[wiki/concepts/8-Cell-Benchmark-Matrix]]
  - [[wiki/concepts/Momentum-ML-Filter]]
  - [[wiki/concepts/Buy-Sell-Ratio-Flow-Guard]]
  - [[wiki/concepts/Bundler-Detection-Trap]]
  - [[wiki/concepts/Obicle-Degen-Strategy]]
  - [[wiki/concepts/El-Ponny-Strategy]]
  - [[wiki/comparisons/Upstream-Charon-vs-Kaiser-Charon]]
  - [[wiki/thesis/LLM-vs-Rules-Alpha-Hypothesis]]
  - [[wiki/gaps/Dev-Bundle-Detection-Lag]]
- Key Insight: Extracted core community alpha (El Ponny holder concentration, Obicle micro-cap corridor, Bundler latency traps) and synthesized architectural advancements of the 8-cell benchmark matrix over upstream single-bot execution.

## [2026-08-25] scaffold | Wiki Vault Initialization

- Structure initialized in Mode E (Research & Knowledge Base).
- Created templates, color snippets, catalogs, and CLAUDE.md schema.
