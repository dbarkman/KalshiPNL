'use client';

import React, { useMemo, useState } from 'react';
import { MatchedTrade, calculateSeriesStatsFromMatched, parseTickerComponents, SettlementResult } from '@/utils/processData';
import { backtestTiers, summarizeTierDistribution, TIER_LADDER, SeriesBacktest } from '@/utils/tierBacktest';

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
  const [backtestModal, setBacktestModal] = useState<Map<string, SeriesBacktest> | null>(null);
  const [backtestSelectedSeries, setBacktestSelectedSeries] = useState<string | null>(null);

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

    // Run backtest for per-event (weekly/daily/hourly/fifteen_min) series
    const backtest = backtestTiers(allMatchedTrades, frequencyMap ?? new Map(), categoryMap ?? new Map());

    const fmtPct = (v: number) => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
    const fmtTier = (t: number) => `${t}¢`;
    const r30Str = (r: number | null) => r !== null ? `r30 ${fmtPct(r)}` : 'no r30';

    const toDelete: string[] = [];
    const stinkers: string[] = [];

    // Per-event tier buckets (ladder). Each entry: {series, comment}
    type BucketEntry = { series: string; comment: string };
    const tierBuckets = new Map<number, BucketEntry[]>();
    TIER_LADDER.forEach(t => tierBuckets.set(t, []));

    // Monthly buckets — retire NULL, top tier is now 200¢
    const monthlyTop: BucketEntry[] = [];        // 200¢
    const monthlyMonitoring: BucketEntry[] = []; // 100¢
    const monthlyAggressive: BucketEntry[] = []; // 1¢

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
        // Mentions: always 100¢
        if (categoryMap?.get(series) === 'Mentions') {
          monthlyMonitoring.push({ series, comment: 'mention pinned' });
        } else if (r30 !== null && r30 >= 0 && stats.tradesCount >= 2) {
          monthlyTop.push({ series, comment: `monthly +${r30Str(r30)}` });
        } else if (r30 !== null && r30 < 0 && stats.tradesCount >= 2) {
          monthlyAggressive.push({ series, comment: `monthly ${r30Str(r30)}` });
        } else {
          monthlyMonitoring.push({ series, comment: `<2 trades or no 30d data — hold` });
        }
      } else {
        // weekly / daily / hourly / fifteen_min — use backtest
        if (daysSinceFirst >= 90 && stats.tradesCount >= 30 && stats.pnl < 0) {
          stinkers.push(series);
        }

        const bt = backtest.get(series);
        if (!bt) {
          // No backtest result (shouldn't happen given freq check) — fall back to 1¢ starter
          tierBuckets.get(1)!.push({ series, comment: 'no backtest data — default 1¢' });
          return;
        }

        const last = bt.history[bt.history.length - 1];
        let comment: string;

        if (bt.daysTracked <= 3) {
          // Still in starter window
          comment = `starter day ${bt.daysTracked}`;
        } else if (last.moved === 'up') {
          comment = `↑ promoted from ${fmtTier(last.prevTier)} (${r30Str(last.r30)})`;
        } else if (last.moved === 'down') {
          comment = `↓ demoted from ${fmtTier(last.prevTier)} (${r30Str(last.r30)})`;
        } else if (!last.active) {
          comment = `dormant (${r30Str(last.r30)})`;
        } else {
          comment = `hold (${r30Str(last.r30)})`;
        }

        tierBuckets.get(bt.currentTier)!.push({ series, comment });
      }
    });

    // SQL helpers
    const emitInBlock = (entries: BucketEntry[]): string => {
      const sorted = [...entries].sort((a, b) => a.series.localeCompare(b.series));
      return sorted.map((e, i) => {
        const isLast = i === sorted.length - 1;
        return `  '${e.series}'${isLast ? '' : ','} -- ${e.comment}`;
      }).join('\n');
    };
    const toIn = (arr: string[]) => arr.map(s => `'${s}'`).join(',\n  ');
    const parts: string[] = [];

    if (toDelete.length) {
      parts.push(
        `-- Inactive series removed from DB (30d daily/hourly, 60d weekly, 90d monthly; one_off/annual/custom/unknown never deleted) — ${toDelete.length} series\n` +
        `DELETE FROM one_cent_series_filters\nWHERE series_ticker IN (\n  ${toIn(toDelete)}\n);`
      );
    }

    // Per-event ladder tiers, ascending 1¢ → 200¢
    TIER_LADDER.forEach(tier => {
      const bucket = tierBuckets.get(tier)!;
      if (!bucket.length) return;
      parts.push(
        `-- ${fmtTier(tier)} tier (per-event ladder) — ${bucket.length} series\n` +
        `UPDATE one_cent_series_filters SET position_size_cents = ${tier} WHERE series_ticker IN (\n${emitInBlock(bucket)}\n);`
      );
    });

    // Monthly tiers
    if (monthlyTop.length) {
      parts.push(
        `-- 200¢ (monthly top) — positive 30d, 7+ days, 2+ trades — ${monthlyTop.length} series\n` +
        `UPDATE one_cent_series_filters SET position_size_cents = 200 WHERE series_ticker IN (\n${emitInBlock(monthlyTop)}\n);`
      );
    }
    if (monthlyMonitoring.length) {
      parts.push(
        `-- 100¢ (monthly monitoring / mentions / no data) — ${monthlyMonitoring.length} series\n` +
        `UPDATE one_cent_series_filters SET position_size_cents = 100 WHERE series_ticker IN (\n${emitInBlock(monthlyMonitoring)}\n);`
      );
    }
    if (monthlyAggressive.length) {
      parts.push(
        `-- 1¢ (monthly aggressive) — negative 30d, 2+ trades — ${monthlyAggressive.length} series\n` +
        `UPDATE one_cent_series_filters SET position_size_cents = 1 WHERE series_ticker IN (\n${emitInBlock(monthlyAggressive)}\n);`
      );
    }

    if (stinkers.length) {
      parts.push(
        `-- Disable stinkers: 90d+/30t+ (per-event) or 180d+/6t+ (monthly), all-time negative — ${stinkers.length} series\n` +
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

  const runBacktest = () => {
    if (!frequencyMap || !categoryMap) return;
    const result = backtestTiers(allMatchedTrades, frequencyMap, categoryMap);
    setBacktestModal(result);
    setBacktestSelectedSeries(null);
  };

  if (seriesData.length === 0 && !onSeriesFilterChange) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-xl font-semibold shrink-0">Series Performance</h2>
        <div className="flex items-center gap-3">
          {seriesData.length > 0 && (() => {
            const missingFrequency = !frequencyMap || frequencyMap.size === 0;
            const missingCategory = !categoryMap || categoryMap.size === 0;
            const missingSettlement = !settlementMap || settlementMap.size === 0;
            const sqlDisabled = missingFrequency || missingSettlement;
            const backtestDisabled = missingFrequency || missingCategory;
            const sqlTooltip = sqlDisabled
              ? [missingFrequency && 'frequency data', missingSettlement && 'settlement data'].filter(Boolean).join(' and ') + ' not yet loaded'
              : '';
            const backtestTooltip = backtestDisabled
              ? [missingFrequency && 'frequency data', missingCategory && 'category data'].filter(Boolean).join(' and ') + ' not yet loaded'
              : 'Simulate ladder tier path for each series from first trade to today';
            return (
              <>
                <button
                  onClick={runBacktest}
                  disabled={backtestDisabled}
                  title={backtestTooltip}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${backtestDisabled ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
                >
                  Run Backtest
                </button>
                <button
                  onClick={generateSQL}
                  disabled={sqlDisabled}
                  title={sqlTooltip}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${sqlDisabled ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-gray-800 text-white hover:bg-gray-700'}`}
                >
                  Generate SQL
                </button>
              </>
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

      {backtestModal !== null && (() => {
        const distribution = summarizeTierDistribution(backtestModal);
        const selected = backtestSelectedSeries ? backtestModal.get(backtestSelectedSeries) : null;
        const allSorted = Array.from(backtestModal.values()).sort((a, b) => {
          if (a.currentTier !== b.currentTier) return a.currentTier - b.currentTier;
          return a.series.localeCompare(b.series);
        });
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[85vh]">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h3 className="text-lg font-semibold">Ladder Backtest — {backtestModal.size} series</h3>
                <button onClick={() => { setBacktestModal(null); setBacktestSelectedSeries(null); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
              </div>
              <div className="px-6 py-3 border-b bg-gray-50 text-xs text-gray-600">
                Ladder: {TIER_LADDER.map(t => t === 1 ? '1¢' : `${t}¢`).join(' → ')}. 3 consecutive days r30 ≥ 0 → +1. Any r30 &lt; 0 → -1. Days 1–3 pinned at 1¢.
              </div>
              <div className="flex-1 overflow-auto">
                <div className="grid grid-cols-10 gap-px bg-gray-200 border-b">
                  {distribution.map(d => (
                    <div key={d.tier} className="bg-white px-2 py-2 text-center">
                      <div className="text-xs text-gray-500">{d.tier === 1 ? '1¢' : `${d.tier}¢`}</div>
                      <div className={`text-lg font-semibold ${d.count === 0 ? 'text-gray-300' : 'text-gray-900'}`}>{d.count}</div>
                    </div>
                  ))}
                </div>
                {selected ? (
                  <div className="p-6">
                    <button onClick={() => setBacktestSelectedSeries(null)} className="text-sm text-blue-600 hover:underline mb-3">← Back to all series</button>
                    <div className="mb-3">
                      <h4 className="text-lg font-semibold">{selected.series}</h4>
                      <div className="text-xs text-gray-500">
                        Frequency: <span className="font-medium">{selected.frequency}</span> · First trade: {selected.firstTradeDate} · {selected.totalTrades} trades · {selected.daysTracked} days tracked · Current tier: <span className="font-semibold">{selected.currentTier === 1 ? '1¢' : `${selected.currentTier}¢`}</span>
                      </div>
                    </div>
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Date</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Tier</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">r30</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Streak</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Move</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {selected.history.map((h, i) => (
                          <tr key={i} className={h.moved ? 'bg-yellow-50' : ''}>
                            <td className="px-3 py-1 font-mono text-gray-700">{h.date}</td>
                            <td className="px-3 py-1 font-semibold">{h.tier === 1 ? '1¢' : `${h.tier}¢`}</td>
                            <td className={`px-3 py-1 ${h.r30 === null ? 'text-gray-300' : h.r30 >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {h.r30 === null ? '—' : formatPercent(h.r30)}
                            </td>
                            <td className="px-3 py-1 text-gray-500">{h.consecutivePositive}</td>
                            <td className={`px-3 py-1 font-medium ${h.moved === 'up' ? 'text-green-700' : h.moved === 'down' ? 'text-red-700' : 'text-gray-400'}`}>
                              {h.moved === 'up' ? '↑ promoted' : h.moved === 'down' ? '↓ demoted' : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Series</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Freq</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">First Trade</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Days</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Trades</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Current Tier</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Last r30</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {allSorted.map(bt => (
                        <tr key={bt.series} className="hover:bg-blue-50 cursor-pointer" onClick={() => setBacktestSelectedSeries(bt.series)}>
                          <td className="px-3 py-1 font-medium text-blue-700">{bt.series}</td>
                          <td className="px-3 py-1 text-gray-500">{bt.frequency}</td>
                          <td className="px-3 py-1 font-mono text-gray-500">{bt.firstTradeDate}</td>
                          <td className="px-3 py-1 text-gray-500">{bt.daysTracked}</td>
                          <td className="px-3 py-1 text-gray-500">{bt.totalTrades}</td>
                          <td className="px-3 py-1 font-semibold">{bt.currentTier === 1 ? '1¢' : `${bt.currentTier}¢`}</td>
                          <td className={`px-3 py-1 ${bt.lastR30 === null ? 'text-gray-300' : bt.lastR30 >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {bt.lastR30 === null ? '—' : formatPercent(bt.lastR30)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="px-6 py-3 border-t text-xs text-gray-500 bg-gray-50">
                Click a series to see its day-by-day tier history. Click Back to return.
              </div>
            </div>
          </div>
        );
      })()}

      {sqlModal !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-semibold">Position Size SQL</h3>
              <button onClick={() => setSqlModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <div className="px-6 py-2 text-xs text-gray-500 border-b bg-gray-50">
              <span className="font-medium text-gray-700">Per-event ladder</span> (w/d/h/15m): 1¢→10→25→50→75→100→125→150→175→200¢. Days 1–3 at 1¢; then 3 consecutive r30 ≥ 0 days → +1 level, any r30 &lt; 0 → -1 level. Inactive days hold. &nbsp;·&nbsp;
              <span className="font-medium text-gray-700">Monthly</span>: 200¢ (positive 30d + 2+ trades), 100¢ (mentions / no data), 1¢ (negative 30d + 2+ trades). &nbsp;·&nbsp;
              <span className="font-medium text-gray-700">DELETE</span> — inactive 30d (daily/hourly), 60d (weekly), 90d (monthly); one_off/annual/custom never deleted. &nbsp;·&nbsp;
              <span className="font-medium text-gray-700">Disabled stinkers</span> — 90d/30t (per-event) or 180d/6t (monthly), all-time negative (non-weather).
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
