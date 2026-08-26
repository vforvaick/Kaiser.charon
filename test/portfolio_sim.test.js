import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PortfolioSimulator } from '../src/backtest/portfolioSimulator.js';

describe('Ticket 01: Portfolio Simulator & Capacity Contention', () => {
  it('processes non-overlapping trades and computes realized PnL', () => {
    const trades = [
      { id: 1, opened_at_ms: 1000, closed_at_ms: 2000, pnl_sol: 0.01, size_sol: 0.05 },
      { id: 2, opened_at_ms: 3000, closed_at_ms: 4000, pnl_sol: -0.005, size_sol: 0.05 },
    ];

    const sim = new PortfolioSimulator({ initialCapitalSol: 1.0, maxOpenPositions: 5, fixedFeeSolPerTrade: 0.0005 });
    const summary = sim.run(trades);

    assert.equal(summary.executedTradesCount, 2);
    assert.equal(summary.capacitySkippedCount, 0);
    assert.equal(summary.winRatePct, 50.0);
    assert.ok(summary.netRealizedPnlSol > 0.0035 && summary.netRealizedPnlSol < 0.0045);
  });

  it('enforces max_open_positions and flags overflow trades as capacity-skipped', () => {
    // 6 overlapping trades competing for 3 slots
    const trades = [
      { id: 1, opened_at_ms: 1000, closed_at_ms: 5000, pnl_sol: 0.01, size_sol: 0.05 },
      { id: 2, opened_at_ms: 1100, closed_at_ms: 5000, pnl_sol: 0.01, size_sol: 0.05 },
      { id: 3, opened_at_ms: 1200, closed_at_ms: 5000, pnl_sol: 0.01, size_sol: 0.05 },
      // Slots 1, 2, 3 are now full. Trade 4 and 5 arrive before any exit.
      { id: 4, opened_at_ms: 1300, closed_at_ms: 6000, pnl_sol: 0.05, size_sol: 0.05 },
      { id: 5, opened_at_ms: 1400, closed_at_ms: 6000, pnl_sol: 0.05, size_sol: 0.05 },
      // Trade 6 arrives after trades 1,2,3 close at 5000ms
      { id: 6, opened_at_ms: 5100, closed_at_ms: 7000, pnl_sol: 0.02, size_sol: 0.05 },
    ];

    const sim = new PortfolioSimulator({ initialCapitalSol: 1.0, maxOpenPositions: 3 });
    const summary = sim.run(trades);

    assert.equal(summary.executedTradesCount, 4, 'Trades 1, 2, 3, 6 should execute');
    assert.equal(summary.capacitySkippedCount, 2, 'Trades 4 and 5 should be capacity-skipped');
    assert.equal(summary.capacitySkipRatePct, (2 / 6) * 100);
  });

  it('applies deterministic tie-breaking: exits at exact same ms free slots before entries', () => {
    const trades = [
      { id: 1, opened_at_ms: 1000, closed_at_ms: 2000, pnl_sol: 0.01, size_sol: 0.05 },
      // Trade 2 opens at exact same millisecond (2000) that Trade 1 closes.
      // With maxOpenPositions: 1, Trade 1 exit MUST process before Trade 2 entry.
      { id: 2, opened_at_ms: 2000, closed_at_ms: 3000, pnl_sol: 0.01, size_sol: 0.05 },
    ];

    const sim = new PortfolioSimulator({ initialCapitalSol: 1.0, maxOpenPositions: 1 });
    const summary = sim.run(trades);

    assert.equal(summary.executedTradesCount, 2);
    assert.equal(summary.capacitySkippedCount, 0, 'Trade 2 should not be skipped because Trade 1 closed at t=2000');
  });

  it('computes Realized Maximum Drawdown and drawdown duration accurately', () => {
    const trades = [
      { id: 1, opened_at_ms: 1000, closed_at_ms: 2000, pnl_sol: 0.10, size_sol: 0.05 }, // equity -> 1.10 (t=2000)
      { id: 2, opened_at_ms: 2100, closed_at_ms: 3000, pnl_sol: -0.05, size_sol: 0.05 }, // equity -> 1.05 (t=3000, DD start)
      { id: 3, opened_at_ms: 3100, closed_at_ms: 4000, pnl_sol: -0.05, size_sol: 0.05 }, // equity -> 1.00 (t=4000, DD = 0.10)
      { id: 4, opened_at_ms: 4100, closed_at_ms: 7000, pnl_sol: 0.20, size_sol: 0.05 }, // equity -> 1.20 (t=7000, new peak, recovery)
    ];

    const sim = new PortfolioSimulator({ initialCapitalSol: 1.0, maxOpenPositions: 5, fixedFeeSolPerTrade: 0 });
    const summary = sim.run(trades);

    assert.ok(Math.abs(summary.maxDrawdownSol - 0.10) < 1e-6);
    assert.ok(Math.abs(summary.maxDrawdownPct - (0.10 / 1.10) * 100) < 0.01);
    assert.equal(summary.maxDrawdownDurationMs, 4000, 'Drawdown lasted from t=3000 to t=7000 (4000ms)');
  });
});
