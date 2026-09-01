import assert from 'node:assert';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDbPath, generateMatrixReport, collectCellMetrics } from '../scripts/matrix_reporter.js';
import { db, initDb } from '../src/db/connection.js';

initDb();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

test('resolveDbPath resolves relative path to root dir', () => {
  const cell = { id: 'test-cell', filename: 'test_cell.sqlite' };
  const resolved = resolveDbPath(cell);
  assert.strictEqual(resolved, path.resolve(ROOT_DIR, 'data', 'test_cell.sqlite'));
});

test('collectCellMetrics detects outlier profit concentration > 50% correctly', () => {
  db.prepare('DELETE FROM dry_run_positions').run();
  const ts = Date.now();
  // 1 large win (+0.08 SOL) and 1 small loss (-0.01 SOL) -> net PnL +0.07 SOL, maxWin 0.08 (114% of net)
  db.prepare(`
    INSERT INTO dry_run_positions (
      candidate_id, mint, status, opened_at_ms, closed_at_ms, size_sol, tp_percent, sl_percent,
      trailing_enabled, trailing_percent, pnl_sol, pnl_percent, snapshot_json
    ) VALUES (1, 'winMint', 'closed', ?, ?, 0.05, 30, -15, 1, 10, 0.0800, 160.0, '{}')
  `).run(ts - 2000, ts - 1000);

  db.prepare(`
    INSERT INTO dry_run_positions (
      candidate_id, mint, status, opened_at_ms, closed_at_ms, size_sol, tp_percent, sl_percent,
      trailing_enabled, trailing_percent, pnl_sol, pnl_percent, snapshot_json
    ) VALUES (1, 'lossMint', 'closed', ?, ?, 0.05, 30, -15, 1, 10, -0.0100, -20.0, '{}')
  `).run(ts - 1000, ts);

  const cell = { id: 'test-outlier', dbPath: process.env.DB_PATH, useLlm: false };
  const metrics = collectCellMetrics(cell);

  assert.equal(metrics.exists, true);
  assert.equal(metrics.closed, 2);
  assert.equal(metrics.realizedPnlSol, 0.07);
  assert.equal(metrics.maxWinSol, 0.08);
  assert.equal(metrics.isOutlierDominated, true, 'Profit of 0.07 with single win of 0.08 must be outlier dominated');
});

test('generateMatrixReport formats Realized NAV, open position note, and outlier warning accurately', () => {
  const metrics = [
    {
      id: 'sniper-rules',
      useLlm: false,
      exists: true,
      navSol: 1.05,
      realizedPnlSol: 0.05,
      open: 2,
      closed: 10,
      winRate: 60.0,
      wins: 6,
      candidates: 50,
      avgPnlPct: 1.2,
      isOutlierDominated: false,
    },
    {
      id: 'dip_buy-rules',
      useLlm: false,
      exists: true,
      navSol: 96.48,
      realizedPnlSol: 95.48,
      maxWinSol: 95.56,
      open: 1,
      closed: 70,
      winRate: 32.9,
      wins: 23,
      candidates: 100,
      avgPnlPct: 2000.0,
      isOutlierDominated: true,
    },
  ];
  const report = generateMatrixReport(metrics);
  assert.ok(report.includes('Realized NAV: 1.050 SOL (+0.0500 SOL) (Excludes 2 open)'));
  assert.ok(report.includes('Closed: 10 · Win Rate: 60.0% · Wins: 6'));
  assert.ok(report.includes('Outlier: 1 win = +95.56 SOL'));
});
