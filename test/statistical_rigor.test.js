import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeClusteredBootstrap, computeCvar95, generateDatasetFingerprint } from '../src/backtest/statisticalRigor.js';
import { recordSignalObservation, updateForwardPriceMarks, getSignalCapturesByStrategy } from '../src/telemetry/forwardCapture.js';
import { analyzeCounterfactualOutcomes } from '../src/backtest/counterfactualAnalyzer.js';
import { evaluatePromotionScorecard } from '../src/backtest/promotionScorecard.js';
import { initDb } from '../src/db/connection.js';

initDb();

describe('Ticket 00: Forward Capture & Immutability Schema', () => {
  it('records an immutable signal capture observation and updates forward marks', () => {
    const mint = 'testSignalCaptureMint11111111111111111111';
    const id = recordSignalObservation({
      mint,
      signalId: 'sig_123',
      strategyId: 'sniper',
      observedAtMs: 1700000000000,
      passedPrefilter: true,
      entryPriceUsd: 0.001,
      entryMcapUsd: 50000,
    });

    assert.ok(id > 0, 'Row ID returned');

    const updated = updateForwardPriceMarks(id, {
      forward5mPrice: 0.0012,
      forward15mPrice: 0.0015,
      forward1hPrice: 0.0020,
      captureStatus: 'complete',
    });
    assert.equal(updated, true);

    const rows = getSignalCapturesByStrategy('sniper', { sinceMs: 1700000000000 });
    const match = rows.find(r => r.id === id);
    assert.ok(match);
    assert.equal(match.mint, mint);
    assert.equal(match.passed_prefilter, true);
    assert.equal(match.forward_1h_price, 0.0020);
    assert.equal(match.capture_status, 'complete');
  });
});

describe('Ticket 02: Clustered Bootstrap & CVaR Tail Risk', () => {
  it('returns INCONCLUSIVE when daily block count is below threshold', () => {
    const trades = [
      { opened_at_ms: 1700000000000, netPnl: 0.01 },
      { opened_at_ms: 1700000000000, netPnl: 0.02 },
    ];
    const res = computeClusteredBootstrap(trades, { minDailyBlocks: 5 });
    assert.equal(res.status, 'INCONCLUSIVE');
  });

  it('computes 95% bootstrap confidence bounds across multi-day blocks', () => {
    const trades = [];
    // 10 distinct days with positive average return
    for (let day = 1; day <= 10; day++) {
      const ts = 1700000000000 + day * 86400000;
      trades.push({ opened_at_ms: ts, netPnl: 0.005 });
      trades.push({ opened_at_ms: ts + 1000, netPnl: 0.010 });
    }

    const res = computeClusteredBootstrap(trades, { iterations: 500, minDailyBlocks: 5 });
    assert.equal(res.status, 'COMPLETE');
    assert.ok(res.lcb95Sol > 0, '95% LCB should be positive');
    assert.equal(res.isPositiveEdgeConfirmed, true);
  });

  it('computes CVaR 95% Expected Shortfall on worst tail losses', () => {
    // 100 trades with negative tail
    const pnlList = Array.from({ length: 95 }, () => 0.01);
    pnlList.push(-0.05, -0.06, -0.07, -0.08, -0.10); // worst 5%

    const res = computeCvar95(pnlList, 5);
    assert.equal(res.status, 'COMPLETE');
    assert.equal(res.tailCount, 5);
    assert.ok(res.cvar95Sol < -0.065 && res.cvar95Sol > -0.075);
  });

  it('generates deterministic SHA-256 fingerprint for dataset rows', () => {
    const rows1 = [{ id: 1, pnl: 0.05 }, { id: 2, pnl: -0.02 }];
    const rows2 = [{ id: 1, pnl: 0.05 }, { id: 2, pnl: -0.02 }];
    const hash1 = generateDatasetFingerprint(rows1);
    const hash2 = generateDatasetFingerprint(rows2);
    assert.equal(hash1, hash2);
    assert.equal(typeof hash1, 'string');
    assert.equal(hash1.length, 64);
  });
});

describe('Ticket 03: Counterfactual Signal Analyzer', () => {
  it('computes confusion matrix and false-negative alpha leakage', () => {
    const captures = [
      // True Positive (passed & runner +50%)
      { entry_price_usd: 1.0, forward_1h_price: 1.5, passed_prefilter: true, failure_reasons: [] },
      // False Positive (passed & rug -50%)
      { entry_price_usd: 1.0, forward_1h_price: 0.5, passed_prefilter: true, failure_reasons: [] },
      // True Negative (rejected & rug -60%)
      { entry_price_usd: 1.0, forward_1h_price: 0.4, passed_prefilter: false, failure_reasons: ['bundler_rate > 30%'] },
      // False Negative (rejected & runner +100% — Alpha Leakage)
      { entry_price_usd: 1.0, forward_1h_price: 2.0, passed_prefilter: false, failure_reasons: ['top10 > 30%'] },
    ];

    const res = analyzeCounterfactualOutcomes(captures);
    assert.equal(res.status, 'COMPLETE');
    assert.equal(res.confusionMatrix.truePositives, 1);
    assert.equal(res.confusionMatrix.falsePositives, 1);
    assert.equal(res.confusionMatrix.trueNegatives, 1);
    assert.equal(res.confusionMatrix.falseNegatives, 1);
    assert.equal(res.metrics.alphaLeakageRunnersCount, 1);
    assert.equal(res.metrics.topLeakingFilterReasons[0].reason, 'top10 > 30%');
  });
});

describe('Ticket 04: 4-Stage Promotion Scorecard', () => {
  it('evaluates Stage 1 Causal Replay promotion criteria cleanly', () => {
    const trades = Array.from({ length: 60 }, (_, i) => ({
      opened_at_ms: 1700000000000 + i * 86400000,
      netPnl: i % 3 === 0 ? -0.005 : 0.015, // 40 wins (+0.60), 20 losses (-0.10)
    }));

    const portfolioSummary = {
      executedTradesCount: 60,
      netRealizedPnlSol: 0.50,
      profitFactor: 6.0,
    };

    const bootstrapStats = {
      status: 'COMPLETE',
      lcb95Sol: 0.006,
    };

    const scorecard = evaluatePromotionScorecard({
      strategyId: 'degen',
      trades,
      portfolioSummary,
      bootstrapStats,
      cvarStats: { cvar95Sol: -0.005 },
    });

    assert.equal(scorecard.stage1Verdict, 'STAGE_1_PASS');
    assert.equal(scorecard.summary.totalTrades, 60);
    assert.ok(scorecard.checks.every(c => c.passed));
  });
});
