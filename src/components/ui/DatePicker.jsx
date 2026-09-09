import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { FiChevronLeft, FiChevronRight, FiCalendar } from "react-icons/fi";
import SelectDropdown from "./SelectDropdown.jsx";

/* ==================================================================
   CUSTOM SINGLE-DATE PICKER

   The single-date sibling of DateRangePicker.jsx — same reason to
   exist: a native `type="date"` input hands its calendar to the
   OS/browser, which draws something that looks nothing like the rest
   of the app. This renders the trigger AND the calendar itself,
   through a portal into <body>, using the same positioning /
   outside-click / z-index pattern as DateRangePicker and
   SelectDropdown (z-[95] — above Modal's z-90, since this is used
   inside forms that can themselves sit in a modal).

   value/onChange are plain 'YYYY-MM-DD' strings (or ""), matching
   what a native date input's onChange(event) => event.target.value
   already produced — swapping this in needs no form-state changes.
================================================================== */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const POPOVER_WIDTH = 280;
const VIEWPORT_MARGIN = 8;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toISO(year, month, day) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function parseISO(iso) {
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDisplay(iso) {
  const date = parseISO(iso);
  if (!date) return "";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function DatePicker({
  id,
  value,
  onChange,
  max,
  min,
  placeholder = "Select date",
  ariaLabel,
  className = "",
  required,
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);

  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  const today = new Date();
  const maxDate = parseISO(max) || (max ? null : today);
  const anchor = parseISO(value) || maxDate || today;

  const [viewYear, setViewYear] = useState(anchor.getFullYear());
  const [viewMonth, setViewMonth] = useState(anchor.getMonth());
  const [draft, setDraft] = useState(value || null);

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
    const start = parseISO(value) || maxDate || today;
    setViewYear(start.getFullYear());
    setViewMonth(start.getMonth());
    setDraft(value || null);
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
    if (max && iso > max) return;
    if (min && iso < min) return;
    setDraft(iso);
  };

  const apply = () => {
    onChange(draft || "");
    close();
  };

  const clear = () => {
    onChange("");
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

  /* A wide, sensible span for a date of birth / historical-date
     picker — not the +/-9 years that suits a reporting-period range. */
  const latestYear = (maxDate || today).getFullYear();
  const years = Array.from({ length: 121 }, (_, i) => latestYear - i);

  const popover = open && coords && (
    <motion.div
      ref={popoverRef}
      role="dialog"
      aria-label={ariaLabel || "Choose a date"}
      initial={{ opacity: 0, scale: 0.97, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.14 }}
      style={{ position: "fixed", top: coords.top, left: coords.left, width: POPOVER_WIDTH }}
      className="z-[95] rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 shadow-xl p-3"
    >
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
          onChange={(v) => setViewMonth(Number(v))}
          options={MONTHS.map((name, index) => ({ value: String(index), label: name }))}
          ariaLabel="Month"
          className="flex-1 min-w-0 text-xs py-1"
        />

        <SelectDropdown
          value={String(viewYear)}
          onChange={(v) => setViewYear(Number(v))}
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

      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold text-slate-400 mb-1">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, index) => {
          if (day === null) return <div key={index} className="h-8" />;

          const iso = toISO(viewYear, viewMonth, day);
          const isSelected = iso === draft;
          const isDisabled = (max && iso > max) || (min && iso < min);

          return (
            <button
              key={index}
              type="button"
              disabled={isDisabled}
              onClick={() => pickDay(iso)}
              className={`h-8 text-xs rounded-lg flex items-center justify-center transition ${
                isSelected
                  ? "bg-brand-600 text-white font-semibold"
                  : isDisabled
                  ? "text-slate-300 dark:text-slate-700 cursor-not-allowed"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2.5 mt-3">
        {value && (
          <button type="button" onClick={clear} className="btn-secondary flex-1">
            Clear
          </button>
        )}
        <button type="button" onClick={close} className="btn-secondary flex-1">
          Cancel
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={!draft}
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
        id={id}
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : openPopover())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-required={required}
        className={`relative text-left ${className}`}
      >
        <FiCalendar
          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          size={17}
        />
        <span className={value ? "" : "text-slate-400"}>
          {value ? formatDisplay(value) : placeholder}
        </span>
      </button>

      {popover && typeof document !== "undefined" && createPortal(popover, document.body)}
    </>
  );
}
