import crypto from 'crypto';

/**
 * Quantitative Statistics Suite (Ticket 02)
 *
 * Implements Day-Clustered Block Bootstrap Resampling (1,000-10,000 runs),
 * Conditional Value at Risk (CVaR 95% / Expected Shortfall), and Dataset SHA-256 Fingerprinting.
 */

/**
 * Compute Day-Clustered Block Bootstrap Resampling for Net Expectancy (SOL/trade).
 *
 * @param {Array} trades - Array of trade objects with { netPnl, opened_at_ms }
 * @param {Object} options - { iterations = 1000, seed = 42, minDailyBlocks = 5 }
 */
export function computeClusteredBootstrap(trades = [], { iterations = 1000, seed = 42, minDailyBlocks = 5 } = {}) {
  if (!trades.length) {
    return { status: 'INCONCLUSIVE', reason: 'NO_TRADES' };
  }

  // Contract validation: iterations must be clamped or validated to 1,000-10,000
  const clampedIterations = Math.max(1000, Math.min(10000, Number(iterations) || 1000));

  // 1. Group trades by calendar day (UTC)
  const daysMap = new Map();
  for (const t of trades) {
    const day = new Date(t.opened_at_ms || t.closedAtMs || 0).toISOString().slice(0, 10);
    if (!daysMap.has(day)) daysMap.set(day, []);
    daysMap.get(day).push(t.netPnl != null ? t.netPnl : (t.pnl_sol || 0));
  }

  const dayKeys = Array.from(daysMap.keys());
  if (dayKeys.length < minDailyBlocks) {
    return {
      status: 'INCONCLUSIVE',
      reason: `INSUFFICIENT_DAILY_BLOCKS (found ${dayKeys.length}, required ${minDailyBlocks})`,
      dailyBlocksCount: dayKeys.length,
    };
  }

  // Pseudo-random generator with deterministic seed (LCG)
  let s = seed;
  const nextRandom = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  const sampleMeans = [];

  // 2. Resample day blocks with replacement
  for (let i = 0; i < clampedIterations; i++) {
    const resampledTrades = [];
    for (let d = 0; d < dayKeys.length; d++) {
      const pickedDay = dayKeys[Math.floor(nextRandom() * dayKeys.length)];
      const dayTrades = daysMap.get(pickedDay);
      for (const val of dayTrades) {
        resampledTrades.push(val);
      }
    }
    const mean = resampledTrades.length ? resampledTrades.reduce((a, b) => a + b, 0) / resampledTrades.length : 0;
    sampleMeans.push(mean);
  }

  sampleMeans.sort((a, b) => a - b);

  // 3. Lower Confidence Bound (5th percentile = 95% confidence lower bound)
  const lcbIndex = Math.floor(clampedIterations * 0.05);
  const medianIndex = Math.floor(clampedIterations * 0.50);
  const ucbIndex = Math.floor(clampedIterations * 0.95);

  const lcb95 = sampleMeans[lcbIndex];
  const median = sampleMeans[medianIndex];
  const ucb95 = sampleMeans[ucbIndex];

  return {
    status: 'COMPLETE',
    iterations: clampedIterations,
    dailyBlocksCount: dayKeys.length,
    sampleSizeTrades: trades.length,
    meanExpectancySol: median,
    lcb95Sol: lcb95,
    ucb95Sol: ucb95,
    isPositiveEdgeConfirmed: lcb95 > 0,
  };
}

/**
 * Compute Conditional Value at Risk (CVaR 95% / Expected Shortfall).
 * Measures the average return among the worst 5% trades.
 *
 * @param {Array} trades - Array of trade objects with { netPnl } or numbers
 * @param {Number} minTailSamples - Minimum sample count in tail to be conclusive (default 5)
 */
export function computeCvar95(trades = [], minTailSamples = 5) {
  if (!trades.length) return { status: 'INCONCLUSIVE', reason: 'NO_TRADES' };

  const pnlList = trades.map(t => (typeof t === 'number' ? t : (t.netPnl != null ? t.netPnl : (t.pnl_sol || 0))));
  pnlList.sort((a, b) => a - b);

  const tailCutoffCount = Math.max(1, Math.floor(pnlList.length * 0.05));
  const tailTrades = pnlList.slice(0, tailCutoffCount);

  if (tailTrades.length < minTailSamples) {
    return {
      status: 'INCONCLUSIVE',
      reason: `INSUFFICIENT_TAIL_SAMPLES (found ${tailTrades.length}, required ${minTailSamples})`,
      tailCount: tailTrades.length,
      sampleSize: pnlList.length,
    };
  }

  const cvar95Sol = tailTrades.reduce((sum, val) => sum + val, 0) / tailTrades.length;
  const worstSingleLossSol = tailTrades[0];

  return {
    status: 'COMPLETE',
    sampleSize: pnlList.length,
    tailCount: tailTrades.length,
    cvar95Sol,
    worstSingleLossSol,
  };
}

/**
 * Generate a SHA-256 fingerprint for a canonical dataset array of trade/signal rows.
 */
export function generateDatasetFingerprint(rows = []) {
  const canonicalString = JSON.stringify(rows, (key, value) => {
    // Sort object keys for deterministic hash
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value).sort().reduce((sorted, k) => {
        sorted[k] = value[k];
        return sorted;
      }, {});
    }
    return value;
  });

  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}
