---
type: source
title: "Upstream Charon Repository (yunus-0x/charon)"
created: 2026-08-25
updated: 2026-08-25
tags:
  - source
  - github
  - code
status: mature
related:
  - "[[wiki/entities/Charon-Bot]]"
  - "[[wiki/entities/Yunus-0x]]"
  - "[[wiki/comparisons/Upstream-Charon-vs-Kaiser-Charon]]"
sources:
  - "https://github.com/yunus-0x/charon"
source_type: repository
author: "Yunus-0x"
date_published: 2026-05-01
url: "https://github.com/yunus-0x/charon"
confidence: high
key_claims:
  - "Provides complete baseline architecture for PumpPortal ingestion, GMGN/Jupiter enrichment, and Solana DEX trade execution."
  - "Designed as a single-instance bot controlled by SQLite settings and environment variables."
---

# Upstream Charon Repository (yunus-0x/charon)

## Executive Summary

The upstream repository `yunus-0x/charon` contains the original codebase for the Charon Solana trading bot. It provides the full foundation for WebSocket candidate building, multi-source enrichment (GMGN, Jupiter, Twitter, RugCheck), LLM prompt integration, and trade execution.

## Architectural Structure

- `src/app.js`: Main event loop and signal listener startup.
- `src/pipeline/candidateBuilder.js`: Candidate normalization and pre-filtering logic.
- `src/pipeline/llm.js`: Batch prompt builder and LLM completion handler.
- `src/execution/`: Spot quote routing and Solana swap execution.
- `src/db/`: SQLite schema for settings, positions, and candidates.
