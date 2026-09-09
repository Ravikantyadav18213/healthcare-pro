import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiUsers,
  FiUserCheck,
  FiCalendar,
  FiActivity,
  FiDollarSign,
  FiPackage,
  FiAlertTriangle,
  FiArrowRight,
  FiRefreshCw,
  FiSearch,
} from "react-icons/fi";

import DashboardCards from "../components/DashboardCards.jsx";
import CalendarWidget from "../components/Calendar.jsx";
import {
  RevenueLineChart,
  DepartmentPieChart,
  AppointmentsBarChart,
  StatusDoughnutChart,
  DoctorUtilisationChart,
} from "../components/Statistics.jsx";

import adminService from "../services/adminService.js";
import { STATUS_LABELS, STATUS_STYLES } from "../services/appointmentService.js";
import { EmptyState, ErrorState, Alert } from "../components/ui/States.jsx";
import { SkeletonCards, Skeleton } from "../components/ui/Skeleton.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { useSocket } from "../hooks/useSocket.js";
import { useAuth } from "../hooks/useAuth.js";
import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";
import { padRefresh } from "../utils/timing.js";

/*
 * Every figure below comes from GET /api/stats/dashboard. Each card
 * opens the screen that actually owns the number it shows — so a
 * figure is never just a dead label — except ICU Beds Free, which
 * has no dedicated screen anywhere in the app; that one opens an
 * inline editor instead (see the Modal further down).
 */
/* SQLite's datetime('now') has no timezone marker — treat it as UTC,
   same convention used everywhere else in the app (see Admin.jsx). */
function parseStamp(value) {
  if (!value) return null;
  const stamp = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(stamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = parseStamp(value);
  if (!date) return value || "—";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const DISCHARGE_PERIODS = [
  { key: "all", labelKey: "dashboard.discharged.period.all", label: "All Time", days: null },
  { key: "day", labelKey: "dashboard.discharged.period.day", label: "Last Day", days: 1 },
  { key: "week", labelKey: "dashboard.discharged.period.week", label: "Last Week", days: 7 },
  { key: "month", labelKey: "dashboard.discharged.period.month", label: "Last Month", days: 30 },
  { key: "year", labelKey: "dashboard.discharged.period.year", label: "Last Year", days: 365 },
];

function buildCards(overview, { t, onNavigate, onEditIcu, onOpenDischarged }) {
  return [
    {
      icon: FiUsers,
      label: t("dashboard.card.totalPatients", "Total Patients"),
      value: overview.totalPatients,
      gradient: "from-brand-500 to-brand-700",
      onClick: () => onNavigate("/patients"),
    },
    {
      icon: FiUserCheck,
      label: t("dashboard.card.totalDoctors", "Total Doctors"),
      value: overview.totalDoctors,
      gradient: "from-emerald-400 to-emerald-600",
      onClick: () => onNavigate("/doctors"),
    },
    {
      icon: FiCalendar,
      label: t("dashboard.card.appointmentsToday", "Appointments Today"),
      value: overview.appointmentsToday,
      gradient: "from-amber-400 to-amber-600",
      onClick: () => onNavigate("/appointments"),
    },
    {
      icon: FiActivity,
      label: t("dashboard.card.icuBedsFree", "ICU Beds Free"),
      value: overview.icuBedsFree,
      gradient: "from-red-400 to-red-600",
      onClick: onEditIcu,
    },
    {
      icon: FiDollarSign,
      label: t("dashboard.card.revenueToday", "Revenue Today"),
      value: overview.revenueToday,
      prefix: "₹",
      gradient: "from-purple-400 to-purple-600",
      onClick: () => onNavigate("/billing"),
    },
    {
      icon: FiPackage,
      label: t("dashboard.card.pharmacyStock", "Pharmacy Stock"),
      value: overview.pharmacyStock,
      gradient: "from-sky-400 to-sky-600",
      onClick: () => onNavigate("/pharmacy"),
    },
    {
      icon: FiAlertTriangle,
      label: t("dashboard.card.emergencyCases", "Emergency Cases"),
      value: overview.emergencyCases,
      gradient: "from-rose-400 to-rose-600",
      onClick: () => onNavigate("/emergency"),
    },
    {
      icon: FiUsers,
      label: t("dashboard.card.dischargedToday", "Discharged Today"),
      /* Counts discharges from BOTH the Patients and Emergency
         screens (see statsService.js). The card opens the searchable
         detail list below rather than /patients, since that page
         doesn't show Emergency discharges or the discharge reason. */
      value: overview.dischargedToday,
      gradient: "from-teal-400 to-teal-600",
      onClick: onOpenDischarged,
      subtitle: `${(overview.dischargedTotal ?? 0).toLocaleString("en-IN")} ${t(
        "dashboard.card.allTime",
        "all-time"
      )}`,
    },
  ];
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { socket } = useSocket();
  const { isAuthenticated } = useAuth();
  const toast = useToast();
  const t = useT();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    const startedAt = Date.now();
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError(null);

    try {
      setData(await adminService.dashboard());
    } catch (caught) {
      setError(caught);
    } finally {
      await padRefresh(isRefresh, startedAt);
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  /* ---------------- ICU bed editor ----------------
     The only stat card with no dedicated page to open — total and
     occupied are edited here directly instead. */

  const [icuOpen, setIcuOpen] = useState(false);
  const [icuTotal, setIcuTotal] = useState("0");
  const [icuOccupied, setIcuOccupied] = useState("0");
  const [icuError, setIcuError] = useState("");
  const [icuSaving, setIcuSaving] = useState(false);

  const openIcuEditor = useCallback(() => {
    setIcuTotal(String(data?.overview?.icuBedsTotal ?? 0));
    setIcuOccupied(String(data?.overview?.icuBedsOccupied ?? 0));
    setIcuError("");
    setIcuOpen(true);
  }, [data]);

  const submitIcu = async (event) => {
    event.preventDefault();
    setIcuError("");

    const total = Number(icuTotal);
    const occupied = Number(icuOccupied);

    if (!Number.isFinite(total) || !Number.isFinite(occupied) || total < 0 || occupied < 0) {
      setIcuError("Enter non-negative numbers for both fields.");
      return;
    }
    if (occupied > total) {
      setIcuError("Occupied beds cannot exceed total beds.");
      return;
    }

    setIcuSaving(true);
    try {
      await adminService.setIcuStatus(total, occupied);
      toast.success("ICU capacity updated.");
      setIcuOpen(false);
      /* The server also pushes dashboard:stats-changed to every admin
         (including this one), but refreshing directly here means the
         number updates instantly instead of waiting on that round
         trip back through the socket. */
      load(true);
    } catch (caught) {
      setIcuError(caught?.message || "Could not update ICU capacity.");
    } finally {
      setIcuSaving(false);
    }
  };

  /* ---------------- Discharged patients — detail list ----------------
     Opened from the "Discharged Today" card: every discharge from
     either workflow (Emergency + Patients), searchable by name,
     phone, condition/department or doctor. Fetched once per open and
     filtered client-side — the list is small enough that a round trip
     per keystroke would only add latency. */

  const [dischargedOpen, setDischargedOpen] = useState(false);
  const [dischargedItems, setDischargedItems] = useState([]);
  const [dischargedLoading, setDischargedLoading] = useState(false);
  const [dischargedError, setDischargedError] = useState(null);
  const [dischargedSearch, setDischargedSearch] = useState("");
  const [dischargedPeriod, setDischargedPeriod] = useState("all");

  const openDischargedList = useCallback(async () => {
    setDischargedOpen(true);
    setDischargedSearch("");
    setDischargedPeriod("all");
    setDischargedLoading(true);
    setDischargedError(null);

    try {
      const { items } = await adminService.dischargedList();
      setDischargedItems(items);
    } catch (caught) {
      setDischargedError(caught);
    } finally {
      setDischargedLoading(false);
    }
  }, []);

  const visibleDischarged = useMemo(() => {
    const term = dischargedSearch.trim().toLowerCase();
    const period = DISCHARGE_PERIODS.find((option) => option.key === dischargedPeriod);
    const cutoff =
      period?.days != null ? Date.now() - period.days * 24 * 60 * 60 * 1000 : null;

    return dischargedItems.filter((item) => {
      if (cutoff != null) {
        const when = parseStamp(item.discharged_at);
        if (!when || when.getTime() < cutoff) return false;
      }

      if (!term) return true;

      return [item.name, item.phone, item.problem, item.doctor_name, item.source]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(term));
    });
  }, [dischargedItems, dischargedSearch, dischargedPeriod]);

  useEffect(() => {
    load();
  }, [load]);

  /*
   * Every action that moves a number on this page — registering a
   * patient or doctor, booking/cancelling/completing an appointment,
   * marking an invoice paid, adjusting pharmacy stock, or changing an
   * Emergency case's status — pushes "dashboard:stats-changed" to
   * every signed-in admin the moment it happens (see the emitToAdmins
   * calls across server/services/*.js). This page just refetches on
   * that signal, so it updates itself immediately instead of waiting
   * for a manual Refresh — whether the change came from another page
   * in this same tab or from someone else's browser entirely.
   */
  useEffect(() => {
    if (!socket || !isAuthenticated) return undefined;

    const onStatsChanged = () => load(true);

    socket.on("dashboard:stats-changed", onStatsChanged);
    return () => socket.off("dashboard:stats-changed", onStatsChanged);
  }, [socket, isAuthenticated, load]);

  /*
   * Belt-and-suspenders for the socket push above: a tab that was
   * disconnected (laptop asleep, wifi drop) while a case changed
   * elsewhere would miss that one push. Refetching whenever the tab
   * becomes visible again catches anything a dropped connection
   * missed, without requiring a manual Refresh click.
   */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  if (error) {
    return (
      <div className="glass-card">
        <ErrorState error={error} onRetry={() => load()} />
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">

      {/* ============ WELCOME ============ */}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32 }}
        className="glass p-5 sm:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
      >
        <div>
          <h1 className="text-xl font-bold">
            {t("dashboard.welcome", "Welcome back, Dr. Admin 👋")}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {t(
              "dashboard.welcomeSubtitle",
              "Here's what's happening across the hospital today."
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => load(true)}
            className="btn-secondary text-sm inline-flex items-center gap-2"
          >
            <FiRefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            {t("action.refresh", "Refresh")}
          </button>

          <button
            type="button"
            onClick={() => navigate("/appointments")}
            className="btn-primary text-sm inline-flex items-center gap-2"
          >
            <FiCalendar size={16} />
            {t("nav.appointments", "Appointments")}
            <FiArrowRight size={15} />
          </button>

          <button
            type="button"
            onClick={() => navigate("/emergency")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 font-semibold text-sm hover:bg-red-100 dark:hover:bg-red-950/50 hover:shadow-md transition-all"
          >
            <FiAlertTriangle size={16} />
            {t("nav.emergency", "Emergency")}
            <FiArrowRight size={15} />
          </button>
        </div>
      </motion.div>

      {/* ============ CARDS ============ */}

      {loading ? (
        <SkeletonCards count={8} />
      ) : (
        <DashboardCards
          cards={buildCards(data.overview, {
            t,
            onNavigate: navigate,
            onEditIcu: openIcuEditor,
            onOpenDischarged: openDischargedList,
          })}
        />
      )}

      {/* ============ REVENUE + CALENDAR ============ */}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card lg:col-span-2">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-semibold text-sm">
              {t("dashboard.revenueLast7Days", "Revenue — Last 7 Days")}
            </h2>
            <button
              type="button"
              onClick={() => navigate("/reports")}
              className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 font-semibold shrink-0"
            >
              {t("dashboard.viewReports", "View Reports")} →
            </button>
          </div>

          {loading ? (
            <Skeleton className="h-[260px] rounded-xl" />
          ) : (
            <RevenueLineChart
              labels={data.revenueTrend.labels}
              values={data.revenueTrend.values}
            />
          )}
        </div>

        {loading ? (
          <Skeleton className="h-[320px] rounded-2xl" />
        ) : (
          <CalendarWidget markedDates={data.markedDates} />
        )}
      </div>

      {/* ============ CHARTS ============ */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card">
          <h2 className="font-semibold text-sm mb-3">
            {t("dashboard.patientsByDepartment", "Patients by Department")}
          </h2>
          {loading ? (
            <Skeleton className="h-[260px] rounded-xl" />
          ) : data.patientsByDepartment.labels.length === 0 ? (
            <EmptyState
              icon={FiUsers}
              title={t("dashboard.empty.noPatientData", "No patient data yet")}
              compact
            />
          ) : (
            <DepartmentPieChart
              labels={data.patientsByDepartment.labels}
              values={data.patientsByDepartment.values}
            />
          )}
        </div>

        <div className="glass-card">
          <h2 className="font-semibold text-sm mb-3">
            {t("dashboard.appointmentsLast7Days", "Appointments — Last 7 Days")}
          </h2>
          {loading ? (
            <Skeleton className="h-[260px] rounded-xl" />
          ) : (
            <AppointmentsBarChart
              labels={data.appointmentsByDay.labels}
              values={data.appointmentsByDay.values}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card">
          <h2 className="font-semibold text-sm mb-3">
            {t("dashboard.appointmentStatus", "Appointment Status")}
          </h2>
          {loading ? (
            <Skeleton className="h-[260px] rounded-xl" />
          ) : data.appointmentStatus.labels.length === 0 ? (
            <EmptyState
              icon={FiCalendar}
              title={t("dashboard.empty.noAppointments", "No appointments yet")}
              compact
            />
          ) : (
            <StatusDoughnutChart
              labels={data.appointmentStatus.labels}
              values={data.appointmentStatus.values}
            />
          )}
        </div>

        <div className="glass-card">
          <h2 className="font-semibold text-sm mb-3">
            {t("dashboard.doctorUtilisation", "Doctor Utilisation — Last 30 Days")}
          </h2>
          {loading ? (
            <Skeleton className="h-[260px] rounded-xl" />
          ) : (
            <DoctorUtilisationChart
              labels={data.doctorUtilisation.labels}
              values={data.doctorUtilisation.values}
            />
          )}
        </div>
      </div>

      {/* ============ RECENT ACTIVITY ============ */}

      <div className="glass-card">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-semibold text-sm">
            {t("dashboard.recentActivity", "Recent Activity")}
          </h2>
          <button
            type="button"
            onClick={() => navigate("/appointments")}
            className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 font-semibold shrink-0"
          >
            {t("dashboard.viewAll", "View All")} →
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((row) => (
              <Skeleton key={row} className="h-12 rounded-xl" />
            ))}
          </div>
        ) : data.recentActivity.length === 0 ? (
          <EmptyState
            icon={FiCalendar}
            title={t("dashboard.empty.recentTitle", "No recent bookings")}
            description={t(
              "dashboard.empty.recentDescription",
              "New appointments will appear here as patients book them."
            )}
            compact
          />
        ) : (
          <ul className="space-y-3 text-sm">
            {data.recentActivity.map((item) => (
              <li
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100/60 dark:border-slate-800/60 pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {item.patient} booked with {item.doctor}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {t("dashboard.reference", "Reference")} APT-{item.id}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className={`badge ${STATUS_STYLES[item.status]}`}>
                    {STATUS_LABELS[item.status]}
                  </span>
                  <span className="text-xs text-slate-400 whitespace-nowrap">
                    {item.date} · {item.time}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ============ QUICK ACTIONS ============ */}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <QuickAction
          title={t("nav.patients", "Patients")}
          description={t("dashboard.quick.patients", "Manage patient records")}
          icon={FiUsers}
          onClick={() => navigate("/patients")}
        />
        <QuickAction
          title={t("nav.doctors", "Doctors")}
          description={t("dashboard.quick.doctors", "Add and edit doctors")}
          icon={FiUserCheck}
          onClick={() => navigate("/doctors")}
        />
        <QuickAction
          title={t("nav.appointments", "Appointments")}
          description={t("dashboard.quick.appointments", "Confirm and reschedule")}
          icon={FiCalendar}
          onClick={() => navigate("/appointments")}
        />
        <QuickAction
          title={t("nav.emergency", "Emergency")}
          description={t("dashboard.quick.emergency", "Live emergency cases")}
          icon={FiAlertTriangle}
          onClick={() => navigate("/emergency")}
        />
      </div>

      {/* ============ ICU CAPACITY ============ */}

      <Modal
        open={icuOpen}
        onClose={() => !icuSaving && setIcuOpen(false)}
        title={t("dashboard.icu.title", "ICU Capacity")}
        description={t(
          "dashboard.icu.description",
          "Free beds are calculated as Total minus Occupied."
        )}
        size="sm"
      >
        <form onSubmit={submitIcu} className="space-y-4" noValidate>
          <div>
            <label htmlFor="icu-total" className="block text-sm font-medium mb-1.5">
              {t("dashboard.icu.totalBeds", "Total ICU beds")}
            </label>
            <input
              id="icu-total"
              type="number"
              min="0"
              inputMode="numeric"
              value={icuTotal}
              onChange={(event) => setIcuTotal(event.target.value)}
              className="input-field"
              required
            />
          </div>

          <div>
            <label htmlFor="icu-occupied" className="block text-sm font-medium mb-1.5">
              {t("dashboard.icu.currentlyOccupied", "Currently occupied")}
            </label>
            <input
              id="icu-occupied"
              type="number"
              min="0"
              inputMode="numeric"
              value={icuOccupied}
              onChange={(event) => setIcuOccupied(event.target.value)}
              className="input-field"
              required
            />
          </div>

          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("dashboard.icu.freeBedsPreview", "Free beds will show as")}{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {Math.max(0, (Number(icuTotal) || 0) - (Number(icuOccupied) || 0))}
            </span>
            .
          </p>

          {icuError && <Alert tone="error">{icuError}</Alert>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setIcuOpen(false)}
              disabled={icuSaving}
              className="btn-secondary flex-1 disabled:opacity-60"
            >
              {t("action.cancel", "Cancel")}
            </button>
            <button
              type="submit"
              disabled={icuSaving}
              className="btn-primary flex-1 disabled:opacity-60"
            >
              {icuSaving ? t("action.saving", "Saving...") : t("action.save", "Save")}
            </button>
          </div>
        </form>
      </Modal>

      {/* ============ DISCHARGED PATIENTS ============ */}

      <Modal
        open={dischargedOpen}
        onClose={() => setDischargedOpen(false)}
        title={t("dashboard.discharged.title", "Discharged Patients")}
        description={t(
          "dashboard.discharged.description",
          "Every discharge from the Patients and Emergency screens, searchable by name, phone, condition or doctor."
        )}
        size="lg"
      >
        <div className="space-y-4">
          <div className="relative">
            <FiSearch
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={dischargedSearch}
              onChange={(event) => setDischargedSearch(event.target.value)}
              placeholder={t(
                "dashboard.discharged.searchPlaceholder",
                "Search by name, phone, condition or doctor..."
              )}
              className="input-field pl-10"
              autoFocus
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {DISCHARGE_PERIODS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setDischargedPeriod(option.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                  dischargedPeriod === option.key
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                {t(option.labelKey, option.label)}
              </button>
            ))}
          </div>

          {dischargedLoading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((row) => (
                <Skeleton key={row} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : dischargedError ? (
            <ErrorState error={dischargedError} onRetry={openDischargedList} compact />
          ) : visibleDischarged.length === 0 ? (
            <EmptyState
              icon={FiUsers}
              title={
                dischargedItems.length === 0
                  ? t("dashboard.discharged.empty.title", "No discharges yet")
                  : t("dashboard.discharged.empty.noMatches", "No matches")
              }
              description={
                dischargedItems.length === 0
                  ? t(
                      "dashboard.discharged.empty.description",
                      "Discharged patients will appear here."
                    )
                  : t(
                      "dashboard.discharged.empty.noMatchesDescription",
                      "Try a wider time range or a different name, phone number, condition or doctor."
                    )
              }
              compact
            />
          ) : (
            <ul className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-1">
              {visibleDischarged.map((item) => (
                <li
                  key={`${item.source}-${item.id}`}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-slate-100 dark:border-slate-800 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm truncate">{item.name}</p>
                      <span
                        className={`badge text-[10px] ${
                          item.source === "Emergency"
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                            : "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300"
                        }`}
                      >
                        {item.source}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 truncate">
                      {item.problem ||
                        t("dashboard.discharged.noCondition", "No condition recorded")}
                      {item.doctor_name ? ` · ${item.doctor_name}` : ""}
                      {item.phone ? ` · ${item.phone}` : ""}
                    </p>
                  </div>

                  <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
                    {formatDate(item.discharged_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </div>
  );
}

function QuickAction({ title, description, icon: Icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-card text-left group cursor-pointer hover:-translate-y-1 hover:shadow-lg transition-all duration-200"
    >
      <div className="flex items-center justify-between">
        <div className="w-11 h-11 rounded-xl bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-300 flex items-center justify-center">
          <Icon size={20} />
        </div>

        <FiArrowRight
          size={16}
          className="text-slate-300 group-hover:text-brand-600 group-hover:translate-x-1 transition-all"
        />
      </div>

      <h3 className="font-semibold text-sm mt-4">{title}</h3>
      <p className="text-xs text-slate-400 mt-1">{description}</p>
    </button>
  );
}
