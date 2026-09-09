import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  FiCalendar,
  FiClock,
  FiUserCheck,
  FiLayers,
  FiSearch,
  FiPlus,
  FiXCircle,
  FiRefreshCw,
  FiFileText,
} from "react-icons/fi";

import appointmentService, {
  STATUS_LABELS,
  STATUS_STYLES,
  isAwaitingDecision,
} from "../services/appointmentService.js";
import doctorService from "../services/doctorService.js";

import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";
import { useDebouncedValue } from "../hooks/useApi.js";
import { Modal, ConfirmDialog } from "../components/ui/Modal.jsx";
import { EmptyState, ErrorState, Spinner } from "../components/ui/States.jsx";
import { SkeletonList } from "../components/ui/Skeleton.jsx";
import DatePicker from "../components/ui/DatePicker.jsx";
import { VideoCallButton } from "../components/VideoConsultation.jsx";
import { padRefresh } from "../utils/timing.js";

const FILTERS = [
  { key: "upcoming", labelKey: "myAppointments.filter.upcoming", label: "Upcoming" },
  {
    key: "pending",
    labelKey: "myAppointments.filter.pending",
    label: "Pending approval",
  },
  { key: "confirmed", labelKey: "myAppointments.filter.approved", label: "Approved" },
  { key: "rejected", labelKey: "myAppointments.filter.rejected", label: "Rejected" },
  { key: "completed", labelKey: "myAppointments.filter.completed", label: "Completed" },
  { key: "cancelled", labelKey: "myAppointments.filter.cancelled", label: "Cancelled" },
  { key: "all", labelKey: "myAppointments.filter.all", label: "All" },
];

export default function MyAppointments() {
  const navigate = useNavigate();
  const toast = useToast();
  const t = useT();
  const { search: navbarSearch } = useOutletContext() || {};

  const [status, setStatus] = useState("upcoming");
  const [localSearch, setLocalSearch] = useState("");

  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const [rescheduleTarget, setRescheduleTarget] = useState(null);

  const term = useDebouncedValue(localSearch || navbarSearch || "", 350);

  const load = useCallback(async () => {
    const startedAt = Date.now();
    setLoading(true);
    setError(null);

    try {
      const data = await appointmentService.mine({ status, search: term });
      setItems(data.items);
      setStats(data.stats);
    } catch (caught) {
      setError(caught);
    } finally {
      await padRefresh(true, startedAt);
      setLoading(false);
    }
  }, [status, term]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmCancel = async () => {
    setCancelling(true);

    try {
      await appointmentService.cancel(cancelTarget.id);
      toast.success("Appointment cancelled.");
      setCancelTarget(null);
      load();
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setCancelling(false);
    }
  };

  const cards = useMemo(
    () => [
      {
        id: "upcoming",
        label: t("myAppointments.filter.upcoming", "Upcoming"),
        value: stats?.upcoming ?? 0,
        icon: FiCalendar,
        tone: "brand",
      },
      {
        id: "completed",
        label: t("myAppointments.filter.completed", "Completed"),
        value: stats?.completed ?? 0,
        icon: FiUserCheck,
        tone: "emerald",
      },
      {
        id: "cancelled",
        label: t("myAppointments.filter.cancelled", "Cancelled"),
        value: stats?.cancelled ?? 0,
        icon: FiXCircle,
        tone: "red",
      },
      {
        id: "total",
        label: t("myAppointments.stat.total", "Total"),
        value: stats?.total ?? 0,
        icon: FiFileText,
        tone: "slate",
      },
    ],
    [stats, t]
  );

  return (
    <div className="space-y-5">

      {/* ============ HEADER ============ */}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
      >
        <div>
          <p className="text-sm text-slate-400">
            {t("nav.myAppointments", "My Appointments")}
          </p>
          <h1 className="text-2xl font-bold mt-1">
            {t("myAppointments.title", "Your Scheduled Visits")}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            {t(
              "myAppointments.subtitle",
              "Only your own appointments are shown here."
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate("/book-appointment")}
          className="btn-primary text-sm inline-flex items-center justify-center gap-2 shrink-0"
        >
          <FiPlus size={16} />
          {t("nav.bookAppointment", "Book Appointment")}
        </button>
      </motion.div>

      {/* ============ STATS ============ */}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {cards.map((card, index) => (
          <StatTile key={card.id} {...card} delay={index * 0.04} loading={loading && !stats} />
        ))}
      </div>

      {/* ============ CONTROLS ============ */}

      <div className="glass-card">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1 lg:pb-0 [mask-image:linear-gradient(to_right,transparent,black_8px,black_calc(100%-8px),transparent)]">
            {FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setStatus(filter.key)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                  status === filter.key
                    ? "bg-brand-600 text-white shadow-sm"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                {t(filter.labelKey, filter.label)}
              </button>
            ))}
          </div>

          <div className="relative flex-1 lg:max-w-xs lg:ml-auto">
            <FiSearch
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              type="text"
              value={localSearch}
              onChange={(event) => setLocalSearch(event.target.value)}
              placeholder={t(
                "myAppointments.searchPlaceholder",
                "Search doctor, department, reason"
              )}
              aria-label="Search my appointments"
              className="input-field input-icon"
            />
          </div>

          <button
            type="button"
            onClick={load}
            aria-label="Refresh appointments"
            className="btn-secondary text-sm inline-flex items-center justify-center gap-2 shrink-0"
          >
            <FiRefreshCw size={15} className={loading ? "animate-spin" : ""} />
            {t("action.refresh", "Refresh")}
          </button>
        </div>
      </div>

      {/* ============ LIST ============ */}

      <div className="glass-card">
        {loading ? (
          <>
            <p className="text-sm text-slate-400 mb-4">
              {t("myAppointments.loading", "Loading appointments...")}
            </p>
            <SkeletonList count={3} />
          </>
        ) : error ? (
          <ErrorState error={error} onRetry={load} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={FiCalendar}
            title={t("myAppointments.empty.title", "No appointments yet")}
            description={
              status === "upcoming"
                ? t(
                    "myAppointments.empty.upcoming",
                    "You have no upcoming visits. Book one and it will appear here."
                  )
                : t("myAppointments.empty.filtered", "Nothing matches this filter.")
            }
            action={() => navigate("/book-appointment")}
            actionLabel={t("nav.bookAppointment", "Book Appointment")}
          />
        ) : (
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {items.map((item, index) => (
                <AppointmentCard
                  key={item.id}
                  appointment={item}
                  delay={index * 0.04}
                  onCancel={() => setCancelTarget(item)}
                  onReschedule={() => setRescheduleTarget(item)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ============ DIALOGS ============ */}

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onCancel={() => setCancelTarget(null)}
        onConfirm={confirmCancel}
        loading={cancelling}
        title={t("myAppointments.cancel.title", "Cancel appointment")}
        confirmLabel={t("myAppointments.cancel.confirm", "Yes, cancel it")}
        cancelLabel={t("myAppointments.cancel.keep", "Keep appointment")}
        message={
          cancelTarget
            ? t(
                "myAppointments.cancel.message",
                "Cancel your appointment with {doctor} on {date} at {time}? The slot will be released for other patients."
              )
                .replace("{doctor}", cancelTarget.doctorName)
                .replace("{date}", formatDate(cancelTarget.date))
                .replace("{time}", cancelTarget.time)
            : ""
        }
      />

      <RescheduleModal
        appointment={rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        onDone={() => {
          setRescheduleTarget(null);
          load();
        }}
      />
    </div>
  );
}

/* ================================================================== */

const TONES = {
  brand: "bg-brand-100 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400",
  emerald: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
  red: "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400",
  slate: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
};

function StatTile({ icon: Icon, label, value, tone, delay, loading }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25 }}
      className="glass-card"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-400 truncate">{label}</p>
          <p className="text-2xl font-bold mt-1">
            {loading ? (
              <span className="inline-block h-7 w-10 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
            ) : (
              value
            )}
          </p>
        </div>

        <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${TONES[tone]}`}>
          <Icon size={18} />
        </div>
      </div>
    </motion.div>
  );
}

function AppointmentCard({ appointment, onCancel, onReschedule, delay }) {
  const t = useT();

  const canModify = [
    "pending",
    "scheduled",
    "confirmed",
    "rescheduled",
  ].includes(appointment.status);

  const awaiting = isAwaitingDecision(appointment.status);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ delay, duration: 0.25 }}
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 hover:shadow-md transition-shadow"
    >
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="w-12 h-12 shrink-0 rounded-xl bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 flex flex-col items-center justify-center">
          <span className="text-base font-bold leading-none">
            {new Date(`${appointment.date}T00:00:00`).getDate()}
          </span>
          <span className="text-[10px] uppercase mt-0.5">
            {new Date(`${appointment.date}T00:00:00`).toLocaleDateString("en-IN", {
              month: "short",
            })}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold truncate">{appointment.doctorName}</p>
            <span className={`badge ${STATUS_STYLES[appointment.status]}`}>
              {STATUS_LABELS[appointment.status]}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-2">
            <span className="inline-flex items-center gap-1">
              <FiLayers size={12} />
              {appointment.department || appointment.doctorSpecialization}
            </span>
            <span className="inline-flex items-center gap-1">
              <FiCalendar size={12} />
              {formatDate(appointment.date)}
            </span>
            <span className="inline-flex items-center gap-1">
              <FiClock size={12} />
              {appointment.time}
            </span>
          </div>

          {appointment.reason && (
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-2.5 line-clamp-2">
              {appointment.reason}
            </p>
          )}

          {/* Waiting on the hospital, or the note that came with the decision. */}
          {awaiting ? (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2.5 inline-flex items-center gap-1.5">
              <FiClock size={12} />
              {t(
                "myAppointments.awaitingApproval",
                "Waiting for the hospital to approve this request."
              )}
            </p>
          ) : (
            appointment.decisionNote && (
              <div className="mt-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {t("myAppointments.hospitalNote", "Note from the hospital")}
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-200 mt-0.5">
                  {appointment.decisionNote}
                </p>
              </div>
            )
          )}

          <p className="text-[11px] text-slate-400 mt-2">
            {t("myAppointments.reference", "Reference")} APT-{appointment.id}
          </p>

          {/* A patient can join a video visit but never convert one —
              whether a consultation happens remotely is the hospital's
              decision, which the API enforces too. */}
          {canModify && appointment.mode === "video" && (
            <VideoCallButton appointment={appointment} className="mt-3" />
          )}
        </div>

        {canModify && (
          <div className="flex sm:flex-col gap-2 shrink-0">
            <button
              type="button"
              onClick={onReschedule}
              className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/70 transition"
            >
              {t("myAppointments.action.reschedule", "Reschedule")}
            </button>

            <button
              type="button"
              onClick={onCancel}
              className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70 transition"
            >
              {t("action.cancel", "Cancel")}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ================================================================== */

function RescheduleModal({ appointment, onClose, onDone }) {
  const toast = useToast();
  const t = useT();

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState([]);
  const [reason, setReason] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (appointment) {
      setDate(appointment.date);
      setTime("");
      setSlots([]);
      setError("");
    }
  }, [appointment]);

  useEffect(() => {
    if (!appointment || !date) return;

    let active = true;
    setLoadingSlots(true);

    doctorService
      .availability(appointment.doctorId, date)
      .then((data) => {
        if (!active) return;
        setSlots(data.slots || []);
        setReason(data.reason || "");
      })
      .catch((caught) => {
        if (active) setError(caught.message);
      })
      .finally(() => {
        if (active) setLoadingSlots(false);
      });

    return () => {
      active = false;
    };
  }, [appointment, date]);

  const submit = async () => {
    setSaving(true);
    setError("");

    try {
      await appointmentService.reschedule(appointment.id, date, time);
      toast.success("Appointment rescheduled.");
      onDone();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  };

  const minDate = new Date().toISOString().slice(0, 10);

  return (
    <Modal
      open={Boolean(appointment)}
      onClose={onClose}
      title={t("myAppointments.reschedule.title", "Reschedule appointment")}
      description={
        appointment
          ? t("myAppointments.reschedule.with", "With {doctor}").replace(
              "{doctor}",
              appointment.doctorName
            )
          : ""
      }
    >
      {error && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 px-4 py-3 text-sm text-red-700 dark:text-red-300 mb-4"
        >
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="rs-date" className="block text-sm font-medium mb-1.5">
            {t("myAppointments.reschedule.newDate", "New date")}
          </label>
          <DatePicker
            id="rs-date"
            min={minDate}
            value={date}
            onChange={(iso) => {
              setDate(iso);
              setTime("");
            }}
            placeholder={t("myAppointments.reschedule.selectDate", "Select date")}
            ariaLabel="New date"
            className="input-field input-icon w-full"
          />
        </div>

        <div>
          <p className="block text-sm font-medium mb-1.5">
            {t("myAppointments.reschedule.availableTimes", "Available times")}
          </p>

          {loadingSlots ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={index}
                  className="h-10 rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse"
                />
              ))}
            </div>
          ) : slots.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center rounded-xl bg-slate-50 dark:bg-slate-800/60">
              {reason ||
                t(
                  "myAppointments.reschedule.noSlots",
                  "No slots available on this date."
                )}
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-52 overflow-y-auto">
              {slots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setTime(slot)}
                  className={`rounded-xl border py-2 text-sm font-medium transition ${
                    time === slot
                      ? "border-brand-500 bg-brand-600 text-white"
                      : "border-slate-200 dark:border-slate-800 hover:border-brand-400"
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            {t("action.cancel", "Cancel")}
          </button>

          <button
            type="button"
            onClick={submit}
            disabled={!time || saving}
            className="btn-primary flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving && <Spinner size={14} />}
            {saving
              ? t("myAppointments.reschedule.saving", "Saving...")
              : t("myAppointments.reschedule.confirm", "Confirm new time")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function formatDate(value) {
  if (!value) return "";

  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return value;
  }
}
