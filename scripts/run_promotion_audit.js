#!/usr/bin/env node
/**
 * Standalone Strategy Promotion Scorecard & Portfolio Audit CLI
 *
 * Usage:
 *   node scripts/run_promotion_audit.js [--db ./data/degen_rules.sqlite]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { PortfolioSimulator } from '../src/backtest/portfolioSimulator.js';
import { computeClusteredBootstrap, computeCvar95, generateDatasetFingerprint } from '../src/backtest/statisticalRigor.js';
import { evaluatePromotionScorecard } from '../src/backtest/promotionScorecard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

export function runPromotionAudit(dbPath) {
    const testDbPath = dbPath || process.env.DB_PATH || './charon.sqlite';
    const resolvedPath = path.isAbsolute(testDbPath) ? testDbPath : path.resolve(ROOT_DIR, testDbPath);
  if (!fs.existsSync(resolvedPath)) {
    return { status: 'ERROR', error: `Database not found: ${resolvedPath}` };
  }

  let dbHandle;
  try {
    dbHandle = new Database(resolvedPath, { readonly: true });
    const trades = dbHandle.prepare(`
      SELECT id, opened_at_ms, closed_at_ms, size_sol, pnl_sol, pnl_percent, exit_reason, entry_mcap
      FROM dry_run_positions
      WHERE status = 'closed'
      ORDER BY closed_at_ms ASC
    `).all();

    if (!trades.length) {
      return { status: 'ERROR', error: `No closed trades found in ${path.basename(resolvedPath)}` };
    }

    const stratRow = dbHandle.prepare('SELECT id, config_json FROM strategies WHERE enabled = 1 LIMIT 1').get()
      || dbHandle.prepare('SELECT id, config_json FROM strategies LIMIT 1').get();
    let stratConfig = {};
    try { stratConfig = JSON.parse(stratRow?.config_json || '{}'); } catch {}

    const maxSlots = Number(stratConfig.max_open_positions) || 5;
    const posSize = Number(stratConfig.position_size_sol) || 0.05;

    // 1. Portfolio Simulation
    const sim = new PortfolioSimulator({
      initialCapitalSol: 1.0,
      maxOpenPositions: maxSlots,
      positionSizeSol: posSize,
      fixedFeeSolPerTrade: 0.0005,
    });
    const portfolioSummary = sim.run(trades);

    // 2. Clustered Bootstrap
    const bootstrapStats = computeClusteredBootstrap(trades, { iterations: 1000, minDailyBlocks: 5 });

    // 3. CVaR 95%
    const cvarStats = computeCvar95(trades, 5);

    // 4. Dataset Fingerprint
    const fingerprint = generateDatasetFingerprint(trades);

    // 5. Scorecard
    const scorecard = evaluatePromotionScorecard({
      strategyId: stratRow?.id || path.basename(resolvedPath, '.sqlite'),
      trades,
      portfolioSummary,
      bootstrapStats,
      cvarStats,
    });

    return {
      status: 'COMPLETE',
      dbPath: resolvedPath,
      filename: path.basename(resolvedPath),
      fingerprint,
      portfolioSummary,
      bootstrapStats,
      cvarStats,
      scorecard,
    };
  } catch (err) {
    return { status: 'ERROR', error: err.message };
  } finally {
    if (dbHandle) {
      try { dbHandle.close(); } catch {}
    }
  }
}

export function formatPromotionReport(result) {
  if (result.status === 'ERROR') {
    return `❌ [ERROR] ${result.error}`;
  }

  const { filename, fingerprint, portfolioSummary, bootstrapStats, cvarStats, scorecard } = result;

  const lines = [
    '='.repeat(80),
    `🏆 STRATEGY PROMOTION SCORECARD AUDIT: ${filename}`,
    '='.repeat(80),
    `  Dataset SHA-256 Fingerprint : ${fingerprint}`,
    `  Strategy ID                 : ${scorecard.strategyId}`,
    `  Fidelity Classification     : ${portfolioSummary.fidelityTier}`,
    '',
    '📊 Portfolio & Realized Economics:',
    `  • Executed Trades           : ${portfolioSummary.executedTradesCount} / ${portfolioSummary.totalSignals} signals`,
    `  • Capacity-Skipped Trades   : ${portfolioSummary.capacitySkippedCount} (${portfolioSummary.capacitySkipRatePct.toFixed(1)}%)`,
    `  • Net Realized PnL          : ${portfolioSummary.netRealizedPnlSol > 0 ? '+' : ''}${portfolioSummary.netRealizedPnlSol.toFixed(4)} SOL`,
    `  • Realized Profit Factor    : ${portfolioSummary.profitFactor.toFixed(2)}`,
    `  • Win Rate                  : ${portfolioSummary.winRatePct.toFixed(1)}%`,
    `  • Realized Max Drawdown     : ${portfolioSummary.maxDrawdownSol.toFixed(4)} SOL (${portfolioSummary.maxDrawdownPct.toFixed(1)}%)`,
    `  • Max Drawdown Duration     : ${(portfolioSummary.maxDrawdownDurationMs / 3600000).toFixed(1)} hours`,
    '',
    '📈 Statistical Rigor & Tail Risk:',
    `  • 95% Clustered Bootstrap LCB: ${bootstrapStats.status === 'COMPLETE' ? `${bootstrapStats.lcb95Sol > 0 ? '+' : ''}${bootstrapStats.lcb95Sol.toFixed(5)} SOL/trade` : (bootstrapStats.reason || 'N/A')}`,
    `  • CVaR 95% (Tail Risk)      : ${cvarStats.status === 'COMPLETE' ? `${cvarStats.cvar95Sol.toFixed(5)} SOL (Worst: ${cvarStats.worstSingleLossSol.toFixed(5)} SOL)` : (cvarStats.reason || 'N/A')}`,
    '',
    '📋 Stage 1 Promotion Checks:',
  ];

  scorecard.checks.forEach(c => {
    const icon = c.passed ? '✅' : '❌';
    lines.push(`  ${icon} [${c.passed ? 'PASS' : 'FAIL'}] ${c.name.padEnd(38)} : ${c.value} (Req: ${c.threshold})`);
  });

  lines.push(
    '',
    `🏁 Final Stage 1 Promotion Verdict: ${scorecard.stage1Verdict === 'STAGE_1_PASS' ? '🟢 STAGE_1_PASS (Eligible for Stage 2 Shadow)' : '🔴 STAGE_1_FAIL / INCUBATION'}`,
    '='.repeat(80)
  );

  return lines.join('\n');
}

// CLI execution
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  let dbArg = './data/degen_rules.sqlite';
  let compareAll = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db' && args[i + 1]) {
      dbArg = args[i + 1];
    } else if (args[i] === '--all' || args[i] === '--compare-all') {
      compareAll = true;
    }
  }

  if (compareAll) {
    const dataDir = path.resolve(ROOT_DIR, 'data');
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.sqlite'));
      files.sort().forEach(f => {
        const fullPath = path.join(dataDir, f);
        const res = runPromotionAudit(fullPath);
        console.log(formatPromotionReport(res));
        console.log('\n');
      });
    }
  } else {
    const res = runPromotionAudit(dbArg);
    console.log(formatPromotionReport(res));
  }
}
