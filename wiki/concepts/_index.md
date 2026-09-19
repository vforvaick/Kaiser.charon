---
type: meta
title: "Concepts Catalog"
created: 2026-08-25
updated: 2026-08-25
tags:
  - catalog
status: mature
related: []
sources: []
---

# Concepts & Frameworks Catalog

Index of algorithmic patterns, trading strategies, quantitative metrics, and architectural mechanisms.

## Trading Strategies & Frameworks

- [[wiki/concepts/Degen-Rules-Strategy-Profile|Degen-Rules Strategy Profile]]: Primary advancing canonical strategy ($25k–$80k mcap, +13.4% portfolio return, 252 trades).
- [[wiki/concepts/8-Cell-Benchmark-Matrix|8-Cell Benchmark Matrix]]: Factorial $4\times 2$ matrix evaluating Rules vs LLM regimes (retired to 4 Rules cells per ADR-0007).
- [[wiki/concepts/Obicle-Degen-Strategy|Obicle Degen Strategy]]: Micro-cap bonding curve entry rules ($7k–$20k mcap, wide SL, trailing TP).
- [[wiki/concepts/El-Ponny-Strategy|El Ponny Filter Heuristics]]: Conservative holder concentration and anti-rug heuristics.

## Quantitative Filters & Machine Learning

- [[wiki/concepts/Momentum-ML-Filter|Momentum ML Filter]]: In-line LightGBM runner prediction gate.
- [[wiki/concepts/Buy-Sell-Ratio-Flow-Guard|Buy-Sell Ratio Flow Guard]]: 1h/5m volume order flow pressure pre-filter.

## Anti-Rug, Risk & Diagnostics

- [[wiki/concepts/Memecoin-Strategy-Failure-Modes|Memecoin Strategy Failure Modes]]: Deep post-mortem of why smart_money (100% TP flaw) and sniper (unfiltered top-chasing) failed.
- [[wiki/concepts/Bundler-Detection-Trap|Bundler Detection Trap & API Latency]]: Vulnerability where early bundling slips past delayed API indexing.
