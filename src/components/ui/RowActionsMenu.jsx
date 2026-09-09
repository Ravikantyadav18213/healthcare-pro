import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { FiMoreVertical } from "react-icons/fi";

/* ==================================================================
   ROW ACTIONS MENU

   Replaces a row of loose icon buttons (View / Edit / Delete / ...)
   with a single kebab trigger and a dropdown list — the same pattern
   used everywhere else an admin table crams several actions into one
   narrow cell.

   Rendered through a portal into <body>, exactly like Modal.jsx and
   for the same reason: every one of these tables sits inside an
   `overflow-x-auto` (sometimes also `overflow-hidden`) wrapper, and a
   `position: fixed` menu is only relative to the viewport while no
   ancestor establishes a containing block — an animated `motion.div`
   row does. Escaping to <body> sidesteps both the clipping and the
   containing-block trap in one move. Shares the z-[50] "dropdowns"
   slot already reserved in Modal.jsx's stacking comment.

   items: [{ key, label, icon, onClick, tone, disabled, hidden }]
     tone: "default" | "danger" | "success" | "warning"
================================================================== */

const TONE_CLASSES = {
  default: "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800",
  danger: "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30",
  success: "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30",
  warning: "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30",
};

const ITEM_HEIGHT = 36;
const MENU_PADDING = 8;
const MENU_WIDTH = 224;
const VIEWPORT_MARGIN = 8;

export default function RowActionsMenu({ items, label = "Row actions" }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);

  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const visibleItems = (items || []).filter((item) => !item.hidden);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuHeight = visibleItems.length * ITEM_HEIGHT + MENU_PADDING * 2;

    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < menuHeight + VIEWPORT_MARGIN && rect.top > menuHeight;

    const top = openUpward
      ? Math.max(VIEWPORT_MARGIN, rect.top - menuHeight - 4)
      : rect.bottom + 4;

    /* Right-align to the trigger by default; clamp so the menu never
       runs off either edge of a narrow viewport. */
    let left = rect.right - MENU_WIDTH;
    left = Math.min(left, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN);
    left = Math.max(left, VIEWPORT_MARGIN);

    setCoords({ top, left });
  }, [visibleItems.length]);

  const close = useCallback(() => setOpen(false), []);

  const toggle = () => {
    if (!open) place();
    setOpen((current) => !current);
  };

  /* Close on outside click, Escape, or the ancestor table scrolling —
     continuously re-tracking position through an arbitrary scroll
     container is not worth the complexity for a 2-4 item menu. */
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

    const onViewportChange = () => close();

    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);

    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [open, close]);

  if (visibleItems.length === 0) return null;

  /*
   * No exit animation on purpose. AnimatePresence's exit relies on a
   * completion callback to actually remove the node from the DOM once
   * the animation finishes — with dozens of these menus on one page
   * (one per table row), each running its own independent
   * AnimatePresence instance, that callback reliably stopped firing
   * and left an invisible (opacity: 0) copy of the menu sitting at
   * its last position forever, still eating clicks meant for whatever
   * was underneath it. Plain conditional rendering removes the node
   * the instant `open` goes false — no lifecycle to get stuck in.
   * The open animation (which has no such lifecycle dependency) is
   * unaffected.
   */
  const menu = open && coords && (
    <motion.div
      ref={menuRef}
      role="menu"
      aria-label={label}
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.12 }}
      style={{ position: "fixed", top: coords.top, left: coords.left, width: MENU_WIDTH }}
      className="z-[50] rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 shadow-lg py-1 overflow-hidden"
    >
      {visibleItems.map((item) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            close();
            item.onClick?.();
          }}
          className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent ${
            TONE_CLASSES[item.tone] || TONE_CLASSES.default
          }`}
        >
          {item.icon && <item.icon size={14} className="shrink-0" />}
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </motion.div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition"
      >
        <FiMoreVertical size={16} />
      </button>

      {menu && typeof document !== "undefined" && createPortal(menu, document.body)}
    </>
  );
}
