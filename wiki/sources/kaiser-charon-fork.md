---
type: source
title: "Kaiser.charon Repository (kaiserern/Kaiser.charon)"
created: 2026-08-25
updated: 2026-08-25
tags:
  - source
  - github
  - code
status: mature
related:
  - "[[wiki/entities/Kaiser-Charon]]"
  - "[[wiki/concepts/8-Cell-Benchmark-Matrix]]"
  - "[[wiki/concepts/Momentum-ML-Filter]]"
sources:
  - "https://github.com/kaiserern/Kaiser.charon"
source_type: repository
author: "Kaiser / vforvaick"
date_published: 2026-08-08
url: "https://github.com/kaiserern/Kaiser.charon"
confidence: high
key_claims:
  - "Transforms Charon into a concurrent 8-cell benchmarking harness across 4 strategy regimes."
  - "Integrates LightGBM ML model for runner momentum classification."
  - "Introduces decoupled rate-limit isolation, telemetry caching, and statistical edge backtesting."
---

# Kaiser.charon Repository (kaiserern/Kaiser.charon)

## Executive Summary

`kaiserern/Kaiser.charon` is the research-grade benchmarking fork of Charon. It refactors the architecture to support concurrent isolated strategy execution, rigorous performance measurement, ML inference gates, and robust API failure isolation.

## Key Subsystems

- `ecosystem.matrix.config.cjs`: PM2 process orchestration launching 8 isolated strategy cells with distinct database files (`./data/<strategy>_<mode>.sqlite`).
- `scripts/matrix_reporter.js`: Daily multi-cell PnL reporting with Realized NAV tracking.
- `src/pipeline/momentumFilter.js`: In-line inference bridge calling Python LightGBM models with fail-open safety.
- `scripts/comprehensive_edge_backtest.py`: Full trade-level parameter search and holdout validation engine.
