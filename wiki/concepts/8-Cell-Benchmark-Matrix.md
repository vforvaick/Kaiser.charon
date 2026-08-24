---
type: concept
title: "8-Cell Benchmark Matrix"
created: 2026-08-25
updated: 2026-08-25
tags:
  - concept
  - methodology
  - benchmark
status: mature
related:
  - "[[wiki/entities/Kaiser-Charon]]"
  - "[[wiki/comparisons/Upstream-Charon-vs-Kaiser-Charon]]"
sources:
  - "[[wiki/sources/kaiser-charon-fork]]"
complexity: intermediate
domain: "Algorithmic Trading & Experimentation"
aliases:
  - "Benchmark Matrix"
  - "8-Cell Architecture"
---

# 8-Cell Benchmark Matrix

## Definition

The **8-Cell Benchmark Matrix** is an experimental design methodology that runs 8 simultaneous trading bot instances under identical market conditions. It partitions trading strategies into a $4 \times 2$ factorial grid: 4 distinct strategy styles evaluated under pure **Rules** (deterministic heuristics) versus **LLM-Assisted** decision making.

## Matrix Structure

| Strategy | Target Regime | Rules Cell | LLM Cell |
| :--- | :--- | :--- | :--- |
| **Sniper** | Graduated tokens ($30k–$200k mcap), high volume | `sniper-rules` | `sniper-llm` |
| **Degen** | Micro-cap trenches ($7k–$20k mcap), bonding curve | `degen-rules` | `degen-llm` |
| **Dip Buy** | Pullbacks from ATH, oversold momentum | `dip_buy-rules` | `dip_buy-llm` |
| **Smart Money** | Known profitable wallet tracking & copy exposure | `smart_money-rules` | `smart_money-llm` |

## Methodological Rationale

1. **Control Baseline**: Rules cells act as deterministic control groups to measure whether LLM inference generates positive alpha over baseline heuristics.
2. **Identical Market Window**: All 8 cells trade the exact same Solana block and WebSocket stream concurrently on the same VPS, eliminating regime-shift biases common in historical backtests.
3. **Isolated Persistence**: Each cell operates on its own dedicated SQLite database (`./data/<strat>_<type>.sqlite`) to prevent cross-process locking or state pollution.
