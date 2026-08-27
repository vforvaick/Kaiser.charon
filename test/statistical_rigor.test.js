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
import { initDb, db } from '../src/db/connection.js';

initDb();

describe('Ticket 00: Forward Capture & Immutability Schema', () => {
  it('enqueues signal observation, flushes queue, and updates decision outcomes', () => {
    db.prepare('DELETE FROM signal_captures').run();
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

    // Explicitly flush queued decision update
    flushTelemetryQueue();

    const rows = getSignalCapturesByStrategy('sniper', { sinceMs: 1700000000000 });
    const match = rows.find(r => r.mint === mint);
    assert.ok(match);
    assert.equal(match.passed_prefilter, true);
    assert.equal(match.entry_price_usd, 0.001);
  });

  it('resolves pending forward price marks asynchronously with strict global fetch budget cap', async () => {
    // Clear test signal captures to isolate budget test
    db.prepare("DELETE FROM signal_captures WHERE signal_id LIKE 'due_sig_%'").run();

    // Insert 10 pending test captures due for resolution (>5m ago)
    const oldTs = Date.now() - 400_000;
    for (let i = 1; i <= 10; i++) {
      db.prepare(`
        INSERT INTO signal_captures (
          signal_id, mint, strategy_id, observed_at_ms, decision_at_ms,
          passed_prefilter, failure_reasons_json, entry_price_usd, entry_mcap_usd,
          capture_status, metadata_json, created_at_ms
        ) VALUES (?, ?, 'sniper', ?, ?, 1, '[]', 0.001, 50000, 'pending', '{}', ?)
      `).run(`due_sig_${i}`, `due_mint_${i}`, oldTs, oldTs, oldTs);
    }

    let fetchAttempts = 0;
    // Mock price fetcher that throws on attempt 1, returns null on attempt 2, and returns price on attempt 3+
    const mockPriceFetcher = async (_mint) => {
      fetchAttempts++;
      if (fetchAttempts === 1) throw new Error('Simulated network error');
      if (fetchAttempts === 2) return null; // Price unavailable
      return 0.0025; // Success
    };

    const maxBudget = 5;
    const res = await resolvePendingForwardMarks(mockPriceFetcher, { maxBatch: maxBudget, scanAllDatabases: false });

    assert.ok(typeof res.resolved === 'number');
    assert.ok(typeof res.pending === 'number');
    // Strictly prove that fetch attempts exactly reached maxBudget (5) and did not exceed it despite failures/exceptions
    assert.equal(fetchAttempts, maxBudget, `Fetch attempts (${fetchAttempts}) must strictly equal maxBudget (${maxBudget})`);
    assert.ok(res.resolved > 0 && res.resolved < maxBudget, 'Only non-failing attempts should be resolved');

    // Clean up test rows
    db.prepare("DELETE FROM signal_captures WHERE signal_id LIKE 'due_sig_%'").run();
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

  it('fails Stage 1 when second chronological half is negative (multi-window instability)', () => {
    const trades = [
      // First half (positive +0.20)
      ...Array.from({ length: 30 }, (_, i) => ({
        opened_at_ms: 1700000000000 + i * 86400000,
        netPnl: 0.010,
      })),
      // Second half (negative -0.15)
      ...Array.from({ length: 30 }, (_, i) => ({
        opened_at_ms: 1700000000000 + (30 + i) * 86400000,
        netPnl: -0.005,
      })),
    ];

    const portfolioSummary = {
      executedTradesCount: 60,
      netRealizedPnlSol: 0.05,
      profitFactor: 1.33,
    };

    const bootstrapStats = {
      status: 'COMPLETE',
      lcb95Sol: 0.001,
    };

    const scorecard = evaluatePromotionScorecard({
      strategyId: 'degen',
      trades,
      portfolioSummary,
      bootstrapStats,
      cvarStats: { cvar95Sol: -0.005 },
    });

    assert.equal(scorecard.stage1Verdict, 'STAGE_1_FAIL');
    const windowCheck = scorecard.checks.find(c => c.name === 'Two Non-Overlapping Windows Stability');
    assert.ok(windowCheck);
    assert.equal(windowCheck.passed, false);
  });
});
