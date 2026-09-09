import React, { useMemo } from "react";
import { Line, Pie, Bar, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, ArcElement, Tooltip, Legend, Filler,
} from "chart.js";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Tooltip, Legend, Filler
);

/* ==================================================================
   Every chart takes live data from the API. The defaults exist only
   so a chart still renders while its request is in flight.
================================================================== */

const gridColor = "rgba(148,163,184,0.15)";

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { intersect: false, mode: "index" },
  plugins: {
    legend: { labels: { boxWidth: 10, font: { size: 11 }, usePointStyle: true } },
    tooltip: {
      backgroundColor: "rgba(15,23,42,0.92)",
      padding: 10,
      cornerRadius: 8,
      titleFont: { size: 12 },
      bodyFont: { size: 12 },
    },
  },
  scales: {
    x: { grid: { color: gridColor, drawBorder: false }, ticks: { font: { size: 10 } } },
    y: {
      grid: { color: gridColor, drawBorder: false },
      ticks: { font: { size: 10 } },
      beginAtZero: true,
    },
  },
};

const PALETTE = [
  "#2563EB", "#0EA5E9", "#10B981", "#8B5CF6",
  "#F59E0B", "#EF4444", "#14B8A6", "#6366F1",
];

/* Short day/date label for the x-axis. */
function shortDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return value;
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function RevenueLineChart({ labels = [], values = [], height = 260 }) {
  const data = useMemo(
    () => ({
      labels: labels.map(shortDate),
      datasets: [
        {
          label: "Revenue (₹)",
          data: values,
          borderColor: "#2563EB",
          backgroundColor: "rgba(37,99,235,0.14)",
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2,
        },
      ],
    }),
    [labels, values]
  );

  return (
    <div style={{ height }}>
      <Line data={data} options={baseOptions} />
    </div>
  );
}

export function DepartmentPieChart({ labels = [], values = [], height = 260 }) {
  const data = useMemo(
    () => ({
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: PALETTE.slice(0, Math.max(labels.length, 1)),
          borderWidth: 0,
          hoverOffset: 6,
        },
      ],
    }),
    [labels, values]
  );

  return (
    <div style={{ height }}>
      <Pie
        data={data}
        options={{
          ...baseOptions,
          scales: undefined,
          plugins: {
            ...baseOptions.plugins,
            legend: { position: "right", labels: { boxWidth: 10, font: { size: 11 } } },
          },
        }}
      />
    </div>
  );
}

export function AppointmentsBarChart({ labels = [], values = [], height = 260 }) {
  const data = useMemo(
    () => ({
      labels: labels.map(shortDate),
      datasets: [
        {
          label: "Appointments",
          data: values,
          backgroundColor: "#3B82F6",
          borderRadius: 6,
          maxBarThickness: 34,
        },
      ],
    }),
    [labels, values]
  );

  return (
    <div style={{ height }}>
      <Bar data={data} options={baseOptions} />
    </div>
  );
}

export function StatusDoughnutChart({ labels = [], values = [], height = 260 }) {
  const pretty = labels.map((label) =>
    String(label)
      .replace("_", " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );

  const data = {
    labels: pretty,
    datasets: [
      {
        data: values,
        backgroundColor: PALETTE.slice(0, Math.max(labels.length, 1)),
        borderWidth: 0,
        hoverOffset: 6,
      },
    ],
  };

  return (
    <div style={{ height }}>
      <Doughnut
        data={data}
        options={{
          ...baseOptions,
          scales: undefined,
          cutout: "62%",
          plugins: {
            ...baseOptions.plugins,
            legend: { position: "right", labels: { boxWidth: 10, font: { size: 11 } } },
          },
        }}
      />
    </div>
  );
}

export function DoctorUtilisationChart({ labels = [], values = [], height = 260 }) {
  const data = {
    labels,
    datasets: [
      {
        label: "Appointments (30 days)",
        data: values,
        backgroundColor: "#10B981",
        borderRadius: 6,
        maxBarThickness: 22,
      },
    ],
  };

  return (
    <div style={{ height }}>
      <Bar
        data={data}
        options={{
          ...baseOptions,
          indexAxis: "y",
          scales: {
            x: { grid: { color: gridColor }, ticks: { font: { size: 10 } }, beginAtZero: true },
            y: { grid: { display: false }, ticks: { font: { size: 10 } } },
          },
        }}
      />
    </div>
  );
}
