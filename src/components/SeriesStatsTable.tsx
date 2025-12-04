'use client';

import React, { useMemo, useState } from 'react';
import { MatchedTrade, calculateSeriesStatsFromMatched } from '@/utils/processData';

interface SeriesStatsTableProps {
  matchedTrades: MatchedTrade[];
  selectedSeries: string | null;
  onSeriesSelect: (series: string | null) => void;
}

type SortField = 'series' | 'pnl' | 'events' | 'markets' | 'avgReturn' | 'winRate';
type SortDirection = 'asc' | 'desc';

export default function SeriesStatsTable({ matchedTrades, selectedSeries, onSeriesSelect }: SeriesStatsTableProps) {
  const [sortField, setSortField] = useState<SortField>('pnl');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const seriesData = useMemo(() => {
    const statsMap = calculateSeriesStatsFromMatched(matchedTrades);
    
    return Array.from(statsMap.values()).map(stats => ({
      series: stats.series,
      pnl: stats.pnl,
      eventsCount: stats.eventsTraded.size,
      marketsCount: stats.marketsTraded.size,
      avgReturn: stats.totalCost > 0 ? stats.pnl / stats.totalCost : 0,
      winRate: stats.tradesCount > 0 ? stats.winCount / stats.tradesCount : 0,
      tradesCount: stats.tradesCount,
    }));
  }, [matchedTrades]);

  const sortedData = useMemo(() => {
    return [...seriesData].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      switch (sortField) {
        case 'series':
          aVal = a.series;
          bVal = b.series;
          break;
        case 'pnl':
          aVal = a.pnl;
          bVal = b.pnl;
          break;
        case 'events':
          aVal = a.eventsCount;
          bVal = b.eventsCount;
          break;
        case 'markets':
          aVal = a.marketsCount;
          bVal = b.marketsCount;
          break;
        case 'avgReturn':
          aVal = a.avgReturn;
          bVal = b.avgReturn;
          break;
        case 'winRate':
          aVal = a.winRate;
          bVal = b.winRate;
          break;
        default:
          aVal = a.pnl;
          bVal = b.pnl;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
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
    if (sortField !== field) {
      return <span className="ml-1 text-gray-300">↕</span>;
    }
    return <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  const handleRowClick = (series: string) => {
    if (selectedSeries === series) {
      onSeriesSelect(null);
    } else {
      onSeriesSelect(series);
    }
  };

  if (seriesData.length === 0) {
    return null;
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Series Performance</h2>
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
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th 
                  scope="col" 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('series')}
                >
                  Series <SortIcon field="series" />
                </th>
                <th 
                  scope="col" 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('pnl')}
                >
                  PNL <SortIcon field="pnl" />
                </th>
                <th 
                  scope="col" 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('events')}
                >
                  Events <SortIcon field="events" />
                </th>
                <th 
                  scope="col" 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('markets')}
                >
                  Markets <SortIcon field="markets" />
                </th>
                <th 
                  scope="col" 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('avgReturn')}
                >
                  Avg Return <SortIcon field="avgReturn" />
                </th>
                <th 
                  scope="col" 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('winRate')}
                >
                  Win Rate <SortIcon field="winRate" />
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedData.map((row) => (
                <tr 
                  key={row.series}
                  onClick={() => handleRowClick(row.series)}
                  className={`cursor-pointer transition-colors ${
                    selectedSeries === row.series 
                      ? 'bg-blue-50 hover:bg-blue-100' 
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {row.series}
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                    row.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatCurrency(row.pnl)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {row.eventsCount}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {row.marketsCount}
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                    row.avgReturn >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatPercent(row.avgReturn)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatPercent(row.winRate)}
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
    </div>
  );
}

