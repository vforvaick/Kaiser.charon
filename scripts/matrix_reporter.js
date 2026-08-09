import fs from 'fs';
import sqlite3 from 'better-sqlite3';

// Ensure standalone reporter executions never trigger Telegram polling listeners (prevents 409 Conflict)
process.env.DISABLE_TELEGRAM_POLLING = 'true';

import { bot } from '../src/telegram/bot.js';
import { TELEGRAM_CHAT_ID } from '../src/config.js';

const MATRIX_CELLS = [
  { id: 'sniper-llm', strategy: 'sniper', useLlm: true, dbPath: './data/sniper_llm.sqlite' },
  { id: 'sniper-rules', strategy: 'sniper', useLlm: false, dbPath: './data/sniper_rules.sqlite' },
  { id: 'dip_buy-llm', strategy: 'dip_buy', useLlm: true, dbPath: './data/dip_buy_llm.sqlite' },
  { id: 'dip_buy-rules', strategy: 'dip_buy', useLlm: false, dbPath: './data/dip_buy_rules.sqlite' },
  { id: 'smart_money-llm', strategy: 'smart_money', useLlm: true, dbPath: './data/smart_money_llm.sqlite' },
  { id: 'smart_money-rules', strategy: 'smart_money', useLlm: false, dbPath: './data/smart_money_rules.sqlite' },
  { id: 'degen-llm', strategy: 'degen', useLlm: true, dbPath: './data/degen_llm.sqlite' },
  { id: 'degen-rules', strategy: 'degen', useLlm: false, dbPath: './data/degen_rules.sqlite' },
];

export function collectCellMetrics(cell) {
  if (!fs.existsSync(cell.dbPath)) {
    return { ...cell, exists: false, candidates: 0, open: 0, closed: 0, wins: 0, winRate: 0, realizedPnlSol: 0, avgPnlPct: 0, navSol: 1.0 };
  }
  try {
    const db = sqlite3(cell.dbPath, { readonly: true });
    const candidates = db.prepare('SELECT COUNT(*) AS count FROM candidates').get()?.count || 0;
    const open = db.prepare("SELECT COUNT(*) AS count FROM dry_run_positions WHERE status = 'open'").get()?.count || 0;
    const closed = db.prepare("SELECT COUNT(*) AS count FROM dry_run_positions WHERE status = 'closed'").get()?.count || 0;
    const wins = db.prepare("SELECT COUNT(*) AS count FROM dry_run_positions WHERE status = 'closed' AND pnl_sol > 0").get()?.count || 0;
    const stats = db.prepare("SELECT SUM(pnl_sol) AS total_sol, AVG(pnl_percent) AS avg_pct FROM dry_run_positions WHERE status = 'closed'").get();
    const realizedPnlSol = Number(stats?.total_sol || 0);
    const avgPnlPct = Number(stats?.avg_pct || 0);
    const winRate = closed > 0 ? (wins / closed) * 100 : 0;
    const navSol = 1.0 + realizedPnlSol;
    db.close();

    return {
      ...cell,
      exists: true,
      candidates,
      open,
      closed,
      wins,
      winRate,
      realizedPnlSol,
      avgPnlPct,
      navSol,
    };
  } catch (err) {
    return { ...cell, exists: false, error: err.message, candidates: 0, open: 0, closed: 0, wins: 0, winRate: 0, realizedPnlSol: 0, avgPnlPct: 0, navSol: 1.0 };
  }
}

export function generateMatrixReport(metricsList) {
  const lines = ['📊 <b>8-Cell Benchmark Matrix Report</b>', ''];
  metricsList.forEach(m => {
    if (!m.exists) {
      lines.push(`• <b>${m.id}</b>: DB missing / not started`);
      return;
    }
    const sign = m.realizedPnlSol >= 0 ? '+' : '';
    lines.push([
      `• <b>${m.id}</b> (${m.useLlm ? 'LLM' : 'Rules'})`,
      `  NAV: ${m.navSol.toFixed(3)} SOL (${sign}${m.realizedPnlSol.toFixed(4)} SOL)`,
      `  Closed: ${m.closed} · Win Rate: ${m.winRate.toFixed(1)}% · Wins: ${m.wins}`,
      `  Candidates: ${m.candidates} · Open: ${m.open} · Avg Trade: ${m.avgPnlPct.toFixed(1)}%`,
    ].join('\n'));
  });
  return lines.join('\n\n');
}

export async function runMatrixReporter(chatId = TELEGRAM_CHAT_ID) {
  const metrics = MATRIX_CELLS.map(collectCellMetrics);
  const text = generateMatrixReport(metrics);
  console.log(text);
  if (chatId && bot) {
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML' }).catch(err => console.error('[reporter] telegram send failed:', err.message));
  }
}

if (process.argv[1] && process.argv[1].endsWith('matrix_reporter.js')) {
  runMatrixReporter().then(() => process.exit(0)).catch((err) => {
    console.error('[reporter] fatal:', err);
    process.exit(1);
  });
}
