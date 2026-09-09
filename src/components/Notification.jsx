import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  FiBell,
  FiCheckCircle,
  FiAlertTriangle,
  FiInfo,
  FiCheck,
} from "react-icons/fi";

import notificationService from "../services/notificationService.js";
import { useAuth } from "../hooks/useAuth.js";
import { useSocket } from "../hooks/useSocket.js";
import { useBrowserNotifications } from "../hooks/useBrowserNotifications.js";

const ICONS = {
  success: FiCheckCircle,
  warning: FiAlertTriangle,
  info: FiInfo,
};

const TONES = {
  success: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400",
  info: "bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400",
};

/*
 * The socket delivers new notifications the moment they are created;
 * this poll is only the safety net for a dropped connection.
 */
const POLL_MS = 30000;

export default function Notification() {
  const { isAuthenticated } = useAuth();
  const desktop = useBrowserNotifications();
  const { socket } = useSocket();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const wrapperRef = useRef(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const data = await notificationService.list({ limit: 15 });
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      /* A failed poll should stay silent. */
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setItems([]);
      setUnread(0);
      return undefined;
    }

    load();

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);

    /*
     * Coming back to the tab refreshes immediately, so an admin sees a
     * new booking (and a patient sees the admin's decision) without
     * waiting out the poll interval.
     */
    const onWake = () => {
      if (document.visibilityState === "visible") load();
    };

    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [isAuthenticated, load]);

  /*
   * A booking, an approval or a chat message reaches the bell straight
   * away — every role, not just the one whose page is open.
   */
  useEffect(() => {
    if (!socket || !isAuthenticated) return undefined;

    const onPush = (payload) => {
      load();

      /* Also raise it at the OS level, for the times the tab is not
         the one being looked at. No-ops unless the person opted in. */
      desktop.notify({
        title: payload?.title || "HealthCare Pro",
        body: payload?.message || "",
        tag: payload?.link || "hcpro",
        onClick: () => {
          if (payload?.link) navigate(payload.link);
        },
      });
    };

    socket.on("notification:new", onPush);
    return () => socket.off("notification:new", onPush);
  }, [socket, isAuthenticated, load, desktop, navigate]);

  useEffect(() => {
    if (!open) return undefined;

    const onOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const onEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);

    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);

    if (next) {
      setLoading(true);
      await load();
      setLoading(false);
    }
  };

  const openItem = async (item) => {
    setOpen(false);

    if (!item.isRead) {
      try {
        const data = await notificationService.markRead(item.id);
        setUnread(data.unread);
        setItems((current) =>
          current.map((row) => (row.id === item.id ? { ...row, isRead: true } : row))
        );
      } catch {
        /* non-critical */
      }
    }

    if (item.link) navigate(item.link);
  };

  const markAll = async () => {
    try {
      await notificationService.markAllRead();
      setUnread(0);
      setItems((current) => current.map((row) => ({ ...row, isRead: true })));
    } catch {
      /* non-critical */
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={toggle}
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
        }
        aria-expanded={open}
        className="relative w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
      >
        <FiBell size={18} />

        {unread > 0 && (
          <motion.span
            key={unread}
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow"
          >
            {unread > 9 ? "9+" : unread}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 mt-2 w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                  Notifications
                </p>
                <p className="text-[11px] text-slate-400">
                  {unread > 0 ? `${unread} unread` : "You are all caught up"}
                </p>
              </div>

              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAll}
                  className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 inline-flex items-center gap-1"
                >
                  <FiCheck size={13} />
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-[22rem] overflow-y-auto">
              {loading && items.length === 0 ? (
                <div className="p-4 space-y-3">
                  {[0, 1, 2].map((row) => (
                    <div key={row} className="flex gap-3 animate-pulse">
                      <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-slate-700" />
                      <div className="flex-1 space-y-2 py-1">
                        <div className="h-2.5 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
                        <div className="h-2.5 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <div className="w-11 h-11 mx-auto rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
                    <FiBell size={19} />
                  </div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    No notifications yet
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Appointment and report updates will appear here.
                  </p>
                </div>
              ) : (
                items.map((item) => {
                  const Icon = ICONS[item.type] || FiInfo;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openItem(item)}
                      className={`w-full text-left flex gap-3 px-4 py-3 border-b border-slate-50 dark:border-slate-800/60 last:border-0 transition hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                        item.isRead ? "" : "bg-brand-50/40 dark:bg-brand-950/20"
                      }`}
                    >
                      <div
                        className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${
                          TONES[item.type] || TONES.info
                        }`}
                      >
                        <Icon size={16} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {item.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                          {item.message}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          {timeAgo(item.createdAt)}
                        </p>
                      </div>

                      {!item.isRead && (
                        <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0 mt-2" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* SQLite stores UTC without a zone marker; normalise before parsing. */
function timeAgo(value) {
  if (!value) return "";

  const stamp = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const then = new Date(stamp).getTime();

  if (Number.isNaN(then)) return "";

  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return new Date(stamp).toLocaleDateString();
}
