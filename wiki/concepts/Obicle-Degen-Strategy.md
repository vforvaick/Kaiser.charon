---
type: concept
title: "Obicle Degen Strategy"
created: 2026-08-25
updated: 2026-08-25
tags:
  - concept
  - trading-strategy
  - microcap
status: mature
related:
  - "[[wiki/entities/Charon-Bot]]"
  - "[[wiki/sources/telegram-meridian-charon-export]]"
sources:
  - "[[wiki/sources/telegram-meridian-charon-export]]"
complexity: intermediate
domain: "Memecoin Micro-Cap Trading"
aliases:
  - "Obicle Framework"
  - "Degen Curve Strategy"
---

# Obicle Degen Strategy

## Definition

The **Obicle Degen Strategy** is a high-risk, high-asymmetry trading framework extracted from community trading guides (specifically analyzed by the Meridian community). It focuses on buying micro-cap bonding curve tokens on Pump.fun before graduation, targeting 3x–10x momentum expansions while cutting complete rug-pulls.

## Key Heuristics & Rules

1. **Market Cap Corridor**: Entries strictly between **$7,000 and $20,000 USD** mcap. Tokens above $25k before graduation have adverse risk/reward; tokens below $7k suffer high instant rug rates.
2. **Developer Migration Count**: Filter out dev wallets with $>7$ past migrations (indicative of serial rug factories).
3. **Wide Asymmetric Exits**:
   - **Stop-Loss (SL)**: -80% to -90% (to survive high bonding curve volatility without getting shaken out prematurely).
   - **Take-Profit (TP)**: +50% base TP with +30% trailing stop activation to capture runner tails (+200% to +500%).
