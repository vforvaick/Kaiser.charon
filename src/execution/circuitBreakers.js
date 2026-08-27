import { db } from '../db/connection.js';
import { now } from '../utils.js';

// Risk limits (SPEC-005 & Oracle recommendations)
export const RISK_LIMITS = {
  MAX_DAILY_LOSS_SOL: 0.025,
  MAX_CONSECUTIVE_LOSSES: 3,
  MAX_ROLLING_7D_LOSS_SOL: 0.075,
  MAX_LIFETIME_CANARY_LOSS_SOL: 0.15,
  MAX_EMERGENCY_PER_TRADE_LOSS_SOL: 0.005, // 20% on 0.025 SOL probe size
  MAX_SLIPPAGE_BPS: 500, // 5.0%
  MAX_QUOTE_AGE_MS: 30_000, // 30 seconds
};

function safeJsonParse(val, fallback) {
  try {
    return JSON.parse(val || '');
  } catch {
    return fallback;
  }
}

/**
 * Check if any circuit breaker is currently latched (Fail-Closed).
 */
export function getCircuitBreakerStatus(breakerType = null) {
  try {
    if (breakerType) {
      const row = db.prepare('SELECT * FROM risk_circuit_breakers WHERE breaker_type = ?').get(breakerType);
      if (!row) return { isLatched: false, breakerType, tripCount: 0 };
      return {
        isLatched: Boolean(row.is_latched),
        breakerType: row.breaker_type,
        latchedAtMs: row.latched_at_ms,
        tripReason: row.trip_reason,
        tripCount: row.trip_count,
        metadata: safeJsonParse(row.metadata_json, {}),
      };
    }

    const rows = db.prepare('SELECT * FROM risk_circuit_breakers').all();
    const latched = rows.filter(r => r.is_latched === 1);
    return {
      isAnyLatched: latched.length > 0,
      latchedBreakers: latched.map(r => ({
        breakerType: r.breaker_type,
        tripReason: r.trip_reason,
        latchedAtMs: r.latched_at_ms,
      })),
      allBreakers: rows,
    };
  } catch (err) {
    console.error(`[circuit-breaker] status lookup error (fail-closed): ${err.message}`);
    // Fail-Closed: deny on DB error
    return {
      isAnyLatched: true,
      latchedBreakers: [{ breakerType: 'RISK_CHECK_UNAVAILABLE', tripReason: err.message, latchedAtMs: now() }],
      allBreakers: [],
    };
  }
}

/**
 * Trip and latch a specific circuit breaker.
 */
export function tripCircuitBreaker(breakerType, reason, metadata = {}) {
  const ts = now();
  console.warn(`🛑 [CIRCUIT-BREAKER TRIPPED] Type: ${breakerType} | Reason: ${reason}`);
  try {
    const stmt = db.prepare(`
      INSERT INTO risk_circuit_breakers (
        breaker_type, is_latched, latched_at_ms, trip_reason, trip_count, metadata_json, updated_at_ms
      ) VALUES (?, 1, ?, ?, 1, ?, ?)
      ON CONFLICT(breaker_type) DO UPDATE SET
        is_latched = 1,
        latched_at_ms = excluded.latched_at_ms,
        trip_reason = excluded.trip_reason,
        trip_count = risk_circuit_breakers.trip_count + 1,
        metadata_json = excluded.metadata_json,
        updated_at_ms = excluded.updated_at_ms
    `);
    stmt.run(breakerType, ts, reason, JSON.stringify(metadata || {}), ts);
    return true;
  } catch (err) {
    console.error(`[circuit-breaker] trip error: ${err.message}`);
    return false;
  }
}

/**
 * Manually reset a latched circuit breaker.
 */
export function resetCircuitBreaker(breakerType) {
  const ts = now();
  try {
    const stmt = db.prepare(`
      UPDATE risk_circuit_breakers
      SET is_latched = 0,
          updated_at_ms = ?
      WHERE breaker_type = ?
    `);
    const res = stmt.run(ts, breakerType);
    console.log(`✅ [CIRCUIT-BREAKER RESET] Type: ${breakerType}`);
    return res.changes > 0;
  } catch (err) {
    console.error(`[circuit-breaker] reset error: ${err.message}`);
    return false;
  }
}

/**
 * Mandatory pre-entry risk check evaluating loss accumulation and operational metrics.
 * Strictly Fail-Closed: returns allowed: false on any DB failure or limit breach.
 */
export function canOpenPositionRiskCheck({
  _strategyId = 'default',
  quoteAgeMs = 0,
  slippageBps = 0,
  isApiBackoffActive = false,
} = {}) {
  try {
    // 1. Check persistent latches
    const status = getCircuitBreakerStatus();
    if (status.isAnyLatched) {
      const reasons = status.latchedBreakers.map(b => `${b.breakerType}: ${b.tripReason}`).join('; ');
      return { allowed: false, reason: `CIRCUIT_BREAKER_LATCHED (${reasons})` };
    }

    // 2. Operational checks
    if (isApiBackoffActive) {
      return { allowed: false, reason: 'API_GATEWAY_BACKOFF_ACTIVE' };
    }
    if (quoteAgeMs > RISK_LIMITS.MAX_QUOTE_AGE_MS) {
      return { allowed: false, reason: `STALE_QUOTE (${quoteAgeMs}ms > ${RISK_LIMITS.MAX_QUOTE_AGE_MS}ms)` };
    }
    if (slippageBps > RISK_LIMITS.MAX_SLIPPAGE_BPS) {
      return { allowed: false, reason: `EXCESSIVE_SLIPPAGE (${slippageBps}bps > ${RISK_LIMITS.MAX_SLIPPAGE_BPS}bps)` };
    }

    const currentTime = now();

    // 3. Daily realized loss check (since UTC midnight)
    const todayStartMs = new Date().setUTCHours(0, 0, 0, 0);
    const dailyTrades = db.prepare(`
      SELECT pnl_sol FROM dry_run_positions
      WHERE status = 'closed' AND closed_at_ms >= ?
    `).all(todayStartMs);

    const dailyLossSol = dailyTrades
      .map(t => Number(t.pnl_sol) || 0)
      .filter(p => p < 0)
      .reduce((sum, p) => sum + Math.abs(p), 0);

    if (dailyLossSol >= RISK_LIMITS.MAX_DAILY_LOSS_SOL) {
      tripCircuitBreaker('DAILY_LOSS_LIMIT', `Daily loss ${dailyLossSol.toFixed(4)} SOL >= ${RISK_LIMITS.MAX_DAILY_LOSS_SOL} SOL`, { dailyLossSol });
      return { allowed: false, reason: `DAILY_LOSS_LIMIT_REACHED (${dailyLossSol.toFixed(4)} SOL)` };
    }

    // 4. Consecutive losses check (last N closed trades)
    const recentTrades = db.prepare(`
      SELECT pnl_sol FROM dry_run_positions
      WHERE status = 'closed'
      ORDER BY closed_at_ms DESC LIMIT ?
    `).all(RISK_LIMITS.MAX_CONSECUTIVE_LOSSES);

    if (recentTrades.length >= RISK_LIMITS.MAX_CONSECUTIVE_LOSSES) {
      const allLoss = recentTrades.every(t => (Number(t.pnl_sol) || 0) <= 0);
      if (allLoss) {
        tripCircuitBreaker('CONSECUTIVE_LOSS_LIMIT', `${RISK_LIMITS.MAX_CONSECUTIVE_LOSSES} consecutive closed losses`, { recentTrades });
        return { allowed: false, reason: `CONSECUTIVE_LOSS_LIMIT_REACHED (${RISK_LIMITS.MAX_CONSECUTIVE_LOSSES} losses)` };
      }
    }

    // 5. Rolling 7-day loss check
    const sevenDaysAgoMs = currentTime - 7 * 86_400_000;
    const rolling7dTrades = db.prepare(`
      SELECT pnl_sol FROM dry_run_positions
      WHERE status = 'closed' AND closed_at_ms >= ?
    `).all(sevenDaysAgoMs);

    const rolling7dLossSol = rolling7dTrades
      .map(t => Number(t.pnl_sol) || 0)
      .filter(p => p < 0)
      .reduce((sum, p) => sum + Math.abs(p), 0);

    if (rolling7dLossSol >= RISK_LIMITS.MAX_ROLLING_7D_LOSS_SOL) {
      tripCircuitBreaker('ROLLING_7D_LOSS_LIMIT', `Rolling 7d loss ${rolling7dLossSol.toFixed(4)} SOL >= ${RISK_LIMITS.MAX_ROLLING_7D_LOSS_SOL} SOL`, { rolling7dLossSol });
      return { allowed: false, reason: `ROLLING_7D_LOSS_LIMIT_REACHED (${rolling7dLossSol.toFixed(4)} SOL)` };
    }

    // 6. Lifetime canary cumulative loss check
    const lifetimeLossRow = db.prepare(`
      SELECT SUM(pnl_sol) as total_pnl FROM dry_run_positions
      WHERE status = 'closed'
    `).get();

    const totalPnl = Number(lifetimeLossRow?.total_pnl) || 0;
    if (totalPnl <= -RISK_LIMITS.MAX_LIFETIME_CANARY_LOSS_SOL) {
      tripCircuitBreaker('CANARY_LIFETIME_LOSS_LIMIT', `Cumulative loss ${Math.abs(totalPnl).toFixed(4)} SOL >= ${RISK_LIMITS.MAX_LIFETIME_CANARY_LOSS_SOL} SOL`, { totalPnl });
      return { allowed: false, reason: `CANARY_LIFETIME_LOSS_LIMIT_REACHED (${Math.abs(totalPnl).toFixed(4)} SOL)` };
    }

    // 7. Emergency single-position loss cap check on last closed trade
    const lastTrade = recentTrades[0];
    if (lastTrade) {
      const lastPnl = Number(lastTrade.pnl_sol) || 0;
      if (lastPnl <= -RISK_LIMITS.MAX_EMERGENCY_PER_TRADE_LOSS_SOL) {
        tripCircuitBreaker('EMERGENCY_PER_TRADE_LOSS', `Single trade loss ${Math.abs(lastPnl).toFixed(4)} SOL >= ${RISK_LIMITS.MAX_EMERGENCY_PER_TRADE_LOSS_SOL} SOL`, { lastPnl });
        return { allowed: false, reason: `EMERGENCY_PER_TRADE_LOSS (${Math.abs(lastPnl).toFixed(4)} SOL)` };
      }
    }

    return { allowed: true };
  } catch (err) {
    console.error(`[circuit-breaker] query error (fail-closed): ${err.message}`);
    return { allowed: false, reason: `RISK_CHECK_UNAVAILABLE (${err.message})` };
  }
}
