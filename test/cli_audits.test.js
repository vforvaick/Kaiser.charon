import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCounterfactualAudit, formatCounterfactualReport } from '../scripts/run_counterfactual_analysis.js';
import { runPromotionAudit, formatPromotionReport } from '../scripts/run_promotion_audit.js';
import { db, initDb } from '../src/db/connection.js';

initDb();

describe('CLI Script Audits: Counterfactual & Promotion Scorecard', () => {
  it('handles inconclusive counterfactual audit when signal_captures is empty', () => {
    db.prepare('DELETE FROM signal_captures').run();
    const res = runCounterfactualAudit(process.env.DB_PATH);
    assert.equal(res.status, 'COMPLETE');
    assert.equal(res.analysis.status, 'INCONCLUSIVE');
    const text = formatCounterfactualReport(res);
    assert.ok(text.includes('INCONCLUSIVE'));
  });

  it('runs counterfactual audit and validates exact confusion matrix and alpha leakage', () => {
    db.prepare('DELETE FROM signal_captures').run();
    const ts = Date.now() - 500_000;
    // 1 TP (passed & runner +50%)
    db.prepare("INSERT INTO signal_captures (signal_id, mint, strategy_id, observed_at_ms, passed_prefilter, entry_price_usd, forward_1h_price, capture_status, created_at_ms) VALUES ('s1', 'm1', 'sniper', ?, 1, 1.0, 1.5, 'complete', ?)").run(ts, ts);
    // 1 FP (passed & non-runner +10%)
    db.prepare("INSERT INTO signal_captures (signal_id, mint, strategy_id, observed_at_ms, passed_prefilter, entry_price_usd, forward_1h_price, capture_status, created_at_ms) VALUES ('s2', 'm2', 'sniper', ?, 1, 1.0, 1.1, 'complete', ?)").run(ts, ts);
    // 1 TN (rejected & non-runner -50%)
    db.prepare("INSERT INTO signal_captures (signal_id, mint, strategy_id, observed_at_ms, passed_prefilter, entry_price_usd, forward_1h_price, capture_status, created_at_ms) VALUES ('s3', 'm3', 'sniper', ?, 0, 1.0, 0.5, 'complete', ?)").run(ts, ts);
    // 1 FN (rejected & runner +100% — leakage)
    db.prepare("INSERT INTO signal_captures (signal_id, mint, strategy_id, observed_at_ms, passed_prefilter, failure_reasons_json, entry_price_usd, forward_1h_price, capture_status, created_at_ms) VALUES ('s4', 'm4', 'sniper', ?, 0, '[\"top10 > 30%\"]', 1.0, 2.0, 'complete', ?)").run(ts, ts);

    const res = runCounterfactualAudit(process.env.DB_PATH, { runnerGainPct: 25.0 });
    assert.equal(res.status, 'COMPLETE');
    assert.equal(res.analysis.evaluatedCompleteCount, 4);
    assert.equal(res.analysis.confusionMatrix.truePositives, 1);
    assert.equal(res.analysis.confusionMatrix.falsePositives, 1);
    assert.equal(res.analysis.confusionMatrix.trueNegatives, 1);
    assert.equal(res.analysis.confusionMatrix.falseNegatives, 1);
    assert.equal(res.analysis.metrics.alphaLeakageRunnersCount, 1);

    const reportText = formatCounterfactualReport(res);
    assert.ok(reportText.includes('COUNTERFACTUAL SIGNAL & ALPHA LEAKAGE REPORT'));
    assert.ok(reportText.includes('True Positives'));
    assert.ok(reportText.includes('top10 > 30%'));
  });

  it('runs promotion audit across multi-day blocks with complete bootstrap and CVaR calculations', () => {
    db.prepare('DELETE FROM dry_run_positions').run();
    // Insert 100 trades across 10 distinct days (10 trades/day) to guarantee complete day-block bootstrap and CVaR tail (5% tail = 5 trades >= 5 required)
    for (let day = 1; day <= 10; day++) {
      const dayTs = Date.now() - (11 - day) * 86400000;
      for (let t = 1; t <= 10; t++) {
        const pnl = (day % 4 === 0 && t === 1) ? -0.015 : 0.010;
        db.prepare(`
          INSERT INTO dry_run_positions (
            candidate_id, mint, status, opened_at_ms, closed_at_ms, size_sol, tp_percent, sl_percent,
            trailing_enabled, trailing_percent, pnl_sol, pnl_percent, snapshot_json
          ) VALUES (1, ?, 'closed', ?, ?, 0.05, 30, -15, 1, 10, ?, 20.0, '{}')
        `).run(`audit_mint_${day}_${t}`, dayTs + t * 1000, dayTs + t * 1000 + 500, pnl);
      }
    }

    const res = runPromotionAudit(process.env.DB_PATH);
    assert.equal(res.status, 'COMPLETE');
    assert.equal(res.bootstrapStats.status, 'COMPLETE');
    assert.ok(res.bootstrapStats.lcb95Sol > 0);
    assert.equal(res.cvarStats.status, 'COMPLETE');
    assert.ok(res.fingerprint);
    assert.equal(res.scorecard.stage1Verdict, 'STAGE_1_PASS');

    const reportText = formatPromotionReport(res);
    assert.ok(reportText.includes('STRATEGY PROMOTION SCORECARD AUDIT'));
    assert.ok(reportText.includes('Dataset SHA-256 Fingerprint'));
    assert.ok(reportText.includes('STAGE_1_PASS'));
  });
});
