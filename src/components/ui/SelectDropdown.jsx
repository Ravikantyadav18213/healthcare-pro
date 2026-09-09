import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { FiChevronDown, FiCheck } from "react-icons/fi";

/* ==================================================================
   CUSTOM SELECT DROPDOWN

   A native <select>'s closed state can be styled, but its open list
   is drawn by the OS/browser — on a phone that means a plain native
   picker that looks nothing like the rest of the app. This renders
   both states itself instead, through a portal into <body>, using
   the same positioning/outside-click/Escape pattern as
   RowActionsMenu.jsx and DateRangePicker.jsx.

   options: [{ value, label }] — value is always compared with
   strict `===`, so callers must keep it consistently typed (this
   component always stringifies its own option values; pass the same
   type back in `value`, e.g. String(id) rather than a raw number).
================================================================== */

const VIEWPORT_MARGIN = 8;
const MIN_WIDTH = 168;

export default function SelectDropdown({ id, value, options, onChange, ariaLabel, className = "", disabled }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);

  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const safeOptions = Array.isArray(options) ? options : [];
  const selected = safeOptions.find((option) => option.value === value);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const top = rect.bottom + 6;

    let left = rect.left;
    const width = Math.max(rect.width, MIN_WIDTH);
    left = Math.min(left, window.innerWidth - width - VIEWPORT_MARGIN);
    left = Math.max(left, VIEWPORT_MARGIN);

    setCoords({ top, left, width });
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const toggle = () => {
    if (disabled) return;
    if (!open) place();
    setOpen((current) => !current);
  };

  /* The trigger can move (page scroll, layout shift from data
     loading in) while the menu is open — keep it pinned rather than
     letting it drift away from its own button. */
  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (
        menuRef.current?.contains(event.target) ||
        triggerRef.current?.contains(event.target)
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

    /* Capture-phase, so a scroll in ANY nested container counts —
       the trigger moves under those too. The one exception is this
       menu's own option list: scrolling a long list is not the page
       moving away from the trigger, and closing on it makes the list
       unusable. */
    const onScroll = (event) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
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

  const menu = open && coords && (
    <motion.div
      ref={menuRef}
      role="listbox"
      aria-label={ariaLabel}
      data-select-dropdown-menu
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.12 }}
      style={{ position: "fixed", top: coords.top, left: coords.left, minWidth: coords.width }}
      className="z-[95] max-h-64 overflow-y-auto rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 shadow-lg py-1"
    >
      {safeOptions.length === 0 ? (
        <div className="px-3 py-2 text-sm text-slate-400">No options</div>
      ) : (
        safeOptions.map((option) => {
          const isActive = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={isActive}
              onClick={() => {
                close();
                if (!isActive) onChange(option.value);
              }}
              className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 transition ${
                isActive
                  ? "bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 font-semibold"
                  : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              <span className="truncate">{option.label}</span>
              {isActive && <FiCheck size={14} className="shrink-0" />}
            </button>
          );
        })
      )}
    </motion.div>
  );

  return (
    <>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        className={`input-field inline-flex items-center justify-between gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      >
        <span className="truncate">{selected?.label ?? safeOptions[0]?.label ?? ""}</span>
        <FiChevronDown
          size={15}
          className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {menu && typeof document !== "undefined" && createPortal(menu, document.body)}
    </>
  );
}
