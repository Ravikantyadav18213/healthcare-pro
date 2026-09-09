import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiCalendar,
  FiFileText,
  FiUser,
  FiActivity,
  FiArrowRight,
  FiClock,
  FiCheckCircle,
  FiPlusCircle,
  FiUserCheck,
  FiMail,
  FiShield,
  FiBell,
  FiLayers,
} from "react-icons/fi";

import appointmentService, {
  STATUS_LABELS,
  STATUS_STYLES,
} from "../services/appointmentService.js";
import reportService from "../services/reportService.js";
import notificationService from "../services/notificationService.js";

import { useAuth } from "../hooks/useAuth.js";
import { useT } from "../context/LanguageContext.jsx";
import { EmptyState, ErrorState } from "../components/ui/States.jsx";
import { SkeletonCards, SkeletonList, Skeleton } from "../components/ui/Skeleton.jsx";

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0 },
};

export default function UserDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const t = useT();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      /* One parallel burst so the dashboard paints in a single pass. */
      const [appointments, reports, notifications, next] = await Promise.all([
        appointmentService.mine({ status: "all", limit: 50 }),
        reportService.mine(),
        notificationService.list({ limit: 5 }),
        appointmentService.next(),
      ]);

      setData({
        appointments: appointments.items,
        appointmentStats: appointments.stats,
        reports: reports.reports,
        reportStats: reports.stats,
        notifications: notifications.items,
        unread: notifications.unread,
        next: next.appointment,
      });
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="glass-card">
        <ErrorState error={error} onRetry={load} />
      </div>
    );
  }

  const firstName = (user?.name || "there").split(" ")[0];

  return (
    <motion.div
      initial="hidden"
      animate="show"
      transition={{ staggerChildren: 0.06 }}
      className="space-y-5"
    >

      {/* ============ WELCOME ============ */}

      <motion.section
        variants={fadeUp}
        transition={{ duration: 0.32 }}
        className="glass p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
      >
        <div className="min-w-0">
          <p className="text-sm text-slate-400">
            {t("userDashboard.eyebrow", "Patient portal")}
          </p>
          <h1 className="text-2xl font-bold mt-1 truncate">
            {t("userDashboard.welcome", "Welcome, {name} 👋").replace(
              "{name}",
              firstName
            )}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            {data?.next
              ? t("userDashboard.nextVisit", "Your next visit is {date} at {time}.")
                  .replace("{date}", formatDate(data.next.date))
                  .replace("{time}", data.next.time)
              : t(
                  "userDashboard.noUpcoming",
                  "You have no upcoming appointments booked."
                )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => navigate("/book-appointment")}
            className="btn-primary text-sm inline-flex items-center gap-2"
          >
            <FiPlusCircle size={16} />
            {t("nav.bookAppointment", "Book Appointment")}
          </button>

          <button
            type="button"
            onClick={() => navigate("/my-reports")}
            className="btn-secondary text-sm inline-flex items-center gap-2"
          >
            <FiFileText size={16} />
            {t("nav.myReports", "My Reports")}
          </button>
        </div>
      </motion.section>

      {/* ============ STATS ============ */}

      {loading ? (
        <SkeletonCards count={4} />
      ) : (
        <motion.div
          variants={fadeUp}
          transition={{ duration: 0.32 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
        >
          <StatCard
            icon={FiClock}
            label={t("userDashboard.stat.upcoming", "Upcoming")}
            value={data.appointmentStats.upcoming}
            hint={
              data.next
                ? formatShort(data.next.date)
                : t("userDashboard.stat.nothingScheduled", "Nothing scheduled")
            }
            onClick={() => navigate("/my-appointments")}
            delay={0}
          />
          <StatCard
            icon={FiCalendar}
            label={t("userDashboard.stat.totalAppointments", "Total Appointments")}
            value={data.appointmentStats.total}
            hint={t("userDashboard.stat.allTime", "All time")}
            onClick={() => navigate("/my-appointments")}
            delay={0.05}
          />
          <StatCard
            icon={FiActivity}
            label={t("userDashboard.stat.completedVisits", "Completed Visits")}
            value={data.appointmentStats.completed}
            hint={t(
              "userDashboard.stat.consultationsAttended",
              "Consultations attended"
            )}
            onClick={() => navigate("/my-appointments")}
            delay={0.1}
          />
          <StatCard
            icon={FiFileText}
            label={t("userDashboard.stat.availableReports", "Available Reports")}
            value={data.reportStats.total}
            hint={t("userDashboard.stat.pendingCount", "{count} pending").replace(
              "{count}",
              data.reportStats.pending
            )}
            onClick={() => navigate("/my-reports")}
            delay={0.15}
          />
        </motion.div>
      )}

      {/* ============ NEXT APPOINTMENT ============ */}

      {!loading && data.next && (
        <motion.section
          variants={fadeUp}
          transition={{ duration: 0.32 }}
          className="rounded-2xl border border-brand-200 dark:border-brand-900/60 bg-gradient-to-br from-brand-50 to-white dark:from-brand-950/40 dark:to-slate-900 p-5 sm:p-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="w-16 h-16 shrink-0 rounded-2xl bg-brand-600 text-white flex flex-col items-center justify-center shadow-lg">
              <span className="text-xl font-bold leading-none">
                {new Date(`${data.next.date}T00:00:00`).getDate()}
              </span>
              <span className="text-[10px] uppercase mt-0.5">
                {new Date(`${data.next.date}T00:00:00`).toLocaleDateString("en-IN", {
                  month: "short",
                })}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
                {t("userDashboard.nextAppointment", "Next appointment")}
              </p>

              <h2 className="text-lg font-bold mt-1 truncate">
                {data.next.doctorName}
              </h2>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-2">
                <span className="inline-flex items-center gap-1">
                  <FiLayers size={12} />
                  {data.next.department || data.next.doctorSpecialization}
                </span>
                <span className="inline-flex items-center gap-1">
                  <FiClock size={12} />
                  {data.next.time}
                </span>
                <span className={`badge ${STATUS_STYLES[data.next.status]}`}>
                  {STATUS_LABELS[data.next.status]}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate("/my-appointments")}
              className="btn-secondary text-sm shrink-0"
            >
              {t("userDashboard.manage", "Manage")}
            </button>
          </div>
        </motion.section>
      )}

      {/* ============ REPORTS + APPOINTMENTS ============ */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.section variants={fadeUp} transition={{ duration: 0.32 }} className="glass-card">
          <PanelHeader
            title={t("userDashboard.recentReports", "Recent Reports")}
            subtitle={t(
              "userDashboard.recentReportsSubtitle",
              "Your latest results and summaries"
            )}
            onView={() => navigate("/my-reports")}
          />

          {loading ? (
            <SkeletonList count={3} />
          ) : data.reports.length === 0 ? (
            <EmptyState
              icon={FiFileText}
              title={t("userDashboard.noReports.title", "No reports available")}
              description={t(
                "userDashboard.noReports.description",
                "Results published by the hospital will show up here."
              )}
              compact
            />
          ) : (
            <div className="space-y-3">
              {data.reports.slice(0, 3).map((report) => (
                <div
                  key={report.id}
                  className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${
                        report.status === "Completed"
                          ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                          : "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {report.status === "Completed" ? (
                        <FiCheckCircle size={16} />
                      ) : (
                        <FiClock size={16} />
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{report.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {formatDate(report.reportDate)} · {report.type}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`badge shrink-0 ${
                      report.status === "Completed"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                    }`}
                  >
                    {report.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.section>

        <motion.section variants={fadeUp} transition={{ duration: 0.32 }} className="glass-card">
          <PanelHeader
            title={t("nav.myAppointments", "My Appointments")}
            subtitle={t(
              "userDashboard.recentAppointmentsSubtitle",
              "Most recent bookings"
            )}
            onView={() => navigate("/my-appointments")}
          />

          {loading ? (
            <SkeletonList count={3} />
          ) : data.appointments.length === 0 ? (
            <EmptyState
              icon={FiCalendar}
              title={t("userDashboard.noAppointments.title", "No appointments yet")}
              description={t(
                "userDashboard.noAppointments.description",
                "Book your first consultation to get started."
              )}
              action={() => navigate("/book-appointment")}
              actionLabel={t("nav.bookAppointment", "Book Appointment")}
              compact
            />
          ) : (
            <div className="space-y-3">
              {data.appointments.slice(0, 3).map((appointment) => (
                <div
                  key={appointment.id}
                  className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {appointment.doctorName}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {appointment.department} · {formatShort(appointment.date)} ·{" "}
                      {appointment.time}
                    </p>
                  </div>

                  <span className={`badge shrink-0 ${STATUS_STYLES[appointment.status]}`}>
                    {STATUS_LABELS[appointment.status]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.section>
      </div>

      {/* ============ PROFILE + NOTIFICATIONS ============ */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.section variants={fadeUp} transition={{ duration: 0.32 }} className="glass-card">
          <h2 className="text-lg font-bold mb-1">
            {t("userDashboard.profileSummary", "Profile Summary")}
          </h2>
          <p className="text-xs text-slate-400 mb-5">
            {t("userDashboard.profileSummarySubtitle", "Your account details")}
          </p>

          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center font-bold text-lg">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </div>

            <div className="min-w-0">
              <p className="font-bold truncate">{user?.name}</p>
              <p className="text-xs text-slate-400 truncate flex items-center gap-1 mt-0.5">
                <FiMail size={11} />
                {user?.email}
              </p>
            </div>
          </div>

          <div className="space-y-2.5 text-sm">
            <InfoRow
              icon={FiShield}
              label={t("userDashboard.accountStatus", "Account status")}
              value={
                user?.status === "inactive"
                  ? t("userDashboard.status.inactive", "Inactive")
                  : t("userDashboard.status.active", "Active")
              }
            />
            <InfoRow
              icon={FiUserCheck}
              label={t("userDashboard.role", "Role")}
              value={
                user?.role === "admin"
                  ? t("userDashboard.role.administrator", "Administrator")
                  : t("label.patient", "Patient")
              }
            />
            <InfoRow
              icon={FiClock}
              label={t("userDashboard.lastSignIn", "Last sign-in")}
              value={
                user?.lastLogin ? new Date(user.lastLogin).toLocaleString() : "—"
              }
            />
          </div>

          <button
            type="button"
            onClick={() => navigate("/profile")}
            className="btn-secondary text-sm mt-5 w-full inline-flex items-center justify-center gap-2"
          >
            <FiUser size={15} />
            {t("userDashboard.updateProfile", "Update Profile")}
          </button>
        </motion.section>

        <motion.section variants={fadeUp} transition={{ duration: 0.32 }} className="glass-card">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-bold">
              {t("userDashboard.notifications", "Notifications")}
            </h2>
            {!loading && data.unread > 0 && (
              <span className="badge bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {t("userDashboard.unreadCount", "{count} unread").replace(
                  "{count}",
                  data.unread
                )}
              </span>
            )}
          </div>

          <p className="text-xs text-slate-400 mb-5">
            {t("userDashboard.notificationsSubtitle", "Recent account activity")}
          </p>

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : data.notifications.length === 0 ? (
            <EmptyState
              icon={FiBell}
              title={t("userDashboard.noNotifications.title", "Nothing new")}
              description={t(
                "userDashboard.noNotifications.description",
                "Booking and report updates will appear here."
              )}
              compact
            />
          ) : (
            <ul className="space-y-3">
              {data.notifications.map((item) => (
                <li
                  key={item.id}
                  className={`rounded-xl p-3.5 border ${
                    item.isRead
                      ? "border-slate-100 dark:border-slate-800"
                      : "border-brand-200 dark:border-brand-900/60 bg-brand-50/50 dark:bg-brand-950/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{item.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                        {item.message}
                      </p>
                    </div>

                    {!item.isRead && (
                      <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0 mt-1.5" />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </motion.section>
      </div>

      {/* ============ QUICK ACTIONS ============ */}

      <motion.div
        variants={fadeUp}
        transition={{ duration: 0.32 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
      >
        <QuickAction
          icon={FiPlusCircle}
          title={t("nav.bookAppointment", "Book Appointment")}
          description={t(
            "userDashboard.quick.bookDescription",
            "Choose a doctor and time"
          )}
          onClick={() => navigate("/book-appointment")}
        />
        <QuickAction
          icon={FiFileText}
          title={t("userDashboard.quick.viewReports", "View Reports")}
          description={t(
            "userDashboard.quick.viewReportsDescription",
            "Download your results"
          )}
          onClick={() => navigate("/my-reports")}
        />
        <QuickAction
          icon={FiCalendar}
          title={t("nav.myAppointments", "My Appointments")}
          description={t(
            "userDashboard.quick.appointmentsDescription",
            "Reschedule or cancel"
          )}
          onClick={() => navigate("/my-appointments")}
        />
        <QuickAction
          icon={FiUserCheck}
          title={t("nav.findDoctor", "Find a Doctor")}
          description={t(
            "userDashboard.quick.findDoctorDescription",
            "Browse specialists"
          )}
          onClick={() => navigate("/find-doctors")}
        />
      </motion.div>
    </motion.div>
  );
}

/* ================================================================== */

function PanelHeader({ title, subtitle, onView }) {
  const t = useT();

  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
      </div>

      <button
        type="button"
        onClick={onView}
        className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 inline-flex items-center gap-1 shrink-0"
      >
        {t("userDashboard.viewAll", "View All")}
        <FiArrowRight size={13} />
      </button>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint, onClick, delay }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.28 }}
      className="glass-card text-left group hover:-translate-y-1 hover:shadow-lg transition-all duration-200"
    >
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 flex items-center justify-center">
          <Icon size={18} />
        </div>

        <FiArrowRight
          size={15}
          className="text-slate-300 group-hover:text-brand-600 group-hover:translate-x-1 transition"
        />
      </div>

      <p className="text-xs text-slate-400 mt-4 truncate">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      <p className="text-[11px] text-slate-400 mt-1 truncate">{hint}</p>
    </motion.button>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-slate-500 dark:text-slate-400 inline-flex items-center gap-2 text-xs">
        <Icon size={13} />
        {label}
      </span>
      <span className="font-medium text-sm text-right truncate">{value}</span>
    </div>
  );
}

function QuickAction({ icon: Icon, title, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-card text-left group hover:-translate-y-1 hover:shadow-lg transition-all duration-200"
    >
      <div className="w-11 h-11 rounded-xl bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-300 flex items-center justify-center">
        <Icon size={20} />
      </div>

      <h3 className="font-semibold text-sm mt-4">{title}</h3>
      <p className="text-xs text-slate-400 mt-1">{description}</p>
    </button>
  );
}

function formatDate(value) {
  if (!value) return "—";

  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
  } catch {
    return value;
  }
}

function formatShort(value) {
  if (!value) return "—";

  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return value;
  }
}
