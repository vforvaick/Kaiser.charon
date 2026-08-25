import assert from 'node:assert';
import test from 'node:test';
import { fetchJupiterChartContext, fetchSolUsdPrice } from '../src/enrichment/jupiter.js';

test('fetchJupiterChartContext returns consistent summary object shape', async () => {
  const result = await fetchJupiterChartContext('invalid_mint_for_test_123', { ttlMs: 1000 });
  assert.ok(result);
  assert.strictEqual(typeof result.purpose, 'string');
  assert.ok(Array.isArray(result.windows));
});

test('fetchSolUsdPrice returns number or null gracefully without throwing on 429/timeout', async () => {
  const p1 = await fetchSolUsdPrice({ ttlMs: 1000 });
  assert.ok(p1 === null || (typeof p1 === 'number' && p1 > 0));
  // Second immediate call should hit cache without network throw
  const p2 = await fetchSolUsdPrice({ ttlMs: 10_000 });
  assert.strictEqual(p1, p2);
});

