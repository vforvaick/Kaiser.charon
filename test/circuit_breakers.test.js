import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  canOpenPositionRiskCheck,
  tripCircuitBreaker,
  resetCircuitBreaker,
  getCircuitBreakerStatus,
  RISK_LIMITS,
} from '../src/execution/circuitBreakers.js';
import { db, initDb } from '../src/db/connection.js';

initDb();

describe('Ticket 01 (SPEC-005): Runtime Risk Controls & Circuit Breakers', () => {
  beforeEach(() => {
    // Reset all breakers and clear test positions before test
    db.prepare('DELETE FROM risk_circuit_breakers').run();
    db.prepare("DELETE FROM dry_run_positions WHERE mint = 'lossMint'").run();
  });

  it('allows entry when system is healthy and no limits are breached', () => {
    const res = canOpenPositionRiskCheck({ quoteAgeMs: 5000, slippageBps: 100 });
    assert.equal(res.allowed, true);
  });

  it('blocks entry when quote is stale (>30s)', () => {
    const res = canOpenPositionRiskCheck({ quoteAgeMs: 35000, slippageBps: 100 });
    assert.equal(res.allowed, false);
    assert.ok(res.reason.includes('STALE_QUOTE'));
  });

  it('blocks entry when slippage exceeds threshold (>500 bps)', () => {
    const res = canOpenPositionRiskCheck({ quoteAgeMs: 5000, slippageBps: 600 });
    assert.equal(res.allowed, false);
    assert.ok(res.reason.includes('EXCESSIVE_SLIPPAGE'));
  });

  it('latches circuit breaker on 3 consecutive losses and blocks entry', () => {
    // Insert 3 recent consecutive loss positions
    const ts = Date.now();
    for (let i = 0; i < 3; i++) {
      db.prepare(`
        INSERT INTO dry_run_positions (
          candidate_id, mint, status, opened_at_ms, closed_at_ms, size_sol, tp_percent, sl_percent,
          trailing_enabled, trailing_percent, pnl_sol, pnl_percent, snapshot_json
        ) VALUES (1, 'lossMint', 'closed', ?, ?, 0.05, 30, -15, 1, 10, -0.0075, -15.0, '{}')
      `).run(ts - (3 - i) * 1000, ts - (3 - i) * 500);
    }

    const res = canOpenPositionRiskCheck();
    assert.equal(res.allowed, false);
    assert.ok(res.reason.includes('CONSECUTIVE_LOSS_LIMIT'));

    // Verify latch is persistent
    const status = getCircuitBreakerStatus('CONSECUTIVE_LOSS_LIMIT');
    assert.equal(status.isLatched, true);
    assert.equal(status.tripCount, 1);

    // Reset breaker manually
    const reset = resetCircuitBreaker('CONSECUTIVE_LOSS_LIMIT');
    assert.equal(reset, true);

    const afterReset = getCircuitBreakerStatus('CONSECUTIVE_LOSS_LIMIT');
    assert.equal(afterReset.isLatched, false);
  });

  it('latches circuit breaker on daily loss reaching 0.025 SOL', () => {
    const todayTs = new Date().setUTCHours(1, 0, 0, 0);
    db.prepare(`
      INSERT INTO dry_run_positions (
        candidate_id, mint, status, opened_at_ms, closed_at_ms, size_sol, tp_percent, sl_percent,
        trailing_enabled, trailing_percent, pnl_sol, pnl_percent, snapshot_json
      ) VALUES (1, 'lossMint', 'closed', ?, ?, 0.05, 30, -15, 1, 10, -0.0260, -52.0, '{}')
    `).run(todayTs, todayTs + 1000);

    const res = canOpenPositionRiskCheck();
    assert.equal(res.allowed, false);
    assert.ok(res.reason.includes('DAILY_LOSS_LIMIT'));

    resetCircuitBreaker('DAILY_LOSS_LIMIT');
  });

  it('blocks entry when API gateway backoff is active', () => {
    const res = canOpenPositionRiskCheck({ isApiBackoffActive: true });
    assert.equal(res.allowed, false);
    assert.ok(res.reason.includes('API_GATEWAY_BACKOFF_ACTIVE'));
  });

  it('latches circuit breaker on emergency per-trade loss exceeding 0.005 SOL', () => {
    const ts = Date.now();
    db.prepare(`
      INSERT INTO dry_run_positions (
        candidate_id, mint, status, opened_at_ms, closed_at_ms, size_sol, tp_percent, sl_percent,
        trailing_enabled, trailing_percent, pnl_sol, pnl_percent, snapshot_json
      ) VALUES (1, 'lossMint', 'closed', ?, ?, 0.05, 30, -15, 1, 10, -0.0060, -24.0, '{}')
    `).run(ts - 1000, ts);

    const res = canOpenPositionRiskCheck();
    assert.equal(res.allowed, false);
    assert.ok(res.reason.includes('EMERGENCY_PER_TRADE_LOSS'));

    resetCircuitBreaker('EMERGENCY_PER_TRADE_LOSS');
  });

  it('latches circuit breaker on lifetime canary loss exceeding 0.15 SOL', () => {
    // Position from 10 days ago (outside daily and 7-day rolling window)
    const tenDaysAgoTs = Date.now() - 10 * 86400000;
    db.prepare(`
      INSERT INTO dry_run_positions (
        candidate_id, mint, status, opened_at_ms, closed_at_ms, size_sol, tp_percent, sl_percent,
        trailing_enabled, trailing_percent, pnl_sol, pnl_percent, snapshot_json
      ) VALUES (1, 'lossMint', 'closed', ?, ?, 0.05, 30, -15, 1, 10, -0.1600, -80.0, '{}')
    `).run(tenDaysAgoTs - 1000, tenDaysAgoTs);

    const res = canOpenPositionRiskCheck();
    assert.equal(res.allowed, false);
    assert.ok(res.reason.includes('CANARY_LIFETIME_LOSS_LIMIT'));

    resetCircuitBreaker('CANARY_LIFETIME_LOSS_LIMIT');
  });

  it('latches circuit breaker on rolling 7-day loss exceeding 0.075 SOL', () => {
    // 2 days ago loss of 0.08 SOL (outside today, but inside 7 days)
    const twoDaysAgoTs = Date.now() - 2 * 86400000;
    db.prepare(`
      INSERT INTO dry_run_positions (
        candidate_id, mint, status, opened_at_ms, closed_at_ms, size_sol, tp_percent, sl_percent,
        trailing_enabled, trailing_percent, pnl_sol, pnl_percent, snapshot_json
      ) VALUES (1, 'lossMint', 'closed', ?, ?, 0.05, 30, -15, 1, 10, -0.0800, -40.0, '{}')
    `).run(twoDaysAgoTs - 1000, twoDaysAgoTs);

    const res = canOpenPositionRiskCheck();
    assert.equal(res.allowed, false);
    assert.ok(res.reason.includes('ROLLING_7D_LOSS_LIMIT'));

    resetCircuitBreaker('ROLLING_7D_LOSS_LIMIT');
  });

  it('fails closed when database is closed or encounters a query error', () => {
    try {
      Object.defineProperty(db, 'prepare', {
        value: () => { throw new Error('Simulated SQLite disk/lock error'); },
        writable: true,
        configurable: true,
      });
      const status = getCircuitBreakerStatus();
      assert.equal(status.isAnyLatched, true);
      assert.ok(status.latchedBreakers[0].tripReason.includes('Simulated SQLite disk/lock error'));

      const res = canOpenPositionRiskCheck();
      assert.equal(res.allowed, false);
      assert.ok(res.reason.includes('RISK_CHECK_UNAVAILABLE'));
    } finally {
      delete db.prepare; // removes own property so prototype method is restored cleanly
    }
  });
});
