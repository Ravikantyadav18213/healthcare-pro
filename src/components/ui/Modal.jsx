import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FiX, FiAlertTriangle } from "react-icons/fi";

import { Spinner } from "./States.jsx";

/* ==================================================================
   ACCESSIBLE MODAL

   Closes on Escape, traps focus inside the panel, restores focus to
   the trigger, and locks background scroll while open.

   Rendered through a portal into <body>. `position: fixed` is only
   relative to the viewport while no ancestor establishes a containing
   block — and a transform, a filter or a backdrop-filter all do. The
   sidebar and the navbar are both `glass` (backdrop-blur), so a
   dialog opened from either was being trapped inside that element and
   squeezed to its width.

   Stacking order, now that everything sits on <body>:

     30  sidebar          70  (was the modal)
     40  navbar           80  phone drawer overlay
     50  dropdowns        85  phone drawer panel
                          90  this modal
                         100  toasts

   The modal has to clear the phone drawer — a sign-out opened from
   the drawer was rendering behind it — while staying under the toasts
   that report what a dialog's action did.
================================================================== */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}) {
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);

  /*
   * Callers pass onClose as an inline arrow function, so its identity
   * changes on every render of the parent (e.g. each keystroke in a
   * form field updates state and re-renders the page). Keeping it out
   * of the effect's dependency array — via a ref instead — stops the
   * focus-trap effect below from tearing down and re-running on every
   * keystroke, which was yanking focus back to the first field.
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement;

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    const timer = setTimeout(() => {
      const target = panelRef.current?.querySelector(
        'input, select, textarea, button:not([data-close])'
      );
      target?.focus();
    }, 60);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = overflow;
      clearTimeout(timer);
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  const widths = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  };

  const overlay = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-0 sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose?.();
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={`
              w-full ${widths[size]}
              max-h-[92vh] overflow-y-auto
              rounded-t-3xl sm:rounded-3xl
              bg-white dark:bg-slate-900
              border border-slate-200 dark:border-slate-800
              shadow-2xl
            `}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-6 py-4">
              <div className="min-w-0">
                <h2 className="font-bold text-lg text-slate-800 dark:text-slate-100 truncate">
                  {title}
                </h2>
                {description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {description}
                  </p>
                )}
              </div>

              <button
                type="button"
                data-close
                onClick={onClose}
                aria-label="Close dialog"
                className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white transition"
              >
                <FiX size={18} />
              </button>
            </div>

            <div className="px-6 py-5">{children}</div>

            {footer && (
              <div className="sticky bottom-0 border-t border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-6 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return overlay;

  return createPortal(overlay, document.body);
}

/* ==================================================================
   CONFIRMATION DIALOG

   Used for every destructive action so nothing is deleted on a
   single stray click.
================================================================== */

export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  loading = false,
}) {
  const confirmClass =
    tone === "danger"
      ? "bg-red-600 hover:bg-red-700 text-white"
      : "bg-brand-600 hover:bg-brand-700 text-white";

  return (
    <Modal open={open} onClose={loading ? () => {} : onCancel} title={title} size="sm">
      <div className="flex gap-4">
        <div
          className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center ${
            tone === "danger"
              ? "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400"
              : "bg-brand-100 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400"
          }`}
        >
          <FiAlertTriangle size={20} />
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 leading-6 pt-1">
          {message}
        </p>
      </div>

      <div className="flex flex-col-reverse sm:flex-row gap-3 mt-7">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="btn-secondary flex-1 disabled:opacity-60"
        >
          {cancelLabel}
        </button>

        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 font-semibold text-sm shadow-md transition disabled:opacity-60 ${confirmClass}`}
        >
          {loading && <Spinner size={14} />}
          {loading ? "Working..." : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export default Modal;
