'use client';

import React from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

interface TradeDirectionPieProps {
  yesCount: number;
  noCount: number;
}

export default function TradeDirectionPie({ yesCount, noCount }: TradeDirectionPieProps) {
  const total = yesCount + noCount;
  const yesPct = total > 0 ? ((yesCount / total) * 100).toFixed(1) : '0';
  const noPct = total > 0 ? ((noCount / total) * 100).toFixed(1) : '0';

  const data = {
    labels: [`YES: ${yesCount.toLocaleString()} (${yesPct}%)`, `NO: ${noCount.toLocaleString()} (${noPct}%)`],
    datasets: [
      {
        label: 'Trade Direction',
        data: [yesCount, noCount],
        backgroundColor: [
          'rgba(54, 162, 235, 0.6)',
          'rgba(255, 99, 132, 0.6)',
        ],
        borderColor: [
          'rgba(54, 162, 235, 1)',
          'rgba(255, 99, 132, 1)',
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