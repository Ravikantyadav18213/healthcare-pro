import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiCalendar,
  FiUser,
  FiCheckCircle,
  FiFileText,
  FiEye,
  FiVideo,
} from "react-icons/fi";

import doctorPortalService from "../services/doctorPortalService.js";
import { useDebouncedValue } from "../hooks/useApi.js";
import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";
import { EmptyState, ErrorState, Spinner } from "../components/ui/States.jsx";
import { SkeletonTable } from "../components/ui/Skeleton.jsx";
import RowActionsMenu from "../components/ui/RowActionsMenu.jsx";
import SelectDropdown from "../components/ui/SelectDropdown.jsx";
import VideoConsultation from "../components/VideoConsultation.jsx";
import { videoService } from "../services/clinicalService.js";

const SCOPES = [
  { key: "upcoming", labelKey: "doctorAppointments.scope.upcoming", label: "All Upcoming" },
  { key: "today", labelKey: "doctorAppointments.scope.today", label: "Today" },
  { key: "tomorrow", labelKey: "doctorAppointments.scope.tomorrow", label: "Tomorrow" },
  { key: "week", labelKey: "doctorAppointments.scope.week", label: "This Week" },
];

const COLUMNS = [
  { key: "label.patient", label: "Patient" },
  { key: "label.date", label: "Date" },
  { key: "label.time", label: "Time" },
  { key: "label.department", label: "Department" },
  { key: "doctorAppointments.col.reason", label: "Reason" },
  { key: "label.status", label: "Status" },
  { key: "doctorAppointments.col.actions", label: "Actions" },
];

const STATUSES = [
  "all",
  "pending",
  "scheduled",
  "confirmed",
  "completed",
  "cancelled",
  "rescheduled",
  "no_show",
];

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

export default function DoctorAppointments() {
  const navigate = useNavigate();
  const toast = useToast();
  const t = useT();
  const { search: navbarSearch } = useOutletContext() || {};

  const [localSearch, setLocalSearch] = useState("");
  const [scope, setScope] = useState("upcoming");
  const [status, setStatus] = useState("all");

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [completingId, setCompletingId] = useState(null);

  /* The appointment whose call panel is open, if any. */
  const [videoFor, setVideoFor] = useState(null);

  const term = useDebouncedValue(localSearch || navbarSearch || "", 350);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await doctorPortalService.appointments({ scope, status, search: term });
      setItems(data.items);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [scope, status, term]);

  useEffect(() => {
    load();
  }, [load]);

  const markCompleted = async (appointment) => {
    setCompletingId(appointment.id);
    try {
      await doctorPortalService.completeAppointment(appointment.id);
      toast.success(`Marked ${appointment.patientName}'s visit as completed.`);
      load();
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setCompletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass p-5 flex flex-col gap-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">
              {t("doctorAppointments.title", "My Appointments")}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {t("doctorAppointments.subtitle", "Appointments booked with you.")}
            </p>
          </div>

          <input
            type="text"
            value={localSearch}
            onChange={(event) => setLocalSearch(event.target.value)}
            placeholder={t("doctorAppointments.searchPlaceholder", "Search patient or reason")}
            aria-label="Search appointments"
            className="input-field w-full sm:w-64"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {SCOPES.map(({ key, labelKey, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setScope(key)}
              className={`badge transition ${
                scope === key
                  ? "bg-brand-600 text-white"
                  : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
              }`}
            >
              {t(labelKey, label)}
            </button>
          ))}

          <SelectDropdown
            value={status}
            onChange={setStatus}
            options={STATUSES.map((value) => ({
              value,
              label:
                value === "all"
                  ? t("doctorAppointments.allStatuses", "All statuses")
                  : value.replace("_", " "),
            }))}
            ariaLabel="Filter by status"
            className="w-auto ml-auto text-xs py-1.5"
          />
        </div>
      </motion.div>

      {loading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : error ? (
        <div className="glass-card">
          <ErrorState error={error} onRetry={load} />
        </div>
      ) : items.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={FiCalendar}
            title={t("doctorAppointments.emptyTitle", "No appointments found")}
            description={t(
              "doctorAppointments.emptyDesc",
              "Try a different filter or search term."
            )}
          />
        </div>
      ) : (
        <>
          <div className="glass overflow-hidden hidden lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b border-slate-200/60 dark:border-slate-700/60">
                  <tr>
                    {COLUMNS.map(({ key, label }) => (
                      <th
                        key={key}
                        className="text-left px-4 py-3 text-xs uppercase tracking-wide text-slate-400 font-semibold"
                      >
                        {t(key, label)}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {items.map((appt) => (
                    <tr
                      key={appt.id}
                      className="border-b border-slate-100/60 dark:border-slate-800/60 hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => navigate(`/doctor/patients/${appt.patientId}`)}
                          disabled={!appt.patientId}
                          className="font-medium hover:text-brand-600 transition text-left disabled:cursor-not-allowed disabled:hover:text-inherit"
                        >
                          {appt.patientName}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {appt.date}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {appt.time}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {appt.department || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 max-w-[220px] truncate">
                        {appt.reason || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`badge capitalize ${
                            STATUS_STYLES[appt.status] || STATUS_STYLES.pending
                          }`}
                        >
                          {appt.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <RowActionsMenu
                          label={`Actions for ${appt.patientName}`}
                          items={[
                            {
                              key: "view",
                              label: t("doctorAppointments.viewPatient", "View patient"),
                              icon: FiEye,
                              onClick: () => navigate(`/doctor/patients/${appt.patientId}`),
                              disabled: !appt.patientId,
                            },
                            {
                              key: "notes",
                              label: t("doctorAppointments.addNotes", "Add notes"),
                              icon: FiFileText,
                              onClick: () =>
                                navigate(`/doctor/patients/${appt.patientId}`, {
                                  state: { tab: "notes" },
                                }),
                              disabled: !appt.patientId,
                            },
                            {
                              key: "video",
                              label:
                                appt.mode === "video"
                                  ? t("doctorAppointments.joinVideoCall", "Join video call")
                                  : t(
                                      "doctorAppointments.makeVideoConsultation",
                                      "Make video consultation"
                                    ),
                              icon: FiVideo,
                              onClick: () => setVideoFor(appt),
                              hidden:
                                appt.status === "completed" || appt.status === "cancelled",
                            },
                            {
                              key: "complete",
                              label: t("doctorAppointments.markCompleted", "Mark completed"),
                              icon: completingId === appt.id ? Spinner : FiCheckCircle,
                              tone: "success",
                              onClick: () => markCompleted(appt),
                              disabled: completingId === appt.id,
                              hidden: appt.status === "completed" || appt.status === "cancelled",
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-3">
            {items.map((appt, index) => (
              <motion.div
                key={appt.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.03, 0.25), duration: 0.24 }}
                className="glass-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate flex items-center gap-1.5">
                      <FiUser size={13} className="text-slate-400 shrink-0" />
                      {appt.patientName}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {appt.date} · {appt.time}
                    </p>
                  </div>
                  <span
                    className={`badge shrink-0 capitalize ${
                      STATUS_STYLES[appt.status] || STATUS_STYLES.pending
                    }`}
                  >
                    {appt.status.replace("_", " ")}
                  </span>
                </div>

                {appt.reason && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    {appt.reason}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => navigate(`/doctor/patients/${appt.patientId}`)}
                    disabled={!appt.patientId}
                    className="flex-1 min-w-[110px] px-3 py-2 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 disabled:opacity-40"
                  >
                    {t("doctorAppointments.viewPatient", "View patient")}
                  </button>

                  {appt.status !== "completed" && appt.status !== "cancelled" && (
                    <button
                      type="button"
                      onClick={() => setVideoFor(appt)}
                      className="flex-1 min-w-[110px] px-3 py-2 rounded-lg text-xs font-medium bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300"
                    >
                      {appt.mode === "video"
                        ? t("doctorAppointments.joinVideoCall", "Join video call")
                        : t(
                            "doctorAppointments.makeVideoConsultation",
                            "Make video consultation"
                          )}
                    </button>
                  )}

                  {appt.status !== "completed" && appt.status !== "cancelled" && (
                    <button
                      type="button"
                      onClick={() => markCompleted(appt)}
                      disabled={completingId === appt.id}
                      className="flex-1 min-w-[110px] px-3 py-2 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300 disabled:opacity-50"
                    >
                      {completingId === appt.id
                        ? t("doctorAppointments.saving", "Saving...")
                        : t("doctorAppointments.markCompleted", "Mark completed")}
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {/* Opening the panel on an in-person appointment converts it
          first — the doctor picked "Make video consultation", so the
          intent is unambiguous. */}
      {videoFor && (
        <VideoLauncher
          appointment={videoFor}
          onClose={() => setVideoFor(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function VideoLauncher({ appointment, onClose, onChanged }) {
  const t = useT();
  const [ready, setReady] = useState(appointment.mode === "video");
  const [error, setError] = useState("");

  useEffect(() => {
    if (ready) return;

    let cancelled = false;

    videoService
      .setMode(appointment.id, "video")
      .then(() => {
        if (cancelled) return;
        setReady(true);
        onChanged?.();
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(caught.message || "Could not start a video consultation.");
      });

    return () => {
      cancelled = true;
    };
  }, [appointment.id, ready, onChanged]);

  if (error) {
    return (
      <div className="fixed inset-0 z-[90] bg-slate-900/80 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white dark:bg-slate-900 rounded-2xl p-5">
          <h3 className="font-semibold mb-2">
            {t("doctorAppointments.cannotStartCall", "Cannot start the call")}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">{error}</p>
          <button type="button" onClick={onClose} className="btn-primary text-sm mt-4 w-full">
            {t("action.close", "Close")}
          </button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="fixed inset-0 z-[90] bg-slate-900/80 flex items-center justify-center">
        <Spinner size={22} />
      </div>
    );
  }

  return <VideoConsultation appointmentId={appointment.id} onClose={onClose} />;
}
