#!/usr/bin/env node
/**
 * Standalone Counterfactual Signal & Alpha Leakage Analyzer CLI
 *
 * Usage:
 *   node scripts/run_counterfactual_analysis.js [--db ./data/sniper_rules.sqlite] [--horizon 1h] [--runner 25]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { analyzeCounterfactualOutcomes } from '../src/backtest/counterfactualAnalyzer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

export function runCounterfactualAudit(dbPath, {
  runnerGainPct = 25.0,
  rugLossPct = -40.0,
  evaluationHorizon = 'forward_1h_price',
} = {}) {
  const targetPath = dbPath || process.env.DB_PATH || './charon.sqlite';
  const resolvedPath = path.isAbsolute(targetPath) ? targetPath : path.resolve(ROOT_DIR, targetPath);
  if (!fs.existsSync(resolvedPath)) {
    return { status: 'ERROR', error: `Database not found: ${resolvedPath}` };
  }

  let dbHandle;
  try {
    dbHandle = new Database(resolvedPath, { readonly: true });
    const tableExists = dbHandle.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='signal_captures'").get();
    if (!tableExists) {
      return { status: 'ERROR', error: `Table signal_captures not found in ${path.basename(resolvedPath)}` };
    }

    const rows = dbHandle.prepare('SELECT * FROM signal_captures ORDER BY observed_at_ms ASC').all();
    const captures = rows.map(r => {
      let failureReasons = [];
      try { failureReasons = JSON.parse(r.failure_reasons_json || '[]'); } catch {}
      return {
        ...r,
        passed_prefilter: Boolean(r.passed_prefilter),
        failure_reasons: failureReasons,
      };
    });

    const analysis = analyzeCounterfactualOutcomes(captures, {
      runnerGainPct,
      rugLossPct,
      evaluationHorizon,
    });

    return {
      status: 'COMPLETE',
      dbPath: resolvedPath,
      filename: path.basename(resolvedPath),
      analysis,
    };
  } catch (err) {
    return { status: 'ERROR', error: err.message };
  } finally {
    if (dbHandle) {
      try { dbHandle.close(); } catch {}
    }
  }
}

export function formatCounterfactualReport(result) {
  if (result.status === 'ERROR') {
    return `❌ [ERROR] ${result.error}`;
  }

  const { filename, analysis } = result;
  if (!analysis || analysis.status === 'INCONCLUSIVE') {
    return [
      '='.repeat(80),
      `🔬 COUNTERFACTUAL SIGNAL & ALPHA LEAKAGE REPORT: ${filename}`,
      '='.repeat(80),
      `  Status: INCONCLUSIVE (${analysis?.reason || 'NO_CAPTURES_DUE_FOR_EVALUATION'})`,
      `  Total Captures: ${analysis?.totalCaptures || 0}`,
      '='.repeat(80),
    ].join('\n');
  }

  const { totalCaptures, evaluatedCompleteCount, incompleteOrMissingCount, confusionMatrix, metrics } = analysis;

  const lines = [
    '='.repeat(80),
    `🔬 COUNTERFACTUAL SIGNAL & ALPHA LEAKAGE REPORT: ${filename}`,
    '='.repeat(80),
    `  Total Signal Captures : ${totalCaptures}`,
    `  Evaluated (Complete)  : ${evaluatedCompleteCount} (${((evaluatedCompleteCount / (totalCaptures || 1)) * 100).toFixed(1)}%)`,
    `  Incomplete/Pending    : ${incompleteOrMissingCount}`,
    '',
    '📊 Filter Confusion Matrix:',
    `  • True Positives  (Filter Passed & Was Runner)  : ${confusionMatrix.truePositives}`,
    `  • False Positives (Filter Passed & Non-Runner)  : ${confusionMatrix.falsePositives}`,
    `  • True Negatives  (Filter Blocked & Non-Runner) : ${confusionMatrix.trueNegatives}`,
    `  • False Negatives (Filter Blocked & Was Runner)  : ${confusionMatrix.falseNegatives}  <-- ALPHA LEAKAGE`,
    '',
    '📈 Diagnostic Ratios:',
    `  • Sensitivity (Recall of Runners) : ${metrics.sensitivityPct.toFixed(1)}%`,
    `  • Specificity (Rejection of Non-Runners) : ${metrics.specificityPct.toFixed(1)}%`,
    `  • Precision (Hit Rate on Entries) : ${metrics.precisionPct.toFixed(1)}%`,
    `  • Total Missed Runner Gains       : +${metrics.totalMissedGainPct.toFixed(1)}%`,
  ];

  if (metrics.topLeakingFilterReasons && metrics.topLeakingFilterReasons.length > 0) {
    lines.push('', '🚨 Top Filter Rules Causing False-Negative Alpha Leakage:');
    metrics.topLeakingFilterReasons.forEach((item, idx) => {
      lines.push(`  ${idx + 1}. [${item.missedRunners} missed runners] -> ${item.reason}`);
    });
  }

  lines.push('='.repeat(80));
  return lines.join('\n');
}

// CLI execution
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  let dbArg = './data/sniper_rules.sqlite';
  let runnerArg = 25.0;
  let horizonArg = 'forward_1h_price';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db' && args[i + 1]) {
      dbArg = args[i + 1];
    } else if (args[i] === '--runner' && args[i + 1]) {
      runnerArg = Number(args[i + 1]) || 25.0;
    } else if (args[i] === '--horizon' && args[i + 1]) {
      horizonArg = args[i + 1].includes('price') ? args[i + 1] : `forward_${args[i + 1]}_price`;
    }
  }

  const res = runCounterfactualAudit(dbArg, { runnerGainPct: runnerArg, evaluationHorizon: horizonArg });
  console.log(formatCounterfactualReport(res));
}
