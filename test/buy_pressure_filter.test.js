import assert from 'node:assert';
import test from 'node:test';
import { filterCandidate } from '../src/pipeline/candidateBuilder.js';
import { db } from '../src/db/connection.js';
import * as settings from '../src/db/settings.js';

// Helper: run filterCandidate with ephemeral strategy override (bust 5s strategyCache)
function withStrategy(overrides, fn) {
  const strat = db.prepare('SELECT config_json FROM strategies WHERE id = ?').get('sniper');
  const base = JSON.parse(strat.config_json);
  const patched = { ...base, ...overrides };
  db.prepare('UPDATE strategies SET config_json = ? WHERE id = ?').run(JSON.stringify(patched), 'sniper');
  db.prepare('UPDATE strategies SET enabled = 1 WHERE id = ?').run('sniper');
  // bust activeStrategy cache so filterCandidate sees override
  settings.activeStrategy(); // prime
  // mutate cache at source
  const cache = settings.strategyCache;
  if (cache) { cache.config = null; cache.at = 0; }
  else {
    // fallback: updateStrategyConfig invalidates when id matches, otherwise touch db row via setActiveStrategy
    settings.updateStrategyConfig('sniper', patched);
    db.prepare('UPDATE strategies SET config_json = ? WHERE id = ?').run(JSON.stringify(patched), 'sniper');
  }
  try { return fn(); } finally {
    db.prepare('UPDATE strategies SET config_json = ? WHERE id = ?').run(JSON.stringify(base), 'sniper');
    const c2 = settings.strategyCache;
    if (c2) { c2.config = null; c2.at = 0; }
  }
}

function makeCandidate({ s1hBuy, s1hSell, s5mBuy, s5mSell } = {}) {
  return {
    token: { mint: 'testmint1234567890', symbol: 'TEST' },
    metrics: { marketCapUsd: 50000, gmgnTotalFeesSol: 0, graduatedVolumeUsd: 0, holderCount: 50 },
    holders: { maxHolderPercent: 10 },
    savedWalletExposure: { holderCount: 0 },
    signals: { route: 'trending' },
    feeClaim: null,
    trending: {
      volume: 10000, swaps: 200, rug_ratio: 0, bundler_rate: 0,
      stats1h: { buyVolume: s1hBuy, sellVolume: s1hSell },
      stats5m: { buyVolume: s5mBuy ?? s1hBuy, sellVolume: s5mSell ?? s1hSell },
    },
    jupiterAsset: { usdPrice: 0.001, audit: { topHolders: [] } },
    executionRefresh: null,
  };
}

test('disabled by default (min 0) lets candidate pass regardless of ratio', () => {
  withStrategy({ min_buy_sell_ratio_1h: 0, min_buy_sell_ratio_5m: 0 }, () => {
    const cand = makeCandidate({ s1hBuy: 100, s1hSell: 200 }); // ratio 0.5
    const res = filterCandidate(cand);
    assert.ok(!res.failures.some(f => f.includes('buy_sell_ratio_1h')));
    assert.ok(!res.failures.some(f => f.includes('buy_sell_ratio_5m')));
  });
});

test('rejects when 1h ratio below threshold', () => {
  withStrategy({ min_buy_sell_ratio_1h: 2.0 }, () => {
    const cand = makeCandidate({ s1hBuy: 100, s1hSell: 100 }); // 1.0 < 2.0
    const res = filterCandidate(cand);
    assert.ok(res.failures.some(f => f.includes('buy_sell_ratio_1h')));
  });
});

test('passes when 1h ratio meets threshold', () => {
  withStrategy({ min_buy_sell_ratio_1h: 2.0 }, () => {
    const cand = makeCandidate({ s1hBuy: 300, s1hSell: 100 }); // 3.0 >= 2.0
    const res = filterCandidate(cand);
    assert.ok(!res.failures.some(f => f.includes('buy_sell_ratio_1h')));
  });
});

test('5m filter independent of 1h filter', () => {
  withStrategy({ min_buy_sell_ratio_5m: 1.5 }, () => {
    const cand = makeCandidate({ s1hBuy: 500, s1hSell: 100, s5mBuy: 100, s5mSell: 100 }); // 5m 1.0 < 1.5
    const res = filterCandidate(cand);
    assert.ok(res.failures.some(f => f.includes('buy_sell_ratio_5m')));
  });
});

test('null ratio (no trending volume) does not block when disabled by data absence', () => {
  withStrategy({ min_buy_sell_ratio_1h: 2.0 }, () => {
    const cand = makeCandidate({ s1hBuy: 0, s1hSell: 0 });
    cand.trending = null;
    const res = filterCandidate(cand);
    // when trending absent, block is skipped (fail-open, let momentum model decide)
    assert.ok(!res.failures.some(f => f.includes('buy_sell_ratio_1h')));
  });
});
