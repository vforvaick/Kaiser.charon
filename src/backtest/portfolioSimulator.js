/**
 * Chronological Event-Driven Portfolio Simulator (Ticket 01)
 *
 * Models real wallet cash, active slot capacity (max_open_positions),
 * deterministic tie-breaking (exits processed before entries at same ms),
 * capacity-skipped trade tracking, and Realized-Event Peak-to-Trough Drawdown.
 */

export class PortfolioSimulator {
  constructor({
    initialCapitalSol = 1.0,
    maxOpenPositions = 5,
    positionSizeSol = 0.05,
    fixedFeeSolPerTrade = 0.0005, // gas/priority fee
  } = {}) {
    this.initialCapitalSol = initialCapitalSol;
    this.maxOpenPositions = maxOpenPositions;
    this.positionSizeSol = positionSizeSol;
    this.fixedFeeSolPerTrade = fixedFeeSolPerTrade;

    this.cashBalanceSol = initialCapitalSol;
    this.activePositions = new Map(); // id -> position
    this.executedTrades = [];
    this.capacitySkippedTrades = [];
    this.equityCurve = [{ timestamp: 0, equity: initialCapitalSol, cash: initialCapitalSol, activeCount: 0 }];

    this.maxDrawdownSol = 0;
    this.maxDrawdownPct = 0;
    this.peakEquity = initialCapitalSol;
  }

  /**
   * Run simulation on historical trade records.
   *
   * @param {Array} trades - Array of trade objects with { id, opened_at_ms, closed_at_ms, pnl_sol, size_sol, exit_reason }
   */
  run(trades = []) {
    // 1. Build discrete event list
    const events = [];
    for (const t of trades) {
      if (!t.opened_at_ms || !t.closed_at_ms) continue;
      const size = Number(t.size_sol) || this.positionSizeSol;
      const pnl = Number(t.pnl_sol) || 0;

      // Event priority: Exit = 1, Entry = 2 (so exits at exact same ms free slots first)
      events.push({
        type: 'ENTRY',
        timestamp: t.opened_at_ms,
        priority: 2,
        tradeId: t.id,
        size,
        trade: t,
      });

      events.push({
        type: 'EXIT',
        timestamp: t.closed_at_ms,
        priority: 1,
        tradeId: t.id,
        size,
        pnl,
        exitReason: t.exit_reason,
        trade: t,
      });
    }

    // Sort by timestamp ASC, then priority ASC (Exits before Entries), then tradeId ASC
    events.sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return String(a.tradeId).localeCompare(String(b.tradeId));
    });

    // 2. Process chronological event stream
    for (const ev of events) {
      if (ev.type === 'EXIT') {
        this._handleExit(ev);
      } else if (ev.type === 'ENTRY') {
        this._handleEntry(ev);
      }
    }

    return this.getSummary();
  }

  _handleExit(ev) {
    if (!this.activePositions.has(ev.tradeId)) {
      // Trade was never entered (e.g. skipped due to capacity)
      return;
    }

    this.activePositions.delete(ev.tradeId);
    const netPnl = ev.pnl - this.fixedFeeSolPerTrade;
    this.cashBalanceSol += (ev.size + netPnl);

    const currentEquity = this.cashBalanceSol + this._getLockedCapital();
    this._updateEquityTracking(ev.timestamp, currentEquity);

    this.executedTrades.push({
      ...ev.trade,
      netPnl,
      closedAtMs: ev.timestamp,
    });
  }

  _handleEntry(ev) {
    // Check slot limit
    if (this.activePositions.size >= this.maxOpenPositions) {
      this.capacitySkippedTrades.push({
        ...ev.trade,
        reason: 'MAX_SLOTS_FULL',
        activeCount: this.activePositions.size,
      });
      return;
    }

    // Check cash balance
    if (this.cashBalanceSol < ev.size + this.fixedFeeSolPerTrade) {
      this.capacitySkippedTrades.push({
        ...ev.trade,
        reason: 'INSUFFICIENT_CASH',
        cashBalance: this.cashBalanceSol,
      });
      return;
    }

    // Enter position
    this.cashBalanceSol -= (ev.size + this.fixedFeeSolPerTrade);
    this.activePositions.set(ev.tradeId, {
      tradeId: ev.tradeId,
      size: ev.size,
      openedAtMs: ev.timestamp,
    });

    const currentEquity = this.cashBalanceSol + this._getLockedCapital();
    this._updateEquityTracking(ev.timestamp, currentEquity);
  }

  _getLockedCapital() {
    let locked = 0;
    for (const pos of this.activePositions.values()) {
      locked += pos.size;
    }
    return locked;
  }

  _updateEquityTracking(timestamp, equity) {
    this.equityCurve.push({
      timestamp,
      equity,
      cash: this.cashBalanceSol,
      activeCount: this.activePositions.size,
    });

    if (equity > this.peakEquity) {
      this.peakEquity = equity;
    }

    const currentDdSol = this.peakEquity - equity;
    const currentDdPct = this.peakEquity > 0 ? (currentDdSol / this.peakEquity) * 100 : 0;

    if (currentDdSol > this.maxDrawdownSol) {
      this.maxDrawdownSol = currentDdSol;
    }
    if (currentDdPct > this.maxDrawdownPct) {
      this.maxDrawdownPct = currentDdPct;
    }
  }

  getSummary() {
    const totalExecuted = this.executedTrades.length;
    const totalSkipped = this.capacitySkippedTrades.length;
    const totalSignals = totalExecuted + totalSkipped;

    const netRealizedPnlSol = this.executedTrades.reduce((sum, t) => sum + t.netPnl, 0);
    const finalEquity = this.cashBalanceSol + this._getLockedCapital();
    const totalReturnPct = ((finalEquity - this.initialCapitalSol) / this.initialCapitalSol) * 100;

    const wins = this.executedTrades.filter(t => t.netPnl > 0);
    const losses = this.executedTrades.filter(t => t.netPnl <= 0);
    const winRate = totalExecuted > 0 ? (wins.length / totalExecuted) * 100 : 0;

    const grossProfit = wins.reduce((sum, t) => sum + t.netPnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.netPnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);

    return {
      fidelityTier: 'bounded-modeled',
      initialCapitalSol: this.initialCapitalSol,
      finalEquitySol: finalEquity,
      netRealizedPnlSol,
      totalReturnPct,
      totalSignals,
      executedTradesCount: totalExecuted,
      capacitySkippedCount: totalSkipped,
      capacitySkipRatePct: totalSignals > 0 ? (totalSkipped / totalSignals) * 100 : 0,
      winRatePct: winRate,
      profitFactor,
      maxDrawdownSol: this.maxDrawdownSol,
      maxDrawdownPct: this.maxDrawdownPct,
      equityCurve: this.equityCurve,
    };
  }
}
