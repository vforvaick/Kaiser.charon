---
type: concept
title: "Bundler Detection Trap & API Latency"
created: 2026-08-25
updated: 2026-08-25
tags:
  - concept
  - rug-detection
  - alpha-insight
status: mature
related:
  - "[[wiki/entities/Charon-Bot]]"
  - "[[wiki/sources/telegram-meridian-charon-export]]"
sources:
  - "[[wiki/sources/telegram-meridian-charon-export]]"
complexity: intermediate
domain: "On-Chain Forensics & Anti-Rug Engineering"
aliases:
  - "Bundler Trap"
  - "Delayed Bundle Detection"
---

# Bundler Detection Trap & API Latency

## Definition

The **Bundler Detection Trap** is a common vulnerability in automated Solana memecoin bots where tokens with significant developer or insider bundling (>30% supply concentrated in Jito/bundle launch transactions) bypass heuristic filters because third-party enrichment APIs (e.g. GMGN, RugCheck, DexScreener) suffer from indexing latency (5–30 seconds post-creation).

## Mechanism in the Trenches

1. **Launch**: Dev creates token and launches across 10–20 bundled fresh wallets in the exact same slot.
2. **Signal Ingestion**: PumpPortal WebSocket emits `pumpfun_new` / `pumpfun_pregrad` within milliseconds.
3. **API Query**: Bot requests enrichment data immediately. API returns `bundler_rate: 0%` or `null` because its backend indexer has not yet parsed the bundle graph.
4. **Execution**: Bot assumes clean distribution, passes pre-filter, and enters position.
5. **Dump**: 15 seconds later, dev sells bundled supply; API finally flags `bundler_rate: 45%`, but bot is already underwater at -80% stop-loss.

## Mitigations Developed

- **Graduated Volume Gate**: Deferring entry until token proves organic DEX volume outside bonding curve ($>$ $5,000 graduated volume).
- **Fast Migration Reject**: Immediate rejection if token claims instant 0-second migration (`fast_migration_0s`).
- **Holder Distribution Verification**: Mandatory verification of top-10 wallet holdings directly from RPC rather than cached API summaries.
