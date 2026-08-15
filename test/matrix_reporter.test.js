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

test('generateMatrixReport formats Realized NAV and open position note accurately', () => {
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
    },
  ];
  const report = generateMatrixReport(metrics);
  assert.ok(report.includes('Realized NAV: 1.050 SOL (+0.0500 SOL) (Excludes 2 open)'));
  assert.ok(report.includes('Closed: 10 · Win Rate: 60.0% · Wins: 6'));
});
