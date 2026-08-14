# ADR-0002: Deployment Topology and LLM Wiring via VPS Omniroute

Status: Accepted (2026-08-09..15)
Deciders: Shiroe

## Context

The 8-cell matrix needs 24/7 hosting, secrets management, and (later) an LLM endpoint for the 4 LLM cells. Shiroe's stack already runs: fight-uno VPS with PM2, Doppler, and a self-hosted omniroute instance.

## Decision

### Deployment

- VPS `fight-uno`, path `~/prod/Kaiser.charon`, PM2 apps `charon-<strategy>-<llm|rules>` (8 total).
- Secrets: Doppler project `charon`, config `dev`. Never a committed `.env`.
- Workers start ONLY via `doppler run -- pm2 start ecosystem.matrix.config.cjs` - see gotcha below.
- DB bootstrap before first start: `doppler run -- node scripts/bootstrap_matrix_db.js --strategy <s> --use-llm <b> --db-path ./data/<cell>.sqlite` (applies `migrations/001_decision_cache.sql` which has no auto-runner).

### LLM endpoint

Self-hosted omniroute on fight-uno at `http://127.0.0.1:20128/v1` (NOT 8787 - that is headroom), API key from omniroute `api_keys` table (key `uno`), model = combo `scout`:

- Primary: `auto/minimax` - only verified-fast model returning valid non-stream JSON (1.7-8.3s on production payloads).
- Fallback: combo-ref `code-low` (routes claude-sonnet-4.5, 3.4s, adds ~4k token system-prompt overhead).

## Gotchas discovered (verified, load-bearing)

1. **PM2 env refresh trap**: `pm2 restart --update-env` does NOT re-fetch Doppler secrets. Must `pm2 delete` + `pm2 start` wrapped in `doppler run`. Symptom: stale `ENABLE_LLM=false` after Doppler update.
2. **Omniroute combo SSE default**: multi-model combos (scout/code-low) default to streaming SSE; axios without `stream:false` gets SSE frames, `res.data.choices` is undefined, and the call burns the full timeout. Fixed in `src/pipeline/llm.js` (commit 002870a) by forcing `stream: false`.
3. **Reasoning models hang on real payloads**: nemotron-3-ultra-550b, gemini-2.5-flash-thinking, glm-4.7-flash all exceeded 25-60s (or returned empty content with reasoning tokens) on production-sized prompts (~12k chars with real candidate JSON). Trivial/repetitive payloads complete fast - only trust tests with REAL candidate snapshots.
4. **ESM + PM2 config extension**: `package.json` has `"type": "module"`; PM2 ecosystem files must be `.config.cjs` (a `.config.js` fails `module is not defined`).
5. **Single Telegram poller**: all 8 workers share one bot token; workers run `DISABLE_TELEGRAM_POLLING=true` so only the polling instance avoids 409 conflicts.

## Consequences

- LLM cells produce real verdicts (e.g. `PASS conf 75` with rug-risk reasoning) in ~8s.
- Any future model/combo change must be re-tested with real-candidate payload, not toy prompts.
