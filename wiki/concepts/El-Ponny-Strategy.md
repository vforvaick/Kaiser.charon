---
type: concept
title: "El Ponny Filter Heuristics"
created: 2026-08-25
updated: 2026-08-25
tags:
  - concept
  - trading-strategy
  - filter
status: mature
related:
  - "[[wiki/entities/Charon-Bot]]"
  - "[[wiki/sources/telegram-meridian-charon-export]]"
sources:
  - "[[wiki/sources/telegram-meridian-charon-export]]"
complexity: intermediate
domain: "Memecoin Filtering & Risk Management"
aliases:
  - "Elponyin"
  - "El Ponny Framework"
---

# El Ponny Filter Heuristics

## Definition

The **El Ponny Filter Heuristics** (often referred to in the Meridian Telegram as *elponyin*) is a conservative heuristic filter suite designed to identify safe community meme tokens by enforcing strict holder decentralization and organic transaction volume.

## Core Filtering Gates

1. **Top 10 Concentration Ceiling**: Top 10 non-bonding curve holders must collectively hold **$< 30\%$** of supply.
2. **Bundler Ceiling**: Strict bundler rate $< 30\%$ (with high penalty for any wallet cluster over 15%).
3. **Transaction Volume Thresholds**: Minimum 5,000+ unique swaps within 24 hours to filter dead or single-actor tokens.
4. **Dev Exposure Check**: Zero saved developer wallet exposure or blacklisted dev addresses.
