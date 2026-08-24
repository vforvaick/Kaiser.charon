---
type: thesis
title: "LLM-vs-Rules Alpha Hypothesis in Memecoin Execution"
created: 2026-08-25
updated: 2026-08-25
tags:
  - thesis
  - alpha
  - llm-trading
status: developing
related:
  - "[[wiki/concepts/8-Cell-Benchmark-Matrix]]"
  - "[[wiki/comparisons/Upstream-Charon-vs-Kaiser-Charon]]"
sources:
  - "[[wiki/sources/kaiser-charon-fork]]"
  - "[[wiki/sources/telegram-meridian-charon-export]]"
---

# LLM-vs-Rules Alpha Hypothesis in Memecoin Execution

## Thesis Statement

Large Language Models (LLMs) can extract non-linear semantic and contextual alpha in memecoin trading (e.g. narrative plausibility, subtle dev rug patterns, multi-signal synergy) that static linear rules miss, but only if latency is strictly bounded ($<2\text{s}$) and prompt conservatism is calibrated to match memecoin payoff asymmetry.

## Supporting Evidence & Literature

- **Semantic Narrative Synthesis**: LLMs effectively screen out nonsensical AI-generated clone tickers and detect subtle dev transaction patterns described in candidate metadata.
- **Dynamic Context Weighting**: LLMs dynamically discount rug warnings when high-reputation smart money wallets are actively buying.

## Contradictory Evidence & Edge Cases

- **Latency Penalty**: In high-frequency bonding curve launches (`pumpfun_new`), a 5–15 second LLM roundtrip allows competing MEV sniper bots to front-run the entry, degrading realized entry pricing.
- **Prompt Conservatism Trap**: Initial prompts requiring "unusually strong asymmetric opportunity" resulted in 0 buys across 36 batches, starving the strategy of trading volume.
