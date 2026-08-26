/**
 * Counterfactual Signal & Rejection Outcome Analyzer (Ticket 03)
 *
 * Evaluates immutable signal_captures across forward price horizons (5m, 15m, 1h)
 * to compute confusion matrix (TP, FP, TN, FN) and quantify false-negative Alpha Leakage.
 */

export function analyzeCounterfactualOutcomes(captures = [], {
  runnerGainPct = 25.0,  // threshold to classify a token as a runner (+25%)
  rugLossPct = -40.0,    // threshold to classify a token as a rug (-40%)
  evaluationHorizon = 'forward_1h_price', // horizon to evaluate
} = {}) {
  if (!captures.length) {
    return { status: 'INCONCLUSIVE', reason: 'NO_CAPTURES' };
  }

  let completeCount = 0;
  let incompleteCount = 0;

  let tp = 0; // Filter passed & was Runner
  let fp = 0; // Filter passed & was Rug/Loss
  let tn = 0; // Filter rejected & was Rug/Loss
  let fn = 0; // Filter rejected & was Runner (Alpha Leakage)

  let totalMissedGainPct = 0;
  const failureReasonLeakage = new Map(); // reason -> missed runner count

  for (const cap of captures) {
    const entry = Number(cap.entry_price_usd || cap.entryPriceUsd);
    const forward = Number(cap[evaluationHorizon]);

    if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(forward) || forward <= 0) {
      incompleteCount++;
      continue;
    }

    completeCount++;
    const gainPct = ((forward - entry) / entry) * 100;
    const isRunner = gainPct >= runnerGainPct;
    const isRugOrLoss = gainPct <= rugLossPct || gainPct < 0;
    const passed = Boolean(cap.passed_prefilter ?? cap.passedPrefilter);

    if (passed && isRunner) {
      tp++;
    } else if (passed && !isRunner) {
      fp++;
    } else if (!passed && isRugOrLoss) {
      tn++;
    } else if (!passed && isRunner) {
      fn++;
      totalMissedGainPct += gainPct;
      const reasons = Array.isArray(cap.failure_reasons) ? cap.failure_reasons : [];
      for (const r of reasons) {
        failureReasonLeakage.set(r, (failureReasonLeakage.get(r) || 0) + 1);
      }
    }
  }

  const sensitivity = (tp + fn) > 0 ? (tp / (tp + fn)) * 100 : 0;
  const specificity = (tn + fp) > 0 ? (tn / (tn + fp)) * 100 : 0;
  const precision = (tp + fp) > 0 ? (tp / (tp + fp)) * 100 : 0;

  return {
    status: completeCount > 0 ? 'COMPLETE' : 'INCONCLUSIVE',
    totalCaptures: captures.length,
    evaluatedCompleteCount: completeCount,
    incompleteOrMissingCount: incompleteCount,
    confusionMatrix: {
      truePositives: tp,
      falsePositives: fp,
      trueNegatives: tn,
      falseNegatives: fn,
    },
    metrics: {
      sensitivityPct: sensitivity,
      specificityPct: specificity,
      precisionPct: precision,
      alphaLeakageRunnersCount: fn,
      totalMissedGainPct,
      topLeakingFilterReasons: Array.from(failureReasonLeakage.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reason, count]) => ({ reason, missedRunners: count })),
    },
  };
}
