/**
 * 4-Stage Strategy Promotion Scorecard Engine (Ticket 04)
 *
 * Evaluates strategy readiness against formal promotion gates:
 * Stage 1 (Causal Replay) -> Stage 2 (Forward Shadow) -> Stage 3 (0.05 SOL Canary) -> Stage 4 (Scale-Up).
 */

export function evaluatePromotionScorecard({
  strategyId,
  trades = [],
  portfolioSummary = {},
  bootstrapStats = {},
  cvarStats = {},
} = {}) {
  const totalTrades = trades.length || portfolioSummary.executedTradesCount || 0;
  const netPnlSol = portfolioSummary.netRealizedPnlSol ?? trades.reduce((sum, t) => sum + (t.netPnl || t.pnl_sol || 0), 0);
  const profitFactor = portfolioSummary.profitFactor ?? 0;

  // 1. Check max single trade contribution (< 50% of total profit)
  let maxSingleProfitContributionPct = 0;
  if (netPnlSol > 0) {
    const maxWin = Math.max(0, ...trades.map(t => (t.netPnl || t.pnl_sol || 0)));
    maxSingleProfitContributionPct = (maxWin / netPnlSol) * 100;
  }

  // 2. Daily positive consistency
  const daysMap = new Map();
  for (const t of trades) {
    const d = new Date(t.opened_at_ms || t.closedAtMs || 0).toISOString().slice(0, 10);
    daysMap.set(d, (daysMap.get(d) || 0) + (t.netPnl || t.pnl_sol || 0));
  }
  const totalDays = daysMap.size;
  const positiveDays = Array.from(daysMap.values()).filter(p => p > 0).length;
  const dailyConsistencyPct = totalDays > 0 ? (positiveDays / totalDays) * 100 : 0;

  // 3. Multi-window chronological stability (First Half vs Second Half PnL)
  let firstHalfPnl = 0;
  let secondHalfPnl = 0;
  if (trades.length >= 2) {
    const sortedTrades = [...trades].sort((a, b) => (a.opened_at_ms || a.closedAtMs || 0) - (b.opened_at_ms || b.closedAtMs || 0));
    const mid = Math.floor(sortedTrades.length / 2);
    firstHalfPnl = sortedTrades.slice(0, mid).reduce((sum, t) => sum + (t.netPnl || t.pnl_sol || 0), 0);
    secondHalfPnl = sortedTrades.slice(mid).reduce((sum, t) => sum + (t.netPnl || t.pnl_sol || 0), 0);
  }
  const passesTwoWindows = firstHalfPnl > 0 && secondHalfPnl > 0;

  // 4. Stage 1 Evaluation Checks
  const checks = [
    {
      name: 'Sample Size Floor',
      passed: totalTrades >= 50,
      value: `${totalTrades} trades`,
      threshold: '>= 50 trades',
      critical: true,
    },
    {
      name: 'Profit Factor',
      passed: profitFactor >= 1.20,
      value: profitFactor.toFixed(2),
      threshold: '>= 1.20',
      critical: true,
    },
    {
      name: 'Net Realized PnL',
      passed: netPnlSol > 0,
      value: `${netPnlSol > 0 ? '+' : ''}${netPnlSol.toFixed(4)} SOL`,
      threshold: '> 0 SOL',
      critical: true,
    },
    {
      name: '95% Bootstrap Lower Bound (LCB)',
      passed: bootstrapStats.status === 'COMPLETE' && bootstrapStats.lcb95Sol > 0,
      value: bootstrapStats.status === 'COMPLETE' ? `${bootstrapStats.lcb95Sol > 0 ? '+' : ''}${bootstrapStats.lcb95Sol.toFixed(5)} SOL/trade` : (bootstrapStats.reason || 'N/A'),
      threshold: 'LCB > 0 (Positive edge confirmed)',
      critical: true,
    },
    {
      name: 'Two Non-Overlapping Windows Stability',
      passed: passesTwoWindows,
      value: `H1: ${firstHalfPnl > 0 ? '+' : ''}${firstHalfPnl.toFixed(4)} SOL | H2: ${secondHalfPnl > 0 ? '+' : ''}${secondHalfPnl.toFixed(4)} SOL`,
      threshold: 'Both H1 & H2 > 0 SOL',
      critical: true,
    },
    {
      name: 'Single Trade Profit Concentration',
      passed: netPnlSol <= 0 || maxSingleProfitContributionPct <= 50.0,
      value: `${maxSingleProfitContributionPct.toFixed(1)}%`,
      threshold: '<= 50% of total profit',
      critical: true,
    },
    {
      name: 'Daily Win Consistency',
      passed: dailyConsistencyPct >= 70.0,
      value: `${dailyConsistencyPct.toFixed(1)}% (${positiveDays}/${totalDays} days)`,
      threshold: '>= 70%',
      critical: true,
    },
  ];

  const criticalFails = checks.filter(c => c.critical && !c.passed);
  const totalPassed = checks.filter(c => c.passed).length;

  let stage1Verdict = 'STAGE_1_FAIL';
  if (totalTrades < 50) {
    stage1Verdict = 'INSUFFICIENT_SAMPLE';
  } else if (criticalFails.length === 0 && totalPassed === checks.length) {
    stage1Verdict = 'STAGE_1_PASS';
  }

  return {
    strategyId,
    stage1Verdict,
    summary: {
      totalTrades,
      netPnlSol,
      profitFactor,
      dailyConsistencyPct,
      maxSingleProfitContributionPct,
      lcb95Sol: bootstrapStats.lcb95Sol ?? null,
      cvar95Sol: cvarStats.cvar95Sol ?? null,
    },
    checks,
  };
}
