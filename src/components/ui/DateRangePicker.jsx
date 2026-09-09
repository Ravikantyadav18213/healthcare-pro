import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { FiChevronLeft, FiChevronRight, FiCalendar } from "react-icons/fi";
import SelectDropdown from "./SelectDropdown.jsx";

/* ==================================================================
   CUSTOM DATE RANGE PICKER

   A compact, single-month popover for picking a start + end date —
   not a modal. Rendered through a portal into <body> and positioned
   from the trigger's own bounding rect, same pattern (and same
   reasons: overflow clipping, containing-block traps from a
   `motion.div` ancestor) as RowActionsMenu.jsx and Modal.jsx.

   The draft selection lives entirely in this component's own state
   and is only handed up via onApply — closing with Cancel (or
   clicking outside, or Escape) discards it, leaving the caller's
   applied `value` untouched.
================================================================== */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const POPOVER_WIDTH = 300;
const VIEWPORT_MARGIN = 8;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toISO(year, month, day) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function formatDisplay(iso) {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function DateRangePicker({ value, onApply, label = "Custom Date Range" }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);

  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const [draftFrom, setDraftFrom] = useState(null);
  const [draftTo, setDraftTo] = useState(null);
  const [hoverDate, setHoverDate] = useState(null);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const top = rect.bottom + 6;

    let left = rect.left;
    left = Math.min(left, window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN);
    left = Math.max(left, VIEWPORT_MARGIN);

    setCoords({ top, left });
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const openPopover = () => {
    const anchor = value?.from ? new Date(`${value.from}T00:00:00`) : today;
    setViewYear(anchor.getFullYear());
    setViewMonth(anchor.getMonth());
    setDraftFrom(value?.from || null);
    setDraftTo(value?.to || null);
    setHoverDate(null);
    place();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (
        popoverRef.current?.contains(event.target) ||
        triggerRef.current?.contains(event.target) ||
        /* The Month/Year selects render their open list into their own
           portal, not inside popoverRef — without this check, picking
           an option there reads as an "outside" click and closes this
           whole popover a beat before the option's own click fires. */
        event.target.closest?.("[data-select-dropdown-menu]")
      ) {
        return;
      }
      close();
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        triggerRef.current?.focus();
      }
    };

    /* Same exception as the outside-click check: the Month/Year lists
       scroll inside their own portal, and scrolling one of them must
       not close the calendar out from under the user. */
    const onScroll = (event) => {
      const target = event.target;
      if (target instanceof Node && popoverRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-select-dropdown-menu]")) return;
      close();
    };

    const onResize = () => close();

    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  const pickDay = (iso) => {
    if (!draftFrom || draftTo) {
      setDraftFrom(iso);
      setDraftTo(null);
      return;
    }
    if (iso < draftFrom) {
      setDraftFrom(iso);
      setDraftTo(null);
      return;
    }
    setDraftTo(iso);
  };

  const apply = () => {
    if (!draftFrom || !draftTo) return;
    onApply({ from: draftFrom, to: draftTo });
    close();
  };

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((year) => year - 1);
    } else {
      setViewMonth((month) => month - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((year) => year + 1);
    } else {
      setViewMonth((month) => month + 1);
    }
  };

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const previewEnd = draftTo || hoverDate;
  const rangeLow = draftFrom && previewEnd ? (draftFrom < previewEnd ? draftFrom : previewEnd) : null;
  const rangeHigh = draftFrom && previewEnd ? (draftFrom < previewEnd ? previewEnd : draftFrom) : null;

  const years = Array.from({ length: 11 }, (_, i) => today.getFullYear() - 9 + i);

  const popover = open && coords && (
    <motion.div
      ref={popoverRef}
      role="dialog"
      aria-label="Select a custom date range"
      initial={{ opacity: 0, scale: 0.97, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.14 }}
      style={{ position: "fixed", top: coords.top, left: coords.left, width: POPOVER_WIDTH }}
      className="z-[50] rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 shadow-xl p-3"
    >
      {/* ---- month navigation ---- */}
      <div className="flex items-center gap-1.5 mb-3">
        <button
          type="button"
          onClick={goPrevMonth}
          aria-label="Previous month"
          className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-white transition"
        >
          <FiChevronLeft size={15} />
        </button>

        <SelectDropdown
          value={String(viewMonth)}
          onChange={(value) => setViewMonth(Number(value))}
          options={MONTHS.map((name, index) => ({ value: String(index), label: name }))}
          ariaLabel="Month"
          className="flex-1 min-w-0 text-xs py-1"
        />

        <SelectDropdown
          value={String(viewYear)}
          onChange={(value) => setViewYear(Number(value))}
          options={years.map((year) => ({ value: String(year), label: String(year) }))}
          ariaLabel="Year"
          className="w-[76px] shrink-0 text-xs py-1"
        />

        <button
          type="button"
          onClick={goNextMonth}
          aria-label="Next month"
          className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-white transition"
        >
          <FiChevronRight size={15} />
        </button>
      </div>

      {/* ---- weekdays ---- */}
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold text-slate-400 mb-1">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      {/* ---- date grid ---- */}
      <div className="grid grid-cols-7 gap-0.5" onMouseLeave={() => setHoverDate(null)}>
        {cells.map((day, index) => {
          if (day === null) return <div key={index} className="h-8" />;

          const iso = toISO(viewYear, viewMonth, day);
          const isStart = iso === draftFrom;
          const isEnd = iso === draftTo;
          const inRange = rangeLow && rangeHigh && iso > rangeLow && iso < rangeHigh;

          return (
            <button
              key={index}
              type="button"
              onClick={() => pickDay(iso)}
              onMouseEnter={() => draftFrom && !draftTo && setHoverDate(iso)}
              className={`h-8 text-xs rounded-lg flex items-center justify-center transition ${
                isStart || isEnd
                  ? "bg-brand-600 text-white font-semibold"
                  : inRange
                  ? "bg-brand-100 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* ---- start / end fields ---- */}
      <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
            Start Date
          </label>
          <div className="relative">
            <FiCalendar
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              readOnly
              value={formatDisplay(draftFrom) || "Select a date"}
              aria-label="Start date"
              className="w-full pl-7 pr-1.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-default"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
            End Date
          </label>
          <div className="relative">
            <FiCalendar
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              readOnly
              value={formatDisplay(draftTo) || "Select a date"}
              aria-label="End date"
              className="w-full pl-7 pr-1.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-default"
            />
          </div>
        </div>
      </div>

      {/* ---- actions ---- */}
      <div className="flex gap-2.5 mt-3">
        <button type="button" onClick={close} className="btn-secondary flex-1">
          Cancel
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={!draftFrom || !draftTo}
          className="btn-primary flex-1 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
        >
          Apply
        </button>
      </div>
    </motion.div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : openPopover())}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="input-field w-auto inline-flex items-center gap-2"
      >
        <FiCalendar size={14} className="text-slate-400 shrink-0" />
        <span className="truncate">
          {value?.from && value?.to
            ? `${formatDisplay(value.from)} - ${formatDisplay(value.to)}`
            : label}
        </span>
      </button>

      {popover && typeof document !== "undefined" && createPortal(popover, document.body)}
    </>
  );
}
