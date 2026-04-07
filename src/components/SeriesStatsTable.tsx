'use client';

import React, { useMemo, useState } from 'react';
import { MatchedTrade, calculateSeriesStatsFromMatched, parseTickerComponents, SettlementResult } from '@/utils/processData';

interface SeriesStatsTableProps {
  matchedTrades: MatchedTrade[];
  recentMatchedTrades: MatchedTrade[];
  allMatchedTrades: MatchedTrade[];
  frequencyMap?: Map<string, string>;
  categoryMap?: Map<string, string>;
  settlementMap?: Map<string, SettlementResult>;
  selectedSeries: string | null;
  onSeriesSelect: (series: string | null) => void;
  seriesFilter?: string;
  onSeriesFilterChange?: (value: string) => void;
}

type SortField = 'series' | 'pnl' | 'proceeds' | 'cost' | 'fees' | 'trades' | 'winRate' | 'avgReturn' | 'trailing30d';
type SortDirection = 'asc' | 'desc';

export default function SeriesStatsTable({ matchedTrades, recentMatchedTrades, allMatchedTrades, frequencyMap, categoryMap, settlementMap, selectedSeries, onSeriesSelect, seriesFilter, onSeriesFilterChange }: SeriesStatsTableProps) {
  const [sortField, setSortField] = useState<SortField>('pnl');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [sqlModal, setSqlModal] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const trailing30dMap = useMemo(() => {
    const statsMap = calculateSeriesStatsFromMatched(recentMatchedTrades);
    const result = new Map<string, number>();
    statsMap.forEach((stats, series) => {
      if (stats.totalCost > 0) result.set(series, stats.pnl / stats.totalCost);
    });
    return result;
  }, [recentMatchedTrades]);

  const seriesData = useMemo(() => {
    const statsMap = calculateSeriesStatsFromMatched(matchedTrades);

    return Array.from(statsMap.values()).map(stats => ({
      series: stats.series,
      pnl: stats.pnl,
      proceeds: stats.totalCost + stats.pnl + stats.totalFees,
      totalCost: stats.totalCost,
      fees: stats.totalFees,
      tradesCount: stats.tradesCount,
      avgReturn: stats.totalCost > 0 ? stats.pnl / stats.totalCost : 0,
      winRate: stats.tradesCount > 0 ? stats.winCount / stats.tradesCount : 0,
      trailing30dAvgReturn: trailing30dMap.has(stats.series) ? trailing30dMap.get(stats.series)! : null,
    }));
  }, [matchedTrades, trailing30dMap]);

  const sortedData = useMemo(() => {
    return [...seriesData].sort((a, b) => {
      if (a.trailing30dAvgReturn === null && b.trailing30dAvgReturn === null && sortField === 'trailing30d') return 0;
      if (sortField === 'trailing30d') {
        if (a.trailing30dAvgReturn === null) return 1;
        if (b.trailing30dAvgReturn === null) return -1;
        return sortDirection === 'asc'
          ? a.trailing30dAvgReturn - b.trailing30dAvgReturn
          : b.trailing30dAvgReturn - a.trailing30dAvgReturn;
      }

      let aVal: number | string;
      let bVal: number | string;

      switch (sortField) {
        case 'series': aVal = a.series; bVal = b.series; break;
        case 'pnl': aVal = a.pnl; bVal = b.pnl; break;
        case 'proceeds': aVal = a.proceeds; bVal = b.proceeds; break;
        case 'cost': aVal = a.totalCost; bVal = b.totalCost; break;
        case 'fees': aVal = a.fees; bVal = b.fees; break;
        case 'trades': aVal = a.tradesCount; bVal = b.tradesCount; break;
        case 'avgReturn': aVal = a.avgReturn; bVal = b.avgReturn; break;
        case 'winRate': aVal = a.winRate; bVal = b.winRate; break;
        default: aVal = a.pnl; bVal = b.pnl;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      return sortDirection === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [seriesData, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="ml-1 text-gray-300">↕</span>;
    return <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  const generateSQL = () => {
    const today = new Date();
    const MS_PER_DAY = 1000 * 60 * 60 * 24;

    // All computations below use allMatchedTrades only — fully independent of view filters

    // Most recent and earliest Exit_Date per series
    const lastTradeDateMap = new Map<string, Date>();
    const firstTradeDateMap = new Map<string, Date>();
    allMatchedTrades.forEach(t => {
      const { series } = parseTickerComponents(t.Ticker);
      const last = lastTradeDateMap.get(series);
      if (!last || t.Exit_Date > last) lastTradeDateMap.set(series, t.Exit_Date);
      const first = firstTradeDateMap.get(series);
      if (!first || t.Exit_Date < first) firstTradeDateMap.set(series, t.Exit_Date);
    });

    // Unfiltered 30d return map (recomputed here to ignore any active view filters)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recent30dStats = calculateSeriesStatsFromMatched(
      allMatchedTrades.filter(t => t.Exit_Date >= thirtyDaysAgo)
    );
    const sql30dMap = new Map<string, number>();
    recent30dStats.forEach((stats, series) => {
      if (stats.totalCost > 0) sql30dMap.set(series, stats.pnl / stats.totalCost);
    });

    // All-time stats for tradesCount and pnl
    const allSeriesStats = calculateSeriesStatsFromMatched(allMatchedTrades);

    const toDelete: string[] = [];
    const full: string[] = [];       // NULL
    const monitoring: string[] = []; // 100¢
    const aggressive: string[] = []; // 1¢
    const stinkers: string[] = [];   // enabled = 0

    const MANUAL_ONLY = new Set(['one_off', 'annual', 'custom']);

    const CUSTOM_ANNUAL_CATEGORIES = new Set(['Elections', 'Politics', 'Entertainment', 'Companies', 'Science and Technology', 'Financials']);
    const CUSTOM_MONTHLY_CATEGORIES = new Set(['Economics', 'Climate and Weather', 'Mentions']);

    const getEffectiveFreq = (rawFreq: string | undefined, series: string): string | undefined => {
      if (rawFreq !== 'custom') return rawFreq;
      const category = categoryMap?.get(series);
      if (!category) return 'custom';
      if (category === 'Sports') return 'daily';
      if (CUSTOM_ANNUAL_CATEGORIES.has(category)) return 'annual';
      if (CUSTOM_MONTHLY_CATEGORIES.has(category)) return 'monthly';
      return 'custom'; // unrecognized category → manual only
    };

    allSeriesStats.forEach((stats, series) => {
      const lastDate = lastTradeDateMap.get(series);
      const firstDate = firstTradeDateMap.get(series);
      const daysSinceLast = lastDate ? (today.getTime() - lastDate.getTime()) / MS_PER_DAY : Infinity;
      const daysSinceFirst = firstDate ? (today.getTime() - firstDate.getTime()) / MS_PER_DAY : 0;

      const freq = getEffectiveFreq(frequencyMap?.get(series), series);

      // DELETE check — frequency-aware window
      const deleteWindow = (() => {
        if (!freq || MANUAL_ONLY.has(freq)) return Infinity;
        if (freq === 'monthly') return 90;
        if (freq === 'weekly') return 60;
        if (freq === 'daily' || freq === 'hourly') return 30;
        return Infinity;
      })();
      if (daysSinceLast > deleteWindow) {
        toDelete.push(series);
        return;
      }

      // one_off / annual / custom / unknown / fifteen_min — no tiers, no stinkers, manual only
      if (!freq || MANUAL_ONLY.has(freq) || freq === 'fifteen_min') return;

      const r30 = sql30dMap.get(series) ?? null;

      if (freq === 'monthly') {
        // Stinker: 180+ days, 6+ trades, all-time negative
        if (daysSinceFirst >= 180 && stats.tradesCount >= 6 && stats.pnl < 0) {
          stinkers.push(series);
        }
        if (daysSinceFirst < 7) return; // too new — skip, preserve manually-set position
        if (r30 !== null && r30 >= 0 && stats.tradesCount >= 2) {
          full.push(series);
        } else if (r30 !== null && r30 < 0 && stats.tradesCount >= 2) {
          aggressive.push(series);
        } else {
          // <2 trades or no 30d data — conservative hold at 100¢
          monitoring.push(series);
        }
      } else {
        // weekly / daily / hourly
        // Stinker: 90+ days, 30+ trades, all-time negative
        if (daysSinceFirst >= 90 && stats.tradesCount >= 30 && stats.pnl < 0) {
          stinkers.push(series);
        }
        if (daysSinceFirst < 7) {
          aggressive.push(series);
        } else if (r30 !== null && r30 >= 0 && stats.tradesCount >= 20) {
          full.push(series);
        } else if (r30 !== null && r30 >= 0) {
          monitoring.push(series);
        } else if (r30 !== null && r30 < 0) {
          aggressive.push(series);
        } else {
          // no 30d data — conservative
          monitoring.push(series);
        }
      }
    });

    // Series not found in DB are silently skipped by WHERE IN — no special handling needed
    const toIn = (arr: string[]) => arr.map(s => `'${s}'`).join(',\n  ');
    const parts: string[] = [];

    if (toDelete.length) {
      parts.push(
        `-- Inactive series removed from DB (30d daily/hourly, 60d weekly, 90d monthly; one_off/annual/custom/unknown never deleted) — ${toDelete.length} series\n` +
        `DELETE FROM one_cent_series_filters\nWHERE series_ticker IN (\n  ${toIn(toDelete)}\n);`
      );
    }
    if (full.length) {
      parts.push(
        `-- NULL: positive 30d + 7+ days + 20+ trades (weekly/daily/hourly) or 2+ trades (monthly) — ${full.length} series\n` +
        `UPDATE one_cent_series_filters\nSET position_size_cents = NULL\nWHERE series_ticker IN (\n  ${toIn(full)}\n);`
      );
    }
    if (monitoring.length) {
      parts.push(
        `-- 100¢: positive 30d + 7+ days + <20 trades (weekly/daily/hourly) or <2 trades/no data (monthly) — ${monitoring.length} series\n` +
        `UPDATE one_cent_series_filters\nSET position_size_cents = 100\nWHERE series_ticker IN (\n  ${toIn(monitoring)}\n);`
      );
    }
    if (aggressive.length) {
      parts.push(
        `-- 1¢: negative 30d (2+ trades for monthly) or <7 calendar days (weekly/daily/hourly) — ${aggressive.length} series\n` +
        `UPDATE one_cent_series_filters\nSET position_size_cents = 1\nWHERE series_ticker IN (\n  ${toIn(aggressive)}\n);`
      );
    }
    if (stinkers.length) {
      parts.push(
        `-- Disable stinkers: 90d+/30t+ (weekly/daily/hourly) or 180d+/6t+ (monthly), all-time negative — ${stinkers.length} series\n` +
        `-- Weather markets excluded by category check\n` +
        `UPDATE one_cent_series_filters\nSET enabled = 0\nWHERE series_ticker IN (\n  ${toIn(stinkers)}\n)\nAND category != 'Climate and Weather';`
      );
    }

    // Sell strategy: per-series analysis based on settlement outcomes
    if (settlementMap && settlementMap.size > 0) {
      const seriesEarlyExits = new Map<string, MatchedTrade[]>();
      allMatchedTrades
        .filter(t => t.Exit_Price > 0 && t.Exit_Price < 100)
        .forEach(t => {
          const { series } = parseTickerComponents(t.Ticker);
          if (!seriesEarlyExits.has(series)) seriesEarlyExits.set(series, []);
          seriesEarlyExits.get(series)!.push(t);
        });

      const settlementStrategy: string[] = [];
      const limitStrategy: string[] = [];

      seriesEarlyExits.forEach((trades, series) => {
        let knownActualPnl = 0;
        let whatIfPnl = 0;
        let knownCount = 0;
        for (const t of trades) {
          const result = settlementMap.get(t.Ticker);
          if (result === 'no') {
            knownActualPnl += t.Net_Profit;
            whatIfPnl += (100 - t.Entry_Price) * t.Contracts / 100;
            knownCount++;
          } else if (result === 'yes') {
            knownActualPnl += t.Net_Profit;
            whatIfPnl += -t.Entry_Cost;
            knownCount++;
          }
        }
        if (knownCount === 0) return;
        if (whatIfPnl > knownActualPnl) {
          settlementStrategy.push(series);
        } else {
          limitStrategy.push(series);
        }
      });

      if (settlementStrategy.length) {
        parts.push(
          `-- Sell strategy: settlement (holding to settlement was better) — ${settlementStrategy.length} series\n` +
          `UPDATE one_cent_series_filters\nSET sell_strategy = 'settlement'\nWHERE series_ticker IN (\n  ${toIn(settlementStrategy)}\n);`
        );
      }
      if (limitStrategy.length) {
        parts.push(
          `-- Sell strategy: limit (early exit was better) — ${limitStrategy.length} series\n` +
          `UPDATE one_cent_series_filters\nSET sell_strategy = 'limit'\nWHERE series_ticker IN (\n  ${toIn(limitStrategy)}\n);`
        );
      }
    }

    const dateHeader = `-- Generated ${today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
    setSqlModal([dateHeader, ...parts].join('\n\n'));
  };

  const handleCopy = () => {
    if (!sqlModal) return;
    navigator.clipboard.writeText(sqlModal);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (seriesData.length === 0 && !onSeriesFilterChange) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-xl font-semibold shrink-0">Series Performance</h2>
        <div className="flex items-center gap-3">
          {seriesData.length > 0 && (() => {
            const missingFrequency = !frequencyMap || frequencyMap.size === 0;
            const missingSettlement = !settlementMap || settlementMap.size === 0;
            const disabled = missingFrequency || missingSettlement;
            const tooltip = disabled
              ? [missingFrequency && 'frequency data', missingSettlement && 'settlement data'].filter(Boolean).join(' and ') + ' not yet loaded'
              : '';
            return (
              <button
                onClick={generateSQL}
                disabled={disabled}
                title={tooltip}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${disabled ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-gray-800 text-white hover:bg-gray-700'}`}
              >
                Generate SQL
              </button>
            );
          })()}
          {onSeriesFilterChange && (
            <div className="relative">
              <input
                type="text"
                value={seriesFilter || ''}
                onChange={(e) => onSeriesFilterChange(e.target.value)}
                placeholder="Filter series name..."
                className="w-48 px-3 py-1.5 text-sm border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
              />
              {seriesFilter && (
                <button
                  onClick={() => onSeriesFilterChange('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}
          {selectedSeries && (
            <button
              onClick={() => onSeriesSelect(null)}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-sm font-medium hover:bg-blue-100 transition-colors"
            >
              <span>Filtering: {selectedSeries}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('series')}>
                  Series <SortIcon field="series" />
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('proceeds')}>
                  Proceeds <SortIcon field="proceeds" />
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('cost')}>
                  Cost <SortIcon field="cost" />
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('fees')}>
                  Fees <SortIcon field="fees" />
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('pnl')}>
                  Net Profit <SortIcon field="pnl" />
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('trades')}>
                  Trades <SortIcon field="trades" />
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('winRate')}>
                  Win Rate <SortIcon field="winRate" />
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('avgReturn')}>
                  Avg Return <SortIcon field="avgReturn" />
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('trailing30d')} title="Avg return over the last 30 days">
                  30d Return <SortIcon field="trailing30d" />
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedData.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-sm text-gray-400">
                    No series match the current filter
                  </td>
                </tr>
              )}
              {sortedData.map((row) => (
                <tr
                  key={row.series}
                  onClick={() => selectedSeries === row.series ? onSeriesSelect(null) : onSeriesSelect(row.series)}
                  className={`cursor-pointer transition-colors ${selectedSeries === row.series ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'}`}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.series}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatCurrency(row.proceeds)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatCurrency(row.totalCost)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatCurrency(row.fees)}</td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${row.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(row.pnl)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.tradesCount}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatPercent(row.winRate)}</td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm ${row.avgReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatPercent(row.avgReturn)}
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                    row.trailing30dAvgReturn === null
                      ? 'text-gray-300'
                      : row.trailing30dAvgReturn >= 0
                        ? 'text-green-600'
                        : 'text-red-600'
                  }`}>
                    {row.trailing30dAvgReturn === null ? '—' : formatPercent(row.trailing30dAvgReturn)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 bg-gray-50 text-xs text-gray-500">
          Click a row to filter all data to that series. Click again to clear filter.
        </div>
      </div>

      {sqlModal !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-semibold">Position Size SQL</h3>
              <button onClick={() => setSqlModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <div className="px-6 py-2 text-xs text-gray-500 border-b bg-gray-50">
              <span className="font-medium text-gray-700">DELETE</span> — inactive 30d (daily/hourly), 60d (weekly), 90d (monthly); one_off/annual/custom/unknown never deleted &nbsp;·&nbsp;
              <span className="font-medium text-gray-700">one_off/annual/custom</span> — manual only, no tiers &nbsp;·&nbsp;
              <span className="font-medium text-gray-700">NULL</span> — positive 30d, 7+ days, 20+ trades (w/d/h) or 2+ trades (mo) &nbsp;·&nbsp;
              <span className="font-medium text-gray-700">100¢</span> — positive 30d, 7+ days, &lt;20 trades (w/d/h) or &lt;2 trades (mo) &nbsp;·&nbsp;
              <span className="font-medium text-gray-700">1¢</span> — negative 30d or &lt;7 days &nbsp;·&nbsp;
              <span className="font-medium text-gray-700">disabled</span> — 90d/30t (w/d/h) or 180d/6t (mo), all-time negative (non-weather)
            </div>
            <textarea
              readOnly
              value={sqlModal}
              className="flex-1 p-4 font-mono text-xs text-gray-800 resize-none focus:outline-none overflow-auto min-h-0"
            />
            <div className="flex justify-end gap-3 px-6 py-4 border-t">
              <button
                onClick={handleCopy}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${copied ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
              >
                {copied ? 'Copied!' : 'Copy to clipboard'}
              </button>
              <button
                onClick={() => setSqlModal(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
