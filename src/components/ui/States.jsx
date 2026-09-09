import React from "react";
import { motion } from "framer-motion";
import { FiAlertTriangle, FiRefreshCw, FiWifiOff, FiLock } from "react-icons/fi";
import Logo from "../Logo.jsx";

/* ==================================================================
   EMPTY STATE
================================================================== */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  actionLabel,
  compact = false,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-10 px-5" : "py-16 px-6"
      }`}
    >
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-brand-50 dark:bg-brand-950/40 text-brand-500 dark:text-brand-400 flex items-center justify-center mb-4">
          <Icon size={28} />
        </div>
      )}

      <h3 className="font-semibold text-slate-800 dark:text-slate-100">
        {title}
      </h3>

      {description && (
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-sm">
          {description}
        </p>
      )}

      {action && actionLabel && (
        <button type="button" onClick={action} className="btn-primary text-sm mt-6">
          {actionLabel}
        </button>
      )}
    </motion.div>
  );
}

/* ==================================================================
   ERROR STATE
================================================================== */

export function ErrorState({ error, onRetry, compact = false }) {
  const isNetwork = error?.isNetwork || error?.status === 0;
  const isForbidden = error?.status === 403;

  const Icon = isNetwork ? FiWifiOff : isForbidden ? FiLock : FiAlertTriangle;

  const title = isNetwork
    ? "Cannot reach the server"
    : isForbidden
    ? "Access denied"
    : "Something went wrong";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      role="alert"
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-8 px-4" : "py-14 px-6"
      }`}
    >
      <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-500 dark:text-red-400 flex items-center justify-center mb-4">
        <Icon size={25} />
      </div>

      <h3 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h3>

      <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-md">
        {error?.message || "Please try again in a moment."}
      </p>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn-secondary text-sm mt-6 inline-flex items-center gap-2"
        >
          <FiRefreshCw size={15} />
          Try again
        </button>
      )}
    </motion.div>
  );
}

/* ==================================================================
   INLINE ALERT
================================================================== */

const TONES = {
  error:
    "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300",
  success:
    "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300",
  warning:
    "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60 text-amber-700 dark:text-amber-300",
  info:
    "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-blue-300",
};

export function Alert({ tone = "error", children, className = "" }) {
  if (!children) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm ${TONES[tone]} ${className}`}
    >
      {children}
    </motion.div>
  );
}

/* Full-page spinner used while the session is being restored. */
export function PageLoader({ label = "Loading..." }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-950">
      <Logo className="w-12 h-12 animate-pulse" />
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

/* Small inline spinner for buttons. */
export function Spinner({ size = 16, className = "" }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={`inline-block rounded-full border-2 border-current border-r-transparent animate-spin ${className}`}
    />
  );
}
