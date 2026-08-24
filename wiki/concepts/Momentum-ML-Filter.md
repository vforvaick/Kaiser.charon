---
type: concept
title: "Momentum ML Filter"
created: 2026-08-25
updated: 2026-08-25
tags:
  - concept
  - machine-learning
  - pipeline
status: mature
related:
  - "[[wiki/entities/Kaiser-Charon]]"
  - "[[wiki/concepts/8-Cell-Benchmark-Matrix]]"
sources:
  - "[[wiki/sources/kaiser-charon-fork]]"
complexity: advanced
domain: "Machine Learning & Signal Processing"
aliases:
  - "Momentum Gate"
  - "Runner Classifier"
---

# Momentum ML Filter

## Definition

The **Momentum ML Filter** is an in-line classification model (`models/momentum_lgb.pkl` / `predict_momentum.py`) that evaluates incoming trading candidates to predict whether a token has the momentum characteristics of a runner (reaching `TRAILING_TP` exits) versus stagnating sideways into `MAX_HOLD` timeout exits.

## Technical Mechanism

1. **Feature Extraction**: Extracts 20+ features from candidate JSON payloads, including:
   - Volume velocity (1h vs 5m volume ratios).
   - Liquidity-to-market-cap ratios.
   - Holder concentration and top-10 wallet distributions.
   - Deviation from estimated VWAP.
   - Fee metrics and swap frequencies.
2. **Subprocess Bridge (`src/pipeline/momentumFilter.js`)**: Spawns Python process with JSON IPC and strict 8,000ms timeout budget.
3. **Fail-Open Architecture**: If Python throws, times out, or fails JSON parsing, the gate automatically passes the candidate (`passed: true`, `score: -1`) to ensure trading pipeline continuity.
4. **Price Resolution Cascade (`resolveCandidatePrice`)**: Robust multi-tier price extractor handling direct numeric prices, nested GMGN objects, and fallback cascades across Jupiter assets, metrics, and trending metadata.
