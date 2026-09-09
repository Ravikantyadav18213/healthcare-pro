import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { FiClock } from "react-icons/fi";
import SelectDropdown from "./SelectDropdown.jsx";

/* ==================================================================
   CUSTOM TIME PICKER

   The time sibling of DatePicker.jsx — a native `type="time"` input
   hands its picker to the OS/browser (an iOS wheel, an Android
   clock face), which looks nothing like the rest of the app. This
   renders the trigger AND the picker itself, through a portal into
   <body>, using the same positioning/outside-click/z-index pattern
   ([z-95] — above Modal's z-90).

   value/onChange are plain 24-hour 'HH:MM' strings (or ""), matching
   what a native time input's onChange(event) => event.target.value
   already produced — swapping this in needs no form-state changes.
================================================================== */

const POPOVER_WIDTH = 260;
const VIEWPORT_MARGIN = 8;

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function pad2(n) {
  return String(n).padStart(2, "0");
}

function parse24(value) {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  const period = hour24 >= 12 ? "PM" : "AM";
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minute, period };
}

function to24(hour12, minute, period) {
  let hour24 = hour12 % 12;
  if (period === "PM") hour24 += 12;
  return `${pad2(hour24)}:${pad2(minute)}`;
}

function formatDisplay(value) {
  const parsed = parse24(value);
  if (!parsed) return "";
  return `${pad2(parsed.hour12)}:${pad2(parsed.minute)} ${parsed.period}`;
}

export default function TimePicker({
  id,
  value,
  onChange,
  placeholder = "Select time",
  ariaLabel,
  className = "",
  required,
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);

  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  const fallback = parse24(value) || { hour12: 9, minute: 0, period: "AM" };
  const [draftHour, setDraftHour] = useState(fallback.hour12);
  const [draftMinute, setDraftMinute] = useState(fallback.minute);
  const [draftPeriod, setDraftPeriod] = useState(fallback.period);

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
    const start = parse24(value) || { hour12: 9, minute: 0, period: "AM" };
    setDraftHour(start.hour12);
    setDraftMinute(start.minute);
    setDraftPeriod(start.period);
    place();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (
        popoverRef.current?.contains(event.target) ||
        triggerRef.current?.contains(event.target) ||
        /* Hour/Minute/Period each render their open list into their
           own portal, not inside popoverRef — without this check,
           picking an option there reads as an "outside" click and
           closes this whole popover a beat before the option's own
           click fires. */
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

    /* Same exception as the outside-click check: the Hour/Minute
       lists scroll inside their own portal, and scrolling one of them
       must not close the picker out from under the user. */
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

  const apply = () => {
    onChange(to24(draftHour, draftMinute, draftPeriod));
    close();
  };

  const clear = () => {
    onChange("");
    close();
  };

  const popover = open && coords && (
    <motion.div
      ref={popoverRef}
      role="dialog"
      aria-label={ariaLabel || "Choose a time"}
      initial={{ opacity: 0, scale: 0.97, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.14 }}
      style={{ position: "fixed", top: coords.top, left: coords.left, width: POPOVER_WIDTH }}
      className="z-[95] rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 shadow-xl p-3"
    >
      <div className="flex items-center gap-1.5 mb-4">
        <SelectDropdown
          value={String(draftHour)}
          onChange={(v) => setDraftHour(Number(v))}
          options={HOURS.map((hour) => ({ value: String(hour), label: pad2(hour) }))}
          ariaLabel="Hour"
          className="flex-1 min-w-0 justify-center text-sm"
        />
        <span className="text-slate-400 font-semibold">:</span>
        <SelectDropdown
          value={String(draftMinute)}
          onChange={(v) => setDraftMinute(Number(v))}
          options={MINUTES.map((minute) => ({ value: String(minute), label: pad2(minute) }))}
          ariaLabel="Minute"
          className="flex-1 min-w-0 justify-center text-sm"
        />
        <SelectDropdown
          value={draftPeriod}
          onChange={setDraftPeriod}
          options={[
            { value: "AM", label: "AM" },
            { value: "PM", label: "PM" },
          ]}
          ariaLabel="AM or PM"
          className="w-[68px] shrink-0 justify-center text-sm"
        />
      </div>

      <div className="flex gap-2.5">
        {value && (
          <button type="button" onClick={clear} className="btn-secondary flex-1">
            Clear
          </button>
        )}
        <button type="button" onClick={close} className="btn-secondary flex-1">
          Cancel
        </button>
        <button type="button" onClick={apply} className="btn-primary flex-1">
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
        <FiClock
          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          size={16}
        />
        <span className={value ? "" : "text-slate-400"}>
          {value ? formatDisplay(value) : placeholder}
        </span>
      </button>

      {popover && typeof document !== "undefined" && createPortal(popover, document.body)}
    </>
  );
}
