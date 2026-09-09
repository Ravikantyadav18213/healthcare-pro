import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiUsers,
  FiCalendar,
  FiClock,
  FiCheckCircle,
  FiMessageSquare,
  FiActivity,
  FiArrowRight,
} from "react-icons/fi";

import doctorPortalService from "../services/doctorPortalService.js";
import { useAuth } from "../hooks/useAuth.js";
import { useT } from "../context/LanguageContext.jsx";
import DashboardCards from "../components/DashboardCards.jsx";
import { SkeletonCards, SkeletonList } from "../components/ui/Skeleton.jsx";
import { EmptyState, ErrorState } from "../components/ui/States.jsx";

const STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  scheduled: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  confirmed: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  rescheduled: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  no_show: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export default function DoctorDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const t = useT();

  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [today, setToday] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileData, statsData, todayData] = await Promise.all([
        doctorPortalService.profile(),
        doctorPortalService.stats(),
        doctorPortalService.appointmentsToday(),
      ]);
      setProfile(profileData.doctor);
      setStats(statsData.stats);
      setToday(todayData.items);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const cards = stats
    ? [
        {
          label: t("doctorDashboard.myPatients", "My Patients"),
          value: stats.myPatients,
          icon: FiUsers,
          gradient: "from-blue-500 to-blue-700",
        },
        {
          label: t("doctorDashboard.todayAppointments", "Today's Appointments"),
          value: stats.todayAppointments,
          icon: FiCalendar,
          gradient: "from-emerald-500 to-emerald-700",
        },
        {
          label: t("doctorDashboard.upcoming", "Upcoming"),
          value: stats.upcomingAppointments,
          icon: FiClock,
          gradient: "from-amber-500 to-amber-700",
        },
        {
          label: t("doctorDashboard.pending", "Pending"),
          value: stats.pendingAppointments,
          icon: FiActivity,
          gradient: "from-orange-500 to-orange-700",
        },
        {
          label: t("doctorDashboard.completedVisits", "Completed Visits"),
          value: stats.completedVisits,
          icon: FiCheckCircle,
          gradient: "from-teal-500 to-teal-700",
        },
        {
          label: t("doctorDashboard.unreadMessages", "Unread Messages"),
          value: stats.unreadMessages,
          icon: FiMessageSquare,
          gradient: "from-purple-500 to-purple-700",
        },
      ]
    : [];

  if (error) {
    return (
      <div className="glass-card">
        <ErrorState error={error} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ============ HEADER ============ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-5"
      >
        <div className="w-16 h-16 shrink-0 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white flex items-center justify-center text-xl font-bold">
          {(profile?.name || user?.name || "D").charAt(0).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold truncate">
            {t("doctorDashboard.welcome", "Welcome")},{" "}
            {loading ? "..." : profile?.name || user?.name}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {loading
              ? t("doctorDashboard.loadingProfile", "Loading your profile...")
              : `${profile?.specialization || "—"}${
                  profile?.department ? ` · ${profile.department}` : ""
                }`}
          </p>
        </div>

        {!loading && profile?.availability && (
          <span
            className={`badge shrink-0 ${
              profile.availability === "Available"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {profile.availability}
          </span>
        )}
      </motion.div>

      {/* ============ STAT CARDS ============ */}
      {loading ? <SkeletonCards count={6} /> : <DashboardCards cards={cards} />}

      {/* ============ TODAY'S APPOINTMENTS ============ */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="glass p-5 sm:p-6"
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-bold text-lg">
            {t("doctorDashboard.todayAppointments", "Today's Appointments")}
          </h2>
          <button
            type="button"
            onClick={() => navigate("/doctor/appointments")}
            className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 inline-flex items-center gap-1"
          >
            {t("doctorDashboard.viewAll", "View all")}
            <FiArrowRight size={13} />
          </button>
        </div>

        {loading ? (
          <SkeletonList count={3} />
        ) : today.length === 0 ? (
          <EmptyState
            icon={FiCalendar}
            title={t("doctorDashboard.noAppointmentsToday", "No appointments today")}
            description={t(
              "doctorDashboard.noAppointmentsTodayDesc",
              "Your schedule for today is clear."
            )}
            compact
          />
        ) : (
          <div className="space-y-2.5">
            {today.map((appt, index) => (
              <motion.div
                key={appt.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.22, delay: Math.min(index * 0.04, 0.2) }}
                className="flex items-center gap-4 rounded-2xl border border-slate-100 dark:border-slate-800 p-3.5"
              >
                <div className="w-16 shrink-0 text-center">
                  <p className="font-bold text-sm text-brand-600 dark:text-brand-400">
                    {appt.time}
                  </p>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{appt.patientName}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {appt.department || "—"}
                    {appt.reason ? ` · ${appt.reason}` : ""}
                  </p>
                </div>

                <span
                  className={`badge shrink-0 capitalize ${
                    STATUS_STYLES[appt.status] || STATUS_STYLES.pending
                  }`}
                >
                  {appt.status.replace("_", " ")}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
