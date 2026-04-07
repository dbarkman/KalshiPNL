'use client';

import React, { useMemo } from 'react';
import { MatchedTrade } from '@/utils/processData';
import { SettlementResult } from '@/utils/processData';

interface SettlementWhatIfProps {
  matchedTrades: MatchedTrade[];
  settlementMap: Map<string, SettlementResult>;
  loading: boolean;
  progress: { completed: number; total: number } | null;
}

export default function SettlementWhatIf({ matchedTrades, settlementMap, loading, progress }: SettlementWhatIfProps) {
  const analysis = useMemo(() => {
    // Only look at mid-market exits (not settled at 0 or 100)
    const earlyExits = matchedTrades.filter(t => t.Exit_Price > 0 && t.Exit_Price < 100);

    let totalActualPnl = 0;        // all 803 early exits
    let knownActualPnl = 0;        // only the ones with known settlement outcomes
    let whatIfPnl = 0;             // what-if for the same known subset
    let wouldHaveWon = 0;
    let wouldHaveLost = 0;
    let pending = 0;

    for (const t of earlyExits) {
      totalActualPnl += t.Net_Profit;

      const result = settlementMap.get(t.Ticker);
      if (result === 'no') {
        // NO won — we would have collected full 100¢ per contract
        knownActualPnl += t.Net_Profit;
        whatIfPnl += (100 - t.Entry_Price) * t.Contracts / 100;
        wouldHaveWon++;
      } else if (result === 'yes') {
        // YES won — we would have lost our entry cost
        knownActualPnl += t.Net_Profit;
        whatIfPnl += -t.Entry_Cost;
        wouldHaveLost++;
      } else {
        pending++;
      }
    }

    // Delta is the simple difference between the two numbers shown
    const delta = whatIfPnl - knownActualPnl;

    return {
      earlyExitCount: earlyExits.length,
      totalActualPnl,
      knownActualPnl,
      whatIfPnl,
      delta,
      wouldHaveWon,
      wouldHaveLost,
      pending,
      knownCount: wouldHaveWon + wouldHaveLost,
    };
  }, [matchedTrades, settlementMap]);

  if (matchedTrades.length === 0) return null;

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

  const deltaPositive = analysis.delta > 0;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Settlement What-If</h2>
        {loading && progress && (
          <span className="text-sm text-gray-500">
            Fetching settlements… {progress.completed}/{progress.total}
          </span>
        )}
        {loading && !progress && (
          <span className="text-sm text-gray-500">Fetching settlements…</span>
        )}
      </div>
      <div className="bg-white shadow rounded-lg p-6">
        <p className="text-sm text-gray-500 mb-5">
          Of the {analysis.earlyExitCount} trades exited early (sold before settlement), what would have happened if you held everything to settlement?
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Early Exits</div>
            <div className="text-2xl font-semibold text-gray-900">{analysis.earlyExitCount}</div>
            {analysis.pending > 0 && (
              <div className="text-xs text-gray-400 mt-1">{analysis.pending} pending</div>
            )}
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Actual P&amp;L</div>
            <div className={`text-2xl font-semibold ${(analysis.knownCount > 0 ? analysis.knownActualPnl : analysis.totalActualPnl) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {analysis.knownCount > 0 ? formatCurrency(analysis.knownActualPnl) : formatCurrency(analysis.totalActualPnl)}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {analysis.knownCount > 0 ? `known trades (${formatCurrency(analysis.totalActualPnl)} all)` : 'from early exits'}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">What-If P&amp;L</div>
            <div className={`text-2xl font-semibold ${analysis.whatIfPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {analysis.knownCount > 0 ? formatCurrency(analysis.whatIfPnl) : '—'}
            </div>
            <div className="text-xs text-gray-400 mt-1">if held to settlement</div>
          </div>
          <div className={`rounded-lg p-4 ${deltaPositive ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Net Delta</div>
            <div className={`text-2xl font-semibold ${deltaPositive ? 'text-green-700' : 'text-red-700'}`}>
              {analysis.knownCount > 0 ? (deltaPositive ? '+' : '') + formatCurrency(analysis.delta) : '—'}
            </div>
            <div className={`text-xs mt-1 ${deltaPositive ? 'text-green-600' : 'text-red-600'}`}>
              {analysis.knownCount > 0
                ? deltaPositive
                  ? 'holding would have been better'
                  : 'early exits saved you money'
                : 'no data yet'}
            </div>
          </div>
        </div>

        {analysis.knownCount > 0 && (
          <div className="flex items-center gap-6 text-sm border-t border-gray-100 pt-4">
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-red-400"></span>
              <span className="text-gray-600">
                <span className="font-semibold text-red-600">{analysis.wouldHaveWon}</span> would have settled in your favor (left money on table)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-green-400"></span>
              <span className="text-gray-600">
                <span className="font-semibold text-green-600">{analysis.wouldHaveLost}</span> would have settled against you (early exit saved you)
              </span>
            </div>
            {analysis.pending > 0 && (
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-gray-300"></span>
                <span className="text-gray-400">{analysis.pending} still open / unknown</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
