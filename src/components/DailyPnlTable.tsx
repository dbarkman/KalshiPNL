'use client';

import React, { useMemo, useState } from 'react';
import { MatchedTrade } from '@/utils/processData';

interface DailyPnlTableProps {
  matchedTrades: MatchedTrade[];
  selectedDays?: Set<string>;
  onDaySelect?: (day: string | null, metaKey: boolean) => void;
}

interface DayRow {
  date: string;
  pnl: number;
  proceeds: number;
  trades: number;
  wins: number;
  losses: number;
  totalCost: number;
  fees: number;
}

type SortField = 'date' | 'pnl' | 'proceeds' | 'cost' | 'trades' | 'winRate' | 'avgReturn' | 'fees';
type SortDirection = 'asc' | 'desc';

export default function DailyPnlTable({ matchedTrades, selectedDays, onDaySelect }: DailyPnlTableProps) {
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const dailyData = useMemo(() => {
    const dayMap = new Map<string, DayRow>();

    matchedTrades.forEach(t => {
      const dateKey = t.Exit_Date.toLocaleDateString('en-CA'); // YYYY-MM-DD

      const existing = dayMap.get(dateKey);
      if (existing) {
        existing.pnl += t.Net_Profit;
        existing.proceeds += t.Entry_Cost + t.Net_Profit + t.Total_Fees;
        existing.trades++;
        if (t.Net_Profit > 0) existing.wins++;
        else existing.losses++;
        existing.totalCost += t.Entry_Cost;
        existing.fees += t.Total_Fees;
      } else {
        dayMap.set(dateKey, {
          date: dateKey,
          pnl: t.Net_Profit,
          proceeds: t.Entry_Cost + t.Net_Profit + t.Total_Fees,
          trades: 1,
          wins: t.Net_Profit > 0 ? 1 : 0,
          losses: t.Net_Profit > 0 ? 0 : 1,
          totalCost: t.Entry_Cost,
          fees: t.Total_Fees,
        });
      }
    });

    return Array.from(dayMap.values());
  }, [matchedTrades]);

  const sortedData = useMemo(() => {
    return [...dailyData].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      switch (sortField) {
        case 'date': aVal = a.date; bVal = b.date; break;
        case 'pnl': aVal = a.pnl; bVal = b.pnl; break;
        case 'proceeds': aVal = a.proceeds; bVal = b.proceeds; break;
        case 'cost': aVal = a.totalCost; bVal = b.totalCost; break;
        case 'trades': aVal = a.trades; bVal = b.trades; break;
        case 'winRate':
          aVal = a.trades > 0 ? a.wins / a.trades : 0;
          bVal = b.trades > 0 ? b.wins / b.trades : 0;
          break;
        case 'avgReturn':
          aVal = a.totalCost > 0 ? a.pnl / a.totalCost : 0;
          bVal = b.totalCost > 0 ? b.pnl / b.totalCost : 0;
          break;
        case 'fees': aVal = a.fees; bVal = b.fees; break;
        default: aVal = a.date; bVal = b.date;
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
  }, [dailyData, sortField, sortDirection]);

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

  // Summary row
  const totals = useMemo(() => {
    return dailyData.reduce(
      (acc, d) => ({
        pnl: acc.pnl + d.pnl,
        proceeds: acc.proceeds + d.proceeds,
        trades: acc.trades + d.trades,
        wins: acc.wins + d.wins,
        totalCost: acc.totalCost + d.totalCost,
        fees: acc.fees + d.fees,
      }),
      { pnl: 0, proceeds: 0, trades: 0, wins: 0, totalCost: 0, fees: 0 },
    );
  }, [dailyData]);

  if (dailyData.length === 0) {
    return null;
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Daily P&L</h2>
        {selectedDays && selectedDays.size > 0 && onDaySelect && (
          <button
            onClick={() => onDaySelect(null, false)}
            className="flex items-center gap-2 px-3 py-1.5 bg-teal-50 text-teal-700 rounded-full text-sm font-medium hover:bg-teal-100 transition-colors"
          >
            <span>Filtering: {selectedDays.size === 1 ? Array.from(selectedDays)[0] : `${selectedDays.size} days`}</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('date')}
                >
                  Date <SortIcon field="date" />
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('proceeds')}
                >
                  Proceeds <SortIcon field="proceeds" />
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('cost')}
                >
                  Cost <SortIcon field="cost" />
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('fees')}
                >
                  Fees <SortIcon field="fees" />
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('pnl')}
                >
                  Net Profit <SortIcon field="pnl" />
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('trades')}
                >
                  Trades <SortIcon field="trades" />
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('winRate')}
                >
                  Win Rate <SortIcon field="winRate" />
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('avgReturn')}
                >
                  Avg Return <SortIcon field="avgReturn" />
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedData.map((row) => (
                <tr
                  key={row.date}
                  onClick={(e) => onDaySelect?.(row.date, e.metaKey || e.ctrlKey)}
                  className={`cursor-pointer transition-colors ${
                    selectedDays?.has(row.date)
                      ? 'bg-teal-50 hover:bg-teal-100'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                    {row.date}
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500">
                    {formatCurrency(row.proceeds)}
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500">
                    {formatCurrency(row.totalCost)}
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500">
                    {formatCurrency(row.fees)}
                  </td>
                  <td className={`px-6 py-3 whitespace-nowrap text-sm font-medium ${
                    row.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatCurrency(row.pnl)}
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500">
                    {row.trades}
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500">
                    {formatPercent(row.trades > 0 ? row.wins / row.trades : 0)}
                  </td>
                  <td className={`px-6 py-3 whitespace-nowrap text-sm ${
                    row.totalCost > 0 && row.pnl / row.totalCost >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatPercent(row.totalCost > 0 ? row.pnl / row.totalCost : 0)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 sticky bottom-0">
              <tr className="font-semibold">
                <td className="px-6 py-3 text-sm text-gray-900">
                  Total ({dailyData.length} days)
                </td>
                <td className="px-6 py-3 text-sm text-gray-500">
                  {formatCurrency(totals.proceeds)}
                </td>
                <td className="px-6 py-3 text-sm text-gray-500">
                  {formatCurrency(totals.totalCost)}
                </td>
                <td className="px-6 py-3 text-sm text-gray-500">
                  {formatCurrency(totals.fees)}
                </td>
                <td className={`px-6 py-3 text-sm font-semibold ${
                  totals.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatCurrency(totals.pnl)}
                </td>
                <td className="px-6 py-3 text-sm text-gray-500">
                  {totals.trades}
                </td>
                <td className="px-6 py-3 text-sm text-gray-500">
                  {formatPercent(totals.trades > 0 ? totals.wins / totals.trades : 0)}
                </td>
                <td className={`px-6 py-3 text-sm ${
                  totals.totalCost > 0 && totals.pnl / totals.totalCost >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatPercent(totals.totalCost > 0 ? totals.pnl / totals.totalCost : 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="px-6 py-3 bg-gray-50 text-xs text-gray-500">
          Click a day to filter. Cmd+click to select multiple days. Click again to deselect.
        </div>
      </div>
    </div>
  );
}
