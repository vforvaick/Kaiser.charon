import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCounterfactualAudit, formatCounterfactualReport } from '../scripts/run_counterfactual_analysis.js';
import { runPromotionAudit, formatPromotionReport } from '../scripts/run_promotion_audit.js';
import { db, initDb } from '../src/db/connection.js';

initDb();

describe('CLI Script Audits: Counterfactual & Promotion Scorecard', () => {
  it('runs counterfactual audit cleanly on current test database', () => {
    // Insert test signal capture
    const ts = Date.now() - 500_000;
    db.prepare(`
      INSERT INTO signal_captures (
        signal_id, mint, strategy_id, observed_at_ms, decision_at_ms,
        passed_prefilter, failure_reasons_json, entry_price_usd, forward_1h_price,
        capture_status, metadata_json, created_at_ms
      ) VALUES ('audit_sig_1', 'audit_mint_1', 'sniper', ?, ?, 1, '[]', 1.0, 1.5, 'complete', '{}', ?)
    `).run(ts, ts, ts);

    const res = runCounterfactualAudit(process.env.DB_PATH);
    assert.equal(res.status, 'COMPLETE');
    assert.ok(res.analysis);
    assert.ok(res.analysis.evaluatedCompleteCount > 0);

    const reportText = formatCounterfactualReport(res);
    assert.ok(reportText.includes('COUNTERFACTUAL SIGNAL & ALPHA LEAKAGE REPORT'));
    assert.ok(reportText.includes('Sensitivity'));
  });

  it('runs promotion audit cleanly on current test database', () => {
    // Insert test positions
    const ts = Date.now() - 86400000;
    for (let i = 1; i <= 55; i++) {
      db.prepare(`
        INSERT INTO dry_run_positions (
          candidate_id, mint, status, opened_at_ms, closed_at_ms, size_sol, tp_percent, sl_percent,
          trailing_enabled, trailing_percent, pnl_sol, pnl_percent, snapshot_json
        ) VALUES (1, ?, 'closed', ?, ?, 0.05, 30, -15, 1, 10, 0.01, 20.0, '{}')
      `).run(`audit_mint_${i}`, ts + i * 1000, ts + i * 1000 + 500);
    }

    const res = runPromotionAudit(process.env.DB_PATH);
    assert.equal(res.status, 'COMPLETE');
    assert.ok(res.fingerprint);
    assert.ok(res.scorecard);
    assert.equal(typeof res.scorecard.stage1Verdict, 'string');

    const reportText = formatPromotionReport(res);
    assert.ok(reportText.includes('STRATEGY PROMOTION SCORECARD AUDIT'));
    assert.ok(reportText.includes('Dataset SHA-256 Fingerprint'));
  });
});
