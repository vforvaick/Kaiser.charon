---
type: entity
title: "Charon Trading Bot"
created: 2026-08-25
updated: 2026-08-25
tags:
  - entity
  - trading-bot
  - solana
status: mature
related:
  - "[[wiki/entities/Yunus-0x]]"
  - "[[wiki/entities/Kaiser-Charon]]"
  - "[[wiki/concepts/8-Cell-Benchmark-Matrix]]"
sources:
  - "[[wiki/sources/yunus0x-charon-upstream]]"
  - "[[wiki/sources/telegram-meridian-charon-export]]"
entity_type: repository
role: "Automated Solana memecoin discovery, multi-signal enrichment, and trading engine."
first_mentioned: "https://github.com/yunus-0x/charon"
---

# Charon Trading Bot

## Overview

**Charon** is an open-source Solana algorithmic trading bot designed for memecoin discovery, multi-source enrichment (GMGN, Jupiter, PumpPortal, RugCheck, Twitter), heuristic pre-filtering, LLM batch evaluation, and real-time position management (trailing TP/SL).

## Core Architecture

- **Signal Ingestion**: WebSocket listener on PumpPortal (`pumpfun_new`, `pumpfun_graduated`, `pumpfun_pregrad`), GMGN trending feeds, and fee-claim channels.
- **Enrichment Pipeline**: Fetches asset metadata, DEX liquidity, holder distributions, bundler presence, and top-10 concentration.
- **Pre-Filtering**: Hard and soft scoring gates (e.g. minimum mcap, liquidity thresholds, dev migration limits).
- **LLM Evaluator**: Multi-token batch screening with structured reasoning output (confidence scoring, BUY/SKIP decisions).
- **Execution & Monitoring**: Real-time position tracking with trailing take-profit, stop-loss, and max hold duration timeouts.
