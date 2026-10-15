import {
  BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(BarElement, CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip);
ChartJS.defaults.font.family = '"Schibsted Grotesk", system-ui, sans-serif';
ChartJS.defaults.color = '#4A5873';

export const COLORS = {
  brand: '#2342E6',
  brandSoft: 'rgba(35,66,230,0.14)',
  amber: '#C98A00',
  green: '#0B7A57',
  grid: '#E3E8EF',
};

const base = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 250 },
};

export function LineChart({ labels, datasets, yFormat, height = 280, label }) {
  const options = {
    ...base,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: datasets.length > 1, position: 'bottom' },
      tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${yFormat ? yFormat(c.parsed.y) : c.parsed.y}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 8, maxRotation: 0 } },
      y: { grid: { color: COLORS.grid }, ticks: { callback: (v) => (yFormat ? yFormat(v) : v) } },
    },
  };
  return (
    <div className="chart" style={{ height }} role="img" aria-label={label}>
      <Line data={{ labels, datasets }} options={options} />
    </div>
  );
}

export function BarChart({ labels, data, color = COLORS.brand, horizontal = false, height = 260, label, datasetLabel = 'Count' }) {
  const options = {
    ...base,
    indexAxis: horizontal ? 'y' : 'x',
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: horizontal, color: COLORS.grid }, beginAtZero: true },
      y: { grid: { display: !horizontal, color: COLORS.grid }, beginAtZero: true },
    },
  };
  return (
    <div className="chart" style={{ height }} role="img" aria-label={label}>
      <Bar data={{ labels, datasets: [{ label: datasetLabel, data, backgroundColor: color, borderRadius: 3 }] }} options={options} />
    </div>
  );
}
