'use client';

import React from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { MatchedTrade } from '@/utils/processData';

ChartJS.register(ArcElement, Tooltip, Legend);

interface TradeSettlementPieProps {
  matchedTrades: MatchedTrade[];
}

export default function TradeSettlementPie({ matchedTrades }: TradeSettlementPieProps) {
  // Calculate the number of contracts settled vs sold (exited early)
  const settledContracts = matchedTrades
    .filter(t => t.Exit_Type === 'settlement')
    .reduce((sum, t) => sum + t.Contracts, 0);
  
  const soldContracts = matchedTrades
    .filter(t => t.Exit_Type !== 'settlement')
    .reduce((sum, t) => sum + t.Contracts, 0);

  const total = settledContracts + soldContracts;
  const settledPct = total > 0 ? ((settledContracts / total) * 100).toFixed(1) : '0';
  const soldPct = total > 0 ? ((soldContracts / total) * 100).toFixed(1) : '0';

  const data = {
    labels: [`Settled: ${settledContracts.toLocaleString()} (${settledPct}%)`, `Sold: ${soldContracts.toLocaleString()} (${soldPct}%)`],
    datasets: [
      {
        label: 'Contract Settlement',
        data: [settledContracts, soldContracts],
        backgroundColor: [
          'rgba(75, 192, 192, 0.6)',
          'rgba(153, 102, 255, 0.6)',
        ],
        borderColor: [
          'rgba(75, 192, 192, 1)',
          'rgba(153, 102, 255, 1)',
        ],
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
      },
      title: {
        display: false,
      },
    },
  };

  return (
    <div className="w-full h-full">
      <Pie data={data} options={options} />
    </div>
  );
} 