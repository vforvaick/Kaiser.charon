---
type: meta
title: "Hot Cache"
updated: 2026-08-25T01:00:00
---

# Recent Context

## Last Updated

2026-08-25. Ingested Telegram discussion archive (12,829 messages), upstream repository `yunus-0x/charon`, and fork `kaiserern/Kaiser.charon`.

## Key Recent Facts

- **Community Alpha Ingested**: Extracted [[wiki/concepts/Obicle-Degen-Strategy|Obicle Degen]] ($7k–$20k corridor, -90% SL / +50% trailing TP) and [[wiki/concepts/El-Ponny-Strategy|El Ponny]] (<30% top 10 holders & bundler ceiling) heuristics from Meridian Telegram logs.
- **Architectural Benchmark**: Synthesized [[wiki/comparisons/Upstream-Charon-vs-Kaiser-Charon|Upstream vs Kaiser comparison]] and [[wiki/concepts/8-Cell-Benchmark-Matrix|8-Cell Matrix]] topology (4 regimes $\times$ Rules vs LLM).
- **Quant & ML Gates**: Documented [[wiki/concepts/Momentum-ML-Filter|Momentum ML Filter]] (LightGBM runner classifier) and [[wiki/concepts/Buy-Sell-Ratio-Flow-Guard|Buy-Sell Ratio Guard]] with train/test holdout evidence.
- **Identified Open Vulnerabilities**: Formulated research gap on [[wiki/gaps/Dev-Bundle-Detection-Lag|Real-Time Dev Bundle Detection Lag]] caused by 5–30s indexing delays on third-party APIs.

## Recent Pages Created

- Sources: `telegram-meridian-charon-export`, `yunus0x-charon-upstream`, `kaiser-charon-fork`.
- Concepts: `8-Cell-Benchmark-Matrix`, `Momentum-ML-Filter`, `Buy-Sell-Ratio-Flow-Guard`, `Bundler-Detection-Trap`, `Obicle-Degen-Strategy`, `El-Ponny-Strategy`.
- Entities: `Charon-Bot`, `Kaiser-Charon`, `Yunus-0x`.
- Synthesis: `Upstream-Charon-vs-Kaiser-Charon`, `LLM-vs-Rules-Alpha-Hypothesis`, `Dev-Bundle-Detection-Lag`.

## Active Threads

- Monitor restored live Momentum ML scoring in PM2.
- Evaluate real-time Jito/Geyser bundle inspection to eliminate API indexing latency.
