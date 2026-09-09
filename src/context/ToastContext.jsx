import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FiCheckCircle,
  FiAlertTriangle,
  FiInfo,
  FiX,
  FiXCircle,
} from "react-icons/fi";

const ToastContext = createContext(null);

const ICONS = {
  success: FiCheckCircle,
  error: FiXCircle,
  warning: FiAlertTriangle,
  info: FiInfo,
};

const STYLES = {
  success:
    "border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400",
  error:
    "border-red-200 dark:border-red-900/60 bg-white dark:bg-slate-900 text-red-600 dark:text-red-400",
  warning:
    "border-amber-200 dark:border-amber-900/60 bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400",
  info:
    "border-blue-200 dark:border-blue-900/60 bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400",
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message, tone = "info", duration = 4000) => {
      counter.current += 1;
      const id = counter.current;

      setToasts((current) => [...current.slice(-3), { id, message, tone }]);

      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }

      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      toast: push,
      success: (message, duration) => push(message, "success", duration),
      error: (message, duration) => push(message, "error", duration ?? 6000),
      warning: (message, duration) => push(message, "warning", duration),
      info: (message, duration) => push(message, "info", duration),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex flex-col items-stretch sm:items-end gap-2 pointer-events-none"
      >
        <AnimatePresence initial={false}>
          {toasts.map((item) => {
            const Icon = ICONS[item.tone] || FiInfo;

            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, scale: 0.97 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className={`
                  pointer-events-auto
                  w-full sm:w-auto sm:max-w-md sm:min-w-[300px]
                  flex items-start gap-3
                  rounded-2xl border shadow-lg
                  px-4 py-3
                  ${STYLES[item.tone]}
                `}
              >
                <Icon size={18} className="shrink-0 mt-0.5" />

                <p className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                  {item.message}
                </p>

                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  aria-label="Dismiss notification"
                  className="shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-white transition"
                >
                  <FiX size={15} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }

  return context;
}

export default ToastContext;
