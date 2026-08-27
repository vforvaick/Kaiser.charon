import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterCandidate } from '../src/pipeline/candidateBuilder.js';
import { db, initDb } from '../src/db/connection.js';
import * as settings from '../src/db/settings.js';

// Ensure schema & seed strategies are fully initialized
initDb();

function withStrategy(stratId, overrides, fn) {
  const strat = db.prepare('SELECT config_json FROM strategies WHERE id = ?').get(stratId);
  const base = JSON.parse(strat.config_json);
  const patched = { ...base, ...overrides };
  db.prepare('UPDATE strategies SET config_json = ? WHERE id = ?').run(JSON.stringify(patched), stratId);
  settings.setActiveStrategy(stratId);
  settings.updateStrategyConfig(stratId, patched);
  try {
    return fn();
  } finally {
    db.prepare('UPDATE strategies SET config_json = ? WHERE id = ?').run(JSON.stringify(base), stratId);
    settings.setActiveStrategy('sniper');
    settings.updateStrategyConfig(stratId, base);
  }
}

function makeCandidate({ mcap = 45000, maxHolder = 5, top10Pct = 25, holdersList = [] } = {}) {
  return {
    token: { mint: 'degenTestMint1111111111111111111111111', symbol: 'DEGEN' },
    metrics: { marketCapUsd: mcap, gmgnTotalFeesSol: 0, graduatedVolumeUsd: 0, holderCount: 50 },
    holders: {
      maxHolderPercent: maxHolder,
      top20: holdersList,
      top20Percent: holdersList.reduce((acc, h) => acc + (h.percent || 0), 0)
    },
    savedWalletExposure: { holderCount: 0 },
    signals: { route: 'trending' },
    feeClaim: null,
    trending: { volume: 50000, swaps: 500, rug_ratio: 0.1, bundler_rate: 0.2 },
    jupiterAsset: {
      usdPrice: 0.00045,
      audit: { topHoldersPercentage: top10Pct }
    },
    executionRefresh: null
  };
}

describe('Ticket 01 & SPEC-005: Canonical Degen Strategy Profile', () => {
  it('loads canonical degen strategy with tuned parameters ($25k-$80k mcap)', () => {
    const strat = settings.strategyById('degen');
    assert.ok(strat, 'Degen strategy exists');
    assert.equal(strat.min_mcap_usd, 25000);
    assert.equal(strat.max_mcap_usd, 80000);
    assert.equal(strat.tp_percent, 30);
    assert.equal(strat.sl_percent, -15);
    assert.equal(strat.trailing_enabled, true);
    assert.equal(strat.trailing_percent, 10);
    assert.equal(strat.position_size_sol, 0.05);
    assert.equal(strat.max_open_positions, 5);
  });

  it('rejects candidates below $25k mcap when degen is active', () => {
    withStrategy('degen', {}, () => {
      const res = filterCandidate(makeCandidate({ mcap: 24000 }));
      assert.equal(res.passed, false);
      assert.ok(res.failures.some(f => f.includes('market cap min: 24000 < 25000')));
    });
  });

  it('rejects candidates above $80k mcap when degen is active', () => {
    withStrategy('degen', {}, () => {
      const res = filterCandidate(makeCandidate({ mcap: 85000 }));
      assert.equal(res.passed, false);
      assert.ok(res.failures.some(f => f.includes('market cap max: 85000 > 80000')));
    });
  });

  it('passes candidates inside the $25k-$80k sweet spot (e.g. $45k)', () => {
    withStrategy('degen', {}, () => {
      const res = filterCandidate(makeCandidate({ mcap: 45000 }));
      assert.equal(res.passed, true);
    });
  });
});

describe('Ticket 02: Top-10 Cumulative Holder Distribution Seam', () => {
  it('passes when max_top10_holder_percent is 0/undefined (disabled default)', () => {
    withStrategy('degen', { max_top10_holder_percent: 0 }, () => {
      const res = filterCandidate(makeCandidate({ top10Pct: 75 }));
      assert.equal(res.passed, true);
    });
  });

  it('rejects candidate when cumulative top10 exceeds max_top10_holder_percent', () => {
    withStrategy('degen', { max_top10_holder_percent: 30 }, () => {
      const res = filterCandidate(makeCandidate({ top10Pct: 35 }));
      assert.equal(res.passed, false);
      assert.ok(res.failures.some(f => f.includes('top10 cumulative holders: 35.0% > 30%')));
    });
  });

  it('computes cumulative top10 from holders.top20 array when audit topHoldersPercentage is missing', () => {
    withStrategy('degen', { max_top10_holder_percent: 30 }, () => {
      const topHolders = Array.from({ length: 10 }, () => ({ percent: 3.5 })); // total 35%
      const cand = makeCandidate({ top10Pct: null, holdersList: topHolders });
      delete cand.jupiterAsset.audit;
      const res = filterCandidate(cand);
      assert.equal(res.passed, false);
      assert.ok(res.failures.some(f => f.includes('top10 cumulative holders: 35.0% > 30%')));
    });
  });

  it('passes when cumulative top10 is below threshold', () => {
    withStrategy('degen', { max_top10_holder_percent: 30 }, () => {
      const res = filterCandidate(makeCandidate({ top10Pct: 22 }));
      assert.equal(res.passed, true);
    });
  });
});

describe('Ticket 04: Seed Strategy Registration & Shadow Profiles', () => {
  it('registers obicle_degen with valid disabled seed config', () => {
    const strat = settings.strategyById('obicle_degen');
    assert.ok(strat, 'obicle_degen strategy registered in db');
    assert.equal(strat.min_mcap_usd, 7000);
    assert.equal(strat.max_mcap_usd, 20000);
    assert.equal(strat.sl_percent, -85);
    assert.equal(strat.tp_percent, 50);
  });

  it('registers el_ponny with valid disabled seed config', () => {
    const strat = settings.strategyById('el_ponny');
    assert.ok(strat, 'el_ponny strategy registered in db');
    assert.equal(strat.max_top10_holder_percent, 30);
    assert.equal(strat.trending_max_bundler_rate, 0.30);
    assert.equal(strat.trending_min_volume_usd, 50000);
    assert.equal(strat.trending_min_swaps, 5000);
  });
});

