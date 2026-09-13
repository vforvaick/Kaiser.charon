import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  canOpenPositionRiskCheck,
  tripCircuitBreaker,
  resetCircuitBreaker,
  getCircuitBreakerStatus,
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
    // Insert 3 recent consecutive loss positions with execution_mode = 'live'
    const ts = Date.now();
    for (let i = 0; i < 3; i++) {
      db.prepare(`
        INSERT INTO dry_run_positions (
          candidate_id, mint, status, opened_at_ms, closed_at_ms, size_sol, tp_percent, sl_percent,
          trailing_enabled, trailing_percent, pnl_sol, pnl_percent, execution_mode, snapshot_json
        ) VALUES (1, 'lossMint', 'closed', ?, ?, 0.05, 30, -15, 1, 10, -0.0075, -15.0, 'live', '{}')
      `).run(ts - (3 - i) * 1000, ts - (3 - i) * 500);
    }

    const res = canOpenPositionRiskCheck({ isLiveMode: true });
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
        trailing_enabled, trailing_percent, pnl_sol, pnl_percent, execution_mode, snapshot_json
      ) VALUES (1, 'lossMint', 'closed', ?, ?, 0.05, 30, -15, 1, 10, -0.0260, -52.0, 'live', '{}')
    `).run(todayTs, todayTs + 1000);

    const res = canOpenPositionRiskCheck({ isLiveMode: true });
    assert.equal(res.allowed, false);
    assert.ok(res.reason.includes('DAILY_LOSS_LIMIT'));

    resetCircuitBreaker('DAILY_LOSS_LIMIT');
  });

  it('blocks entry when API gateway backoff is active (both live and dry-run modes)', () => {
    const liveRes = canOpenPositionRiskCheck({ isApiBackoffActive: true, isLiveMode: true });
    assert.equal(liveRes.allowed, false);
    assert.ok(liveRes.reason.includes('API_GATEWAY_BACKOFF_ACTIVE'));

    const dryRunRes = canOpenPositionRiskCheck({ isApiBackoffActive: true, isLiveMode: false });
    assert.equal(dryRunRes.allowed, false);
    assert.ok(dryRunRes.reason.includes('API_GATEWAY_BACKOFF_ACTIVE'));
  });

  it('blocks entry when quote is stale across all modes (live and dry-run)', () => {
    const liveRes = canOpenPositionRiskCheck({ quoteAgeMs: 35000, isLiveMode: true });
    assert.equal(liveRes.allowed, false);
    assert.ok(liveRes.reason.includes('STALE_QUOTE'));

    const dryRunRes = canOpenPositionRiskCheck({ quoteAgeMs: 35000, isLiveMode: false });
    assert.equal(dryRunRes.allowed, false);
    assert.ok(dryRunRes.reason.includes('STALE_QUOTE'));
  });

  it('blocks entry when slippage exceeds threshold across all modes', () => {
    const liveRes = canOpenPositionRiskCheck({ slippageBps: 600, isLiveMode: true });
    assert.equal(liveRes.allowed, false);
    assert.ok(liveRes.reason.includes('EXCESSIVE_SLIPPAGE'));

    const dryRunRes = canOpenPositionRiskCheck({ slippageBps: 600, isLiveMode: false });
    assert.equal(dryRunRes.allowed, false);
    assert.ok(dryRunRes.reason.includes('EXCESSIVE_SLIPPAGE'));
  });

  it('latches circuit breaker on emergency per-trade loss exceeding 0.005 SOL', () => {
    const ts = Date.now();
    db.prepare(`
      INSERT INTO dry_run_positions (
        candidate_id, mint, status, opened_at_ms, closed_at_ms, size_sol, tp_percent, sl_percent,
        trailing_enabled, trailing_percent, pnl_sol, pnl_percent, execution_mode, snapshot_json
      ) VALUES (1, 'lossMint', 'closed', ?, ?, 0.05, 30, -15, 1, 10, -0.0060, -24.0, 'live', '{}')
    `).run(ts - 1000, ts);

    const res = canOpenPositionRiskCheck({ isLiveMode: true });
    assert.equal(res.allowed, false);
    assert.ok(res.reason.includes('EMERGENCY_PER_TRADE_LOSS'));

    resetCircuitBreaker('EMERGENCY_PER_TRADE_LOSS');
  });

  it('latches circuit breaker on lifetime canary loss exceeding 0.15 SOL', () => {
    // Position from 10 days ago with execution_mode = 'live'
    const tenDaysAgoTs = Date.now() - 10 * 86400000;
    db.prepare(`
      INSERT INTO dry_run_positions (
        candidate_id, mint, status, opened_at_ms, closed_at_ms, size_sol, tp_percent, sl_percent,
        trailing_enabled, trailing_percent, pnl_sol, pnl_percent, execution_mode, snapshot_json
      ) VALUES (1, 'lossMint', 'closed', ?, ?, 0.05, 30, -15, 1, 10, -0.1600, -80.0, 'live', '{}')
    `).run(tenDaysAgoTs - 1000, tenDaysAgoTs);

    const res = canOpenPositionRiskCheck({ isLiveMode: true });
    assert.equal(res.allowed, false);
    assert.ok(res.reason.includes('CANARY_LIFETIME_LOSS_LIMIT'));

    resetCircuitBreaker('CANARY_LIFETIME_LOSS_LIMIT');
  });

  it('latches circuit breaker on rolling 7-day loss exceeding 0.075 SOL', () => {
    // 2 days ago loss of 0.08 SOL with execution_mode = 'live'
    const twoDaysAgoTs = Date.now() - 2 * 86400000;
    db.prepare(`
      INSERT INTO dry_run_positions (
        candidate_id, mint, status, opened_at_ms, closed_at_ms, size_sol, tp_percent, sl_percent,
        trailing_enabled, trailing_percent, pnl_sol, pnl_percent, execution_mode, snapshot_json
      ) VALUES (1, 'lossMint', 'closed', ?, ?, 0.05, 30, -15, 1, 10, -0.0800, -40.0, 'live', '{}')
    `).run(twoDaysAgoTs - 1000, twoDaysAgoTs);

    const res = canOpenPositionRiskCheck({ isLiveMode: true });
    assert.equal(res.allowed, false);
    assert.ok(res.reason.includes('ROLLING_7D_LOSS_LIMIT'));

    resetCircuitBreaker('ROLLING_7D_LOSS_LIMIT');
  });

  it('ensures dry_run closed losses never trip live real-money circuit breakers', () => {
    // Insert a massive loss position but with execution_mode = 'dry_run'
    const ts = Date.now();
    db.prepare(`
      INSERT INTO dry_run_positions (
        candidate_id, mint, status, opened_at_ms, closed_at_ms, size_sol, tp_percent, sl_percent,
        trailing_enabled, trailing_percent, pnl_sol, pnl_percent, execution_mode, snapshot_json
      ) VALUES (1, 'lossMint', 'closed', ?, ?, 0.05, 30, -15, 1, 10, -0.5000, -100.0, 'dry_run', '{}')
    `).run(ts - 1000, ts);

    // Live mode risk check should remain ALLOWED because dry-run trades are excluded from live capital loss limits!
    const liveCheck = canOpenPositionRiskCheck({ isLiveMode: true });
    assert.equal(liveCheck.allowed, true, 'Dry-run losses must never trip live real-money circuit breakers');
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

  it('blocks executeLiveBuy directly at router level when candidate quote is stale', async () => {
    const { executeLiveBuy } = await import('../src/execution/router.js');
    const staleCandidateRow = {
      id: 999,
      created_at_ms: Date.now() - 40_000, // 40 seconds ago (>30s limit)
      candidate: {
        token: { mint: 'staleMint111111111111111111111111111', symbol: 'STALE' },
        createdAtMs: Date.now() - 40_000,
        filters: { passed: true },
      },
    };

    await assert.rejects(
      async () => {
        await executeLiveBuy(staleCandidateRow, { verdict: 'BUY', confidence: 90 }, 1);
      },
      (err) => {
        assert.ok(err.message.includes('STALE_QUOTE'));
        return true;
      }
    );
  });

  it('allows dry-run entries without capital loss limits blocking paper trading', () => {
    // Latch a real-money breaker
    tripCircuitBreaker('DAILY_LOSS_LIMIT', 'Real money daily loss tripped');

    // Live mode should be blocked
    const liveCheck = canOpenPositionRiskCheck({ isLiveMode: true });
    assert.equal(liveCheck.allowed, false);
    assert.ok(liveCheck.reason.includes('DAILY_LOSS_LIMIT'));

    // Dry-run simulation mode should NOT be blocked by capital loss latches
    const dryRunCheck = canOpenPositionRiskCheck({ isLiveMode: false });
    assert.equal(dryRunCheck.allowed, true);

    resetCircuitBreaker('DAILY_LOSS_LIMIT');
  });
});
