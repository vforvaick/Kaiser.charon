import { db } from '../db/connection.js';
import { now } from '../utils.js';

// Bounded in-memory telemetry queue to prevent synchronous SQLite locks on ingestion path
const telemetryQueue = [];
const decisionQueue = [];
let isFlushing = false;

function safeJsonParse(val, fallback) {
  try {
    return JSON.parse(val || '');
  } catch {
    return fallback;
  }
}

/**
 * Enqueue signal observation asynchronously (non-blocking collector seam).
 */
export function recordSignalObservation(payload) {
  if (!payload?.mint) return null;
  const item = { ...payload, enqueuedAtMs: now() };
  if (telemetryQueue.length < 5000) {
    telemetryQueue.push(item);
  } else {
    console.warn(`[telemetry] queue full (${telemetryQueue.length}), dropping capture for ${payload.mint}`);
  }
  setImmediate(flushTelemetryQueue);
  return true;
}

/**
 * Enqueue decision outcome asynchronously.
 */
export function updateSignalDecision(signalIdOrMint, {
  passedPrefilter = false,
  failureReasons = [],
  entryPriceUsd = null,
  entryMcapUsd = null,
  decisionAtMs = now(),
} = {}) {
  if (!signalIdOrMint) return false;
  if (decisionQueue.length < 5000) {
    decisionQueue.push({
      signalIdOrMint,
      passedPrefilter,
      failureReasons,
      entryPriceUsd,
      entryMcapUsd,
      decisionAtMs,
    });
  }
  setImmediate(flushTelemetryQueue);
  return true;
}

export function flushTelemetryQueue() {
  if (isFlushing || (!telemetryQueue.length && !decisionQueue.length)) return;
  isFlushing = true;
  try {
    const insertItems = telemetryQueue.splice(0, 100);
    const updateItems = decisionQueue.splice(0, 100);

    const insertStmt = db.prepare(`
      INSERT INTO signal_captures (
        signal_id, mint, strategy_id, observed_at_ms, decision_at_ms,
        passed_prefilter, failure_reasons_json, entry_price_usd, entry_mcap_usd,
        capture_status, metadata_json, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateStmt = db.prepare(`
      UPDATE signal_captures
      SET passed_prefilter = ?,
          failure_reasons_json = ?,
          entry_price_usd = COALESCE(?, entry_price_usd),
          entry_mcap_usd = COALESCE(?, entry_mcap_usd),
          decision_at_ms = ?
      WHERE id = (
        SELECT id FROM signal_captures
        WHERE (signal_id = ? OR mint = ?)
        ORDER BY id DESC LIMIT 1
      )
    `);

    const runBatch = db.transaction(() => {
      for (const r of insertItems) {
        insertStmt.run(
          r.signalId || null,
          r.mint,
          r.strategyId || 'default',
          r.observedAtMs || now(),
          r.decisionAtMs || r.observedAtMs || now(),
          r.passedPrefilter ? 1 : 0,
          JSON.stringify(r.failureReasons || []),
          Number.isFinite(Number(r.entryPriceUsd)) ? Number(r.entryPriceUsd) : null,
          Number.isFinite(Number(r.entryMcapUsd)) ? Number(r.entryMcapUsd) : null,
          'pending',
          JSON.stringify(r.metadata || {}),
          now()
        );
      }

      for (const u of updateItems) {
        updateStmt.run(
          u.passedPrefilter ? 1 : 0,
          JSON.stringify(u.failureReasons || []),
          Number.isFinite(Number(u.entryPriceUsd)) ? Number(u.entryPriceUsd) : null,
          Number.isFinite(Number(u.entryMcapUsd)) ? Number(u.entryMcapUsd) : null,
          u.decisionAtMs,
          u.signalIdOrMint,
          u.signalIdOrMint
        );
      }
    });

    runBatch();
  } catch (err) {
    console.error(`[telemetry] flush error: ${err.message}`);
  } finally {
    isFlushing = false;
    if (telemetryQueue.length > 0 || decisionQueue.length > 0) {
      setImmediate(flushTelemetryQueue);
    }
  }
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

/**
 * Rate-limited forward price mark resolver for due horizons (5m, 15m, 1h).
 */
export async function resolvePendingForwardMarks(priceFetcher, { maxBatch = 20 } = {}) {
  if (typeof priceFetcher !== 'function') return { resolved: 0, pending: 0 };
  const currentTime = now();

  // Find pending captures where at least 5 minutes have elapsed since observed_at_ms
  const pendingRows = db.prepare(`
    SELECT * FROM signal_captures
    WHERE capture_status = 'pending' AND observed_at_ms <= ?
    ORDER BY observed_at_ms ASC LIMIT ?
  `).all(currentTime - 300_000, maxBatch);

  let resolvedCount = 0;

  for (const row of pendingRows) {
    try {
      const price = await priceFetcher(row.mint);
      if (price != null && Number.isFinite(Number(price))) {
        const elapsed = currentTime - row.observed_at_ms;
        const updates = {};
        if (elapsed >= 300_000 && !row.forward_5m_price) updates.forward5mPrice = Number(price);
        if (elapsed >= 900_000 && !row.forward_15m_price) updates.forward15mPrice = Number(price);
        if (elapsed >= 3_600_000) {
          updates.forward1hPrice = Number(price);
          updates.captureStatus = 'complete';
        }
        updateForwardPriceMarks(row.id, updates);
        resolvedCount++;
      }
    } catch {
      // Individual token fetch failure, retry on next cycle
    }
  }

  return { resolved: resolvedCount, pending: pendingRows.length };
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
