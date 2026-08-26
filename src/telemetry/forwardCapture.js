import { db } from '../db/connection.js';
import { now } from '../utils.js';

/**
 * Record an immutable pre-guard signal observation in signal_captures table.
 */
export function recordSignalObservation({
  mint,
  signalId = null,
  strategyId = 'default',
  observedAtMs = now(),
  decisionAtMs = null,
  passedPrefilter = false,
  failureReasons = [],
  entryPriceUsd = null,
  entryMcapUsd = null,
  metadata = {},
}) {
  if (!mint) return null;
  const ts = now();
  const stmt = db.prepare(`
    INSERT INTO signal_captures (
      signal_id, mint, strategy_id, observed_at_ms, decision_at_ms,
      passed_prefilter, failure_reasons_json, entry_price_usd, entry_mcap_usd,
      capture_status, metadata_json, created_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    signalId,
    mint,
    strategyId,
    observedAtMs,
    decisionAtMs || observedAtMs,
    passedPrefilter ? 1 : 0,
    JSON.stringify(failureReasons || []),
    Number.isFinite(Number(entryPriceUsd)) ? Number(entryPriceUsd) : null,
    Number.isFinite(Number(entryMcapUsd)) ? Number(entryMcapUsd) : null,
    'pending',
    JSON.stringify(metadata || {}),
    ts
  );

  return info.lastInsertRowid;
}

/**
 * Update forward price marks at specific horizons (5m, 15m, 1h).
 */
export function updateForwardPriceMarks(id, {
  forward5mPrice = null,
  forward15mPrice = null,
  forward1hPrice = null,
  captureStatus = 'complete',
} = {}) {
  if (!id) return false;
  const stmt = db.prepare(`
    UPDATE signal_captures
    SET forward_5m_price = COALESCE(?, forward_5m_price),
        forward_15m_price = COALESCE(?, forward_15m_price),
        forward_1h_price = COALESCE(?, forward_1h_price),
        capture_status = ?
    WHERE id = ?
  `);
  const res = stmt.run(forward5mPrice, forward15mPrice, forward1hPrice, captureStatus, id);
  return res.changes > 0;
}

function safeJsonParse(val, fallback) {
  try {
    return JSON.parse(val || '');
  } catch {
    return fallback;
  }
}

/**
 * Fetch pending forward captures due for evaluation.
 */
export function getPendingForwardCaptures(limit = 100) {
  return db.prepare(`
    SELECT * FROM signal_captures
    WHERE capture_status = 'pending'
    ORDER BY observed_at_ms ASC
    LIMIT ?
  `).all(limit).map(row => ({
    ...row,
    passed_prefilter: Boolean(row.passed_prefilter),
    failure_reasons: safeJsonParse(row.failure_reasons_json, []),
    metadata: safeJsonParse(row.metadata_json, {}),
  }));
}

/**
 * Query signal captures for a given strategy and time window.
 */
export function getSignalCapturesByStrategy(strategyId, { sinceMs = 0, limit = 1000 } = {}) {
  return db.prepare(`
    SELECT * FROM signal_captures
    WHERE strategy_id = ? AND observed_at_ms >= ?
    ORDER BY observed_at_ms ASC
    LIMIT ?
  `).all(strategyId, sinceMs, limit).map(row => ({
    ...row,
    passed_prefilter: Boolean(row.passed_prefilter),
    failure_reasons: safeJsonParse(row.failure_reasons_json, []),
    metadata: safeJsonParse(row.metadata_json, {}),
  }));
}
