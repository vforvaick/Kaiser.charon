import assert from 'node:assert';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDbPath, generateMatrixReport } from '../scripts/matrix_reporter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

test('resolveDbPath resolves relative path to root dir', () => {
  const cell = { id: 'test-cell', filename: 'test_cell.sqlite' };
  const resolved = resolveDbPath(cell);
  assert.strictEqual(resolved, path.resolve(ROOT_DIR, 'data', 'test_cell.sqlite'));
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
