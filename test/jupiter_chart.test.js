import assert from 'node:assert';
import test from 'node:test';
import { fetchJupiterChartContext } from '../src/enrichment/jupiter.js';

test('fetchJupiterChartContext returns consistent summary object shape', async () => {
  const result = await fetchJupiterChartContext('invalid_mint_for_test_123', { ttlMs: 1000 });
  assert.ok(result);
  assert.strictEqual(typeof result.purpose, 'string');
  assert.ok(Array.isArray(result.windows));
});
