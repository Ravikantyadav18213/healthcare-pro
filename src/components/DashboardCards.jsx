import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

/* Animated count-up that re-runs whenever the live value changes. */
function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(() => Number(target) || 0);
  const previous = useRef(Number(target) || 0);

  useEffect(() => {
    const from = previous.current;
    const to = Number(target) || 0;

    if (from === to) {
      setValue(to);
      return undefined;
    }

    /*
     * requestAnimationFrame is paused in a background tab and the
     * animation is unwanted with reduced-motion, so in both cases the
     * figure is shown immediately rather than being stuck at zero.
     */
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    )?.matches;

    if (reduceMotion || document.hidden) {
      previous.current = to;
      setValue(to);
      return undefined;
    }

    let start = null;
    let frame;

    const step = (timestamp) => {
      if (!start) start = timestamp;

      const progress = Math.min((timestamp - start) / duration, 1);
      /* Ease-out so the number settles rather than stopping abruptly. */
      const eased = 1 - (1 - progress) ** 3;

      setValue(Math.round(from + (to - from) * eased));

      if (progress < 1) {
        frame = requestAnimationFrame(step);
      } else {
        previous.current = to;
      }
    };

    frame = requestAnimationFrame(step);

    /* If the tab is hidden mid-animation, snap to the final value. */
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        previous.current = to;
        setValue(to);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [target, duration]);

  return value;
}

function Card({ icon: Icon, label, value, prefix = "", suffix = "", gradient, delay, onClick, subtitle }) {
  const count = useCountUp(value);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      whileHover={onClick ? { y: -3 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      className={`glass-card text-left w-full flex items-center justify-between gap-3 ${
        onClick
          ? "cursor-pointer transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          : ""
      }`}
    >
      <div className="min-w-0">
        <p className="text-[11px] sm:text-xs uppercase tracking-wide text-slate-400 font-medium leading-tight break-words">
          {label}
        </p>

        <p className="text-xl sm:text-2xl font-bold mt-1 tabular-nums">
          {prefix}
          {count.toLocaleString("en-IN")}
          {suffix}
        </p>

        {subtitle && (
          <p className="text-[11px] text-slate-400 mt-0.5 truncate">{subtitle}</p>
        )}
      </div>

      <div
        className={`w-10 h-10 sm:w-11 sm:h-11 shrink-0 rounded-xl flex items-center justify-center text-white bg-gradient-to-br ${gradient}`}
      >
        <Icon size={19} />
      </div>
    </motion.button>
  );
}

export default function DashboardCards({ cards }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
      {cards.map((card, index) => (
        <Card key={card.label} {...card} delay={index * 0.045} />
      ))}
    </div>
  );
}
