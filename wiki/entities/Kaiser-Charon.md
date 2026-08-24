---
type: entity
title: "Kaiser.charon"
created: 2026-08-25
updated: 2026-08-25
tags:
  - entity
  - research-fork
  - benchmark
status: mature
related:
  - "[[wiki/entities/Charon-Bot]]"
  - "[[wiki/concepts/8-Cell-Benchmark-Matrix]]"
  - "[[wiki/concepts/Momentum-ML-Filter]]"
  - "[[wiki/comparisons/Upstream-Charon-vs-Kaiser-Charon]]"
sources:
  - "[[wiki/sources/kaiser-charon-fork]]"
entity_type: repository
role: "Scientific research benchmark and multi-strategy evaluation platform for Solana memecoins."
first_mentioned: "https://github.com/kaiserern/Kaiser.charon"
---

# Kaiser.charon

## Overview

**Kaiser.charon** is an advanced research and benchmarking fork of `charon`. Unlike upstream, which operates as a single live/dry-run trading bot instance, Kaiser.charon transforms the platform into an **8-cell empirical benchmark matrix** to rigorously test trading hypotheses (Rules vs. LLM across 4 distinct market regimes).

## Key Evolutionary Additions

1. **8-Cell Benchmark Matrix**: Concurrent parallel execution of `sniper`, `degen`, `dip_buy`, and `smart_money` across pure rule-based and LLM-assisted variants.
2. **Machine Learning Momentum Gate**: LightGBM classifier (`predict_momentum.py`) predicting runner probabilities (`TRAILING_TP`) vs dead sideways tokens (`MAX_HOLD`).
3. **Resilient Enrichment Layer**: 60s TTL caching for Jupiter charts, rate-limit isolation, and retry fallbacks.
4. **Research-First Discipline**: Strict statistical holdout testing (e.g. chronological train/test split validation) before applying live parameter changes.
