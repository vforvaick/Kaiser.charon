---
type: source
title: "Telegram Meridian - Charon Discussion Export (Topic #33890)"
created: 2026-08-25
updated: 2026-08-25
tags:
  - source
  - community
  - telegram
status: mature
related:
  - "[[wiki/entities/Charon-Bot]]"
  - "[[wiki/concepts/Obicle-Degen-Strategy]]"
  - "[[wiki/concepts/El-Ponny-Strategy]]"
  - "[[wiki/concepts/Bundler-Detection-Trap]]"
sources:
  - "[[.raw/telegram/transcript.txt]]"
source_type: transcript
author: "Meridian Trading Community / Yunus / Kaiser"
date_published: 2026-08-24
url: "https://t.me/c/33890"
confidence: high
key_claims:
  - "Early trenches trading without multi-factor flow filtering suffered from persistent negative PnL due to undetected dev dumps and sniper bot frontrunning."
  - "Community members tried heuristics based on Obicle and El Ponny trading guides, extracting strict bundle caps (<30%) and top-10 concentration limits."
  - "LLM batch screening (MiniMax M2.7 / DeepSeek) produced high reasoning quality but suffered from prompt conservatism and API rate limits when screening high-frequency PumpPortal streams."
---

# Telegram Meridian - Charon Discussion Export (Topic #33890)

## Executive Summary

This transcript contains 12,829 messages (May 7 – August 24, 2026) from the core alpha & developer group discussing the development, real-world deployment, parameter tuning, dry-run PnL results, and algorithmic failure modes of [[wiki/entities/Charon-Bot|Charon Bot]].

## Key Insights & Alphas

### 1. Strategy Heuristics Evolution

- **El Ponny & Obicle Influences**: Users dissected meme trading manuals to formulate filter rules:
  - Strict bundler filter (<30% bundler rate), though early implementations struggled because bundle detection APIs lagged behind dev wallet transfers.
  - Top 10 holder concentration caps (<40–50%).
  - Fast migration checks (0s pumpfun migrations almost universally rugged).
- **Degen vs Sniper**:
  - Degen targets early bonding curve / micro-caps ($7k–$20k mcap) with wide SL (-90%) and aggressive trailing TP (+50% to +300%).
  - Sniper targets graduated / DEX tokens ($30k–$200k mcap) with tight SL (-25%) and trailing TP (20%).

### 2. Infrastructure Lessons

- **API Bottlenecks**:
  - GMGN API rate-limits aggressively; requires minimum 2,500ms request delays or IP proxying.
  - Jupiter Chart/Asset API rate-limits on 429; initial bots blocked live position quote updates on chart 429s until chart and quote backoffs were decoupled.
  - LLM costs: Direct MiniMax subscription proved significantly cheaper than OpenRouter routing for continuous batch screening.

### 3. Self-Improving / Learning System

- Discussions focused on auto-evaluating trades hourly (`autoApply.js` / lesson generation) to adjust parameters based on past trade mistakes.
