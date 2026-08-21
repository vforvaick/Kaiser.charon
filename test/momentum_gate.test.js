import assert from 'node:assert';
import test from 'node:test';
import { momentumFilter, resolveCandidatePrice } from '../src/pipeline/momentumFilter.js';

test('resolveCandidatePrice returns null when candidate has no price', () => {
  assert.strictEqual(resolveCandidatePrice(null), null);
  assert.strictEqual(resolveCandidatePrice({}), null);
  assert.strictEqual(resolveCandidatePrice({ token: { mint: 'abc' } }), null);
  assert.strictEqual(resolveCandidatePrice({ gmgn: { price: 0 } }), null);
  assert.strictEqual(resolveCandidatePrice({ gmgn: { price: -5 } }), null);
  assert.strictEqual(resolveCandidatePrice({ metrics: { priceUsd: 'invalid' } }), null);
});

test('resolveCandidatePrice extracts price from numeric gmgn.price', () => {
  const candidate = { gmgn: { price: 0.00015 } };
  assert.strictEqual(resolveCandidatePrice(candidate), 0.00015);
});

test('resolveCandidatePrice extracts price from gmgn.price object', () => {
  const candidate = { gmgn: { price: { price: 0.00025, price_1h: 0.0002 } } };
  assert.strictEqual(resolveCandidatePrice(candidate), 0.00025);
});

test('resolveCandidatePrice extracts fallback from jupiterAsset, metrics, trending, trenches', () => {
  assert.strictEqual(resolveCandidatePrice({ jupiterAsset: { usdPrice: 0.00035 } }), 0.00035);
  assert.strictEqual(resolveCandidatePrice({ metrics: { priceUsd: 0.00045 } }), 0.00045);
  assert.strictEqual(resolveCandidatePrice({ trending: { price: 0.00055 } }), 0.00055);
  assert.strictEqual(resolveCandidatePrice({ trenchesEntry: { price: 0.00065 } }), 0.00065);
});

test('momentumFilter short-circuits with no_price_data when candidate has no price', async () => {
  const candidate = { token: { mint: '11111111111111111111111111111111' } };
  const result = await momentumFilter(candidate, 0.5);
  assert.deepStrictEqual(result, { passed: true, score: 1.0, reason: 'no_price_data' });
});
