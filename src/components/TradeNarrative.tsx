'use client';

import React, { useState } from 'react';
import { MatchedTrade, parseTickerComponents, CategoryStats } from '@/utils/processData';

interface TradeNarrativeProps {
  matchedTrades: MatchedTrade[];
  basicStats: {
    uniqueTickers: number;
    totalTrades: number;
    yesNoBreakdown: { Yes: number; No: number };
    totalFees: number;
    totalProfit: number;
    avgContractPurchasePrice: number;
    avgContractFinalPrice: number;
    weightedHoldingPeriod: number;
    winRate: number;
    settledWinRate: number;
  };
  categoryMap: Map<string, string>;
}

export default function TradeNarrative({ matchedTrades, basicStats, categoryMap }: TradeNarrativeProps) {
  const [narrative, setNarrative] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateNarrative = async () => {
    setLoading(true);
    setError(null);

    // Build a compact stats payload for the LLM
    const seriesMap = new Map<string, { pnl: number; trades: number; wins: number; cost: number }>();
    const categoryAgg = new Map<string, { pnl: number; trades: number; wins: number; series: Set<string> }>();

    matchedTrades.forEach(t => {
      const { series } = parseTickerComponents(t.Ticker);

      // Series stats
      const s = seriesMap.get(series) || { pnl: 0, trades: 0, wins: 0, cost: 0 };
      s.pnl += t.Net_Profit;
      s.trades++;
      s.cost += t.Entry_Cost;
      if (t.Net_Profit > 0) s.wins++;
      seriesMap.set(series, s);

      // Category stats
      const cat = categoryMap.get(series) || 'Uncategorized';
      const c = categoryAgg.get(cat) || { pnl: 0, trades: 0, wins: 0, series: new Set<string>() };
      c.pnl += t.Net_Profit;
      c.trades++;
      if (t.Net_Profit > 0) c.wins++;
      c.series.add(series);
      categoryAgg.set(cat, c);
    });

    // Top/bottom series by PNL
    const seriesArr = Array.from(seriesMap.entries())
      .map(([name, s]) => ({ name, ...s, roi: s.cost > 0 ? s.pnl / s.cost : 0, winRate: s.trades > 0 ? s.wins / s.trades : 0 }))
      .sort((a, b) => b.pnl - a.pnl);

    const top5 = seriesArr.slice(0, 5).map(s => ({
      series: s.name,
      pnl: +s.pnl.toFixed(2),
      trades: s.trades,
      roi: +(s.roi * 100).toFixed(1) + '%',
      winRate: +(s.winRate * 100).toFixed(1) + '%',
    }));

    const bottom5 = seriesArr.slice(-5).reverse().map(s => ({
      series: s.name,
      pnl: +s.pnl.toFixed(2),
      trades: s.trades,
      roi: +(s.roi * 100).toFixed(1) + '%',
      winRate: +(s.winRate * 100).toFixed(1) + '%',
    }));

    const categories = Array.from(categoryAgg.entries())
      .map(([name, c]) => ({
        category: name,
        pnl: +c.pnl.toFixed(2),
        trades: c.trades,
        seriesCount: c.series.size,
        winRate: +(c.trades > 0 ? (c.wins / c.trades) * 100 : 0).toFixed(1) + '%',
      }))
      .sort((a, b) => b.pnl - a.pnl);

    const payload = {
      overview: {
        totalPnl: +basicStats.totalProfit.toFixed(2),
        totalTrades: basicStats.totalTrades,
        totalFees: +basicStats.totalFees.toFixed(2),
        winRate: +(basicStats.winRate * 100).toFixed(1) + '%',
        settledWinRate: +(basicStats.settledWinRate * 100).toFixed(1) + '%',
        avgHoldingPeriodDays: +basicStats.weightedHoldingPeriod.toFixed(2),
        avgEntryPrice: +basicStats.avgContractPurchasePrice.toFixed(1),
        avgExitPrice: +basicStats.avgContractFinalPrice.toFixed(1),
        uniqueMarkets: basicStats.uniqueTickers,
        totalSeries: seriesMap.size,
      },
      categoryBreakdown: categories,
      top5Series: top5,
      bottom5Series: bottom5,
    };

    try {
      const resp = await fetch('/api/narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      setNarrative(data.narrative);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">AI Performance Summary</h2>
        <button
          onClick={generateNarrative}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full text-sm font-semibold hover:from-purple-700 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <div className="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
              Generating...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {narrative ? 'Regenerate' : 'Generate Summary'}
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {narrative && (
        <div className="bg-white shadow rounded-lg p-6">
          {narrative.split('\n\n').map((paragraph, i) => (
            <p key={i} className={`text-sm text-gray-700 leading-relaxed ${i > 0 ? 'mt-4' : ''}`}>
              {paragraph}
            </p>
          ))}
          <p className="mt-4 text-xs text-gray-400 italic">Generated by Claude via local CLI</p>
        </div>
      )}
    </div>
  );
}
