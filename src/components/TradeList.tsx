'use client';

import React, { useState, useMemo } from 'react';
import { MatchedTrade } from '@/utils/processData';

type SortField = 'Exit_Date' | 'Entry_Date' | 'Net_Profit' | 'ROI';

interface TradeListProps {
  trades: MatchedTrade[];
}

export default function TradeList({ trades }: TradeListProps) {
  const [sortField, setSortField] = useState<SortField>('Exit_Date');
  const [sortAsc, setSortAsc] = useState(false);

  const sortedTrades = useMemo(() => {
    return [...trades].sort((a, b) => {
      let cmp: number;
      switch (sortField) {
        case 'Exit_Date':
          cmp = new Date(a.Exit_Date).getTime() - new Date(b.Exit_Date).getTime();
          break;
        case 'Entry_Date':
          cmp = new Date(a.Entry_Date).getTime() - new Date(b.Entry_Date).getTime();
          break;
        case 'Net_Profit':
          cmp = a.Net_Profit - b.Net_Profit;
          break;
        case 'ROI':
          cmp = (a.ROI || 0) - (b.ROI || 0);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [trades, sortField, sortAsc]);

  const handleHeaderClick = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return null;
    return <span className="ml-1">{sortAsc ? '\u2191' : '\u2193'}</span>;
  };

  const headerClass = (field: SortField) =>
    `px-6 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer select-none transition-colors ${
      sortField === field
        ? 'text-blue-600 bg-blue-50'
        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
    }`;

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="mt-6">
      <h2 className="text-xl font-semibold mb-4">Series Trades</h2>
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ticker
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Direction
                </th>
                <th scope="col" className={headerClass('Entry_Date')} onClick={() => handleHeaderClick('Entry_Date')}>
                  Entry Date{sortIndicator('Entry_Date')}
                </th>
                <th scope="col" className={headerClass('Exit_Date')} onClick={() => handleHeaderClick('Exit_Date')}>
                  Exit Date{sortIndicator('Exit_Date')}
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contracts
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fees
                </th>
                <th scope="col" className={headerClass('Net_Profit')} onClick={() => handleHeaderClick('Net_Profit')}>
                  Net Profit{sortIndicator('Net_Profit')}
                </th>
                <th scope="col" className={headerClass('ROI')} onClick={() => handleHeaderClick('ROI')}>
                  ROI{sortIndicator('ROI')}
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hold Period
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedTrades.map((trade, index) => (
                <tr key={index} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {trade.Ticker}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {trade.Entry_Direction}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(trade.Entry_Date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(trade.Exit_Date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {trade.Contracts}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${trade.Total_Fees.toFixed(2)}
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm ${trade.Net_Profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${trade.Net_Profit.toFixed(2)}
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm ${(trade.ROI || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {((trade.ROI || 0) * 100).toFixed(2)}%
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {trade.Holding_Period_Days.toFixed(1)} days
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
