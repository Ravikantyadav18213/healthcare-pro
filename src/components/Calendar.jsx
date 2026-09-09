import React, { useState } from "react";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";

export default function Calendar({ markedDates = [] }) {
  const [current, setCurrent] = useState(new Date(2026, 7, 1));
  const year = current.getFullYear();
  const month = current.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const marked = new Set(markedDates.map(d => new Date(d).getDate()));

  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div className="glass-card">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setCurrent(new Date(year, month - 1, 1))} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"><FiChevronLeft size={16} /></button>
        <span className="text-sm font-semibold">{current.toLocaleString("default", { month: "long", year: "numeric" })}</span>
        <button onClick={() => setCurrent(new Date(year, month + 1, 1))} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"><FiChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400 mb-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {cells.map((day, i) => (
          <div
            key={i}
            className={`h-7 flex items-center justify-center rounded-lg ${
              day === null ? "" : marked.has(day) ? "bg-brand-600 text-white font-semibold" : "hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {day || ""}
          </div>
        ))}
      </div>
    </div>
  );
}
