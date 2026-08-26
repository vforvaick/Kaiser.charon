import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeClusteredBootstrap, computeCvar95, generateDatasetFingerprint } from '../src/backtest/statisticalRigor.js';
import {
  recordSignalObservation,
  flushTelemetryQueue,
  updateSignalDecision,
  resolvePendingForwardMarks,
  getSignalCapturesByStrategy
} from '../src/telemetry/forwardCapture.js';
import { analyzeCounterfactualOutcomes } from '../src/backtest/counterfactualAnalyzer.js';
import { evaluatePromotionScorecard } from '../src/backtest/promotionScorecard.js';
import { initDb } from '../src/db/connection.js';

initDb();

describe('Ticket 00: Forward Capture & Immutability Schema', () => {
  it('enqueues signal observation, flushes queue, and updates decision outcomes', () => {
    const mint = 'testSignalCaptureMint11111111111111111111';
    recordSignalObservation({
      mint,
      signalId: 'sig_123',
      strategyId: 'sniper',
      observedAtMs: 1700000000000,
    });

    flushTelemetryQueue();

    // Update decision outcome after screening
    const updatedDecision = updateSignalDecision('sig_123', {
      passedPrefilter: true,
      failureReasons: [],
      entryPriceUsd: 0.001,
      entryMcapUsd: 50000,
    });
    assert.equal(updatedDecision, true);

    const rows = getSignalCapturesByStrategy('sniper', { sinceMs: 1700000000000 });
    const match = rows.find(r => r.mint === mint);
    assert.ok(match);
    assert.equal(match.passed_prefilter, true);
    assert.equal(match.entry_price_usd, 0.001);
  });

  it('resolves pending forward price marks asynchronously via rate-limited worker', async () => {
    const mockPriceFetcher = async (_mint) => 0.0025;
    const res = await resolvePendingForwardMarks(mockPriceFetcher, { maxBatch: 10 });
    assert.ok(typeof res.resolved === 'number');
    assert.ok(typeof res.pending === 'number');
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

  it('enforces iteration bounds (clamps to 1000-10000) and computes 95% LCB', () => {
    const trades = [];
    // 10 distinct days with positive average return
    for (let day = 1; day <= 10; day++) {
      const ts = 1700000000000 + day * 86400000;
      trades.push({ opened_at_ms: ts, netPnl: 0.005 });
      trades.push({ opened_at_ms: ts + 1000, netPnl: 0.010 });
    }

    // Input 500 should be clamped to 1,000
    const res = computeClusteredBootstrap(trades, { iterations: 500, minDailyBlocks: 5 });
    assert.equal(res.status, 'COMPLETE');
    assert.equal(res.iterations, 1000, 'Iterations should be clamped to minimum 1,000');
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
  it('passes Stage 1 when all critical criteria are met (LCB > 0, Daily >= 70%)', () => {
    const trades = Array.from({ length: 60 }, (_, i) => ({
      opened_at_ms: 1700000000000 + i * 86400000,
      netPnl: i % 4 === 0 ? -0.005 : 0.015, // 45 wins (75% positive days)
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

  it('fails Stage 1 when bootstrap LCB is non-positive or daily consistency < 70%', () => {
    const trades = Array.from({ length: 60 }, (_, i) => ({
      opened_at_ms: 1700000000000 + i * 86400000,
      netPnl: i % 2 === 0 ? -0.005 : 0.010, // 50% positive days
    }));

    const portfolioSummary = {
      executedTradesCount: 60,
      netRealizedPnlSol: 0.15,
      profitFactor: 2.0,
    };

    const bootstrapStats = {
      status: 'COMPLETE',
      lcb95Sol: -0.001, // Negative LCB
    };

    const scorecard = evaluatePromotionScorecard({
      strategyId: 'degen',
      trades,
      portfolioSummary,
      bootstrapStats,
      cvarStats: { cvar95Sol: -0.005 },
    });

    assert.equal(scorecard.stage1Verdict, 'STAGE_1_FAIL');
  });
});
