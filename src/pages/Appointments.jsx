import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiCalendar,
  FiSearch,
  FiRefreshCw,
  FiCheckCircle,
  FiXCircle,
  FiClock,
  FiSlash,
  FiUserX,
  FiEye,
  FiUsers,
  FiTrash2,
} from "react-icons/fi";

import appointmentService, {
  STATUS_LABELS,
  STATUS_STYLES,
  isAwaitingDecision,
} from "../services/appointmentService.js";
import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";
import { useDebouncedValue } from "../hooks/useApi.js";
import { Modal, ConfirmDialog } from "../components/ui/Modal.jsx";
import { EmptyState, ErrorState, Spinner } from "../components/ui/States.jsx";
import { SkeletonTable } from "../components/ui/Skeleton.jsx";
import RowActionsMenu from "../components/ui/RowActionsMenu.jsx";
import SelectDropdown from "../components/ui/SelectDropdown.jsx";
import { padRefresh } from "../utils/timing.js";

const SCOPES = [
  { key: "", tKey: "appointments.scope.all", label: "All" },
  { key: "today", tKey: "appointments.scope.today", label: "Today" },
  { key: "upcoming", tKey: "appointments.scope.upcoming", label: "Upcoming" },
  { key: "past", tKey: "appointments.scope.past", label: "Past" },
];

const STATUS_OPTIONS = [
  "all",
  "pending",
  "confirmed",
  "rejected",
  "completed",
  "cancelled",
  "rescheduled",
  "no_show",
];

export default function Appointments() {
  const { search: navbarSearch } = useOutletContext() || {};
  const toast = useToast();
  const t = useT();

  /* Status wording is UI copy, not data — the API only ever sends the
     raw key, so it is translated at the point of display. */
  const statusLabel = useCallback(
    (key) => t(`appointments.status.${camel(key)}`, STATUS_LABELS[key] || key),
    [t]
  );

  const STATUS_FILTER_OPTIONS = useMemo(
    () =>
      STATUS_OPTIONS.map((item) => ({
        value: item,
        label:
          item === "all"
            ? t("appointments.allStatuses", "All statuses")
            : statusLabel(item),
      })),
    [t, statusLabel]
  );

  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [scope, setScope] = useState("");
  const [status, setStatus] = useState("all");
  const [localSearch, setLocalSearch] = useState("");

  const [detail, setDetail] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [working, setWorking] = useState(false);

  /* Optional message sent to the patient with the decision. */
  const [decisionNote, setDecisionNote] = useState("");

  const term = useDebouncedValue(localSearch || navbarSearch || "", 350);

  const load = useCallback(
    async (isRefresh = false) => {
      const startedAt = Date.now();
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      setError(null);

      try {
        const data = await appointmentService.all({ scope, status, search: term });
        setItems(data.items);
        setStats(data.stats);
      } catch (caught) {
        setError(caught);
      } finally {
        await padRefresh(isRefresh, startedAt);
        setLoading(false);
        setRefreshing(false);
      }
    },
    [scope, status, term]
  );

  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = async (appointment, next, note = "") => {
    setWorking(true);

    try {
      await appointmentService.setStatus(appointment.id, next, note);
      toast.success(
        `${appointment.patientName} marked ${STATUS_LABELS[
          next
        ].toLowerCase()} — the patient has been notified.`
      );
      setDetail(null);
      setDecisionNote("");
      load(true);
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setWorking(false);
    }
  };

  const confirmCancel = async () => {
    setWorking(true);

    try {
      await appointmentService.setStatus(cancelTarget.id, "cancelled");
      toast.success("Appointment cancelled — the patient has been notified.");
      setCancelTarget(null);
      load(true);
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setWorking(false);
    }
  };

  const confirmDelete = async () => {
    setWorking(true);

    try {
      await appointmentService.remove(deleteTarget.id);
      toast.success("Appointment record deleted — the patient has been notified.");
      setDeleteTarget(null);
      setDetail(null);
      load(true);
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-5">

      {/* ============ HEADER ============ */}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass p-5 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4"
      >
        <div>
          <h1 className="text-xl font-bold">
            {t("appointments.title", "Appointments")}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t(
              "appointments.subtitle",
              "Every booking made across the hospital."
            )}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={localSearch}
              onChange={(event) => setLocalSearch(event.target.value)}
              placeholder={t(
                "appointments.searchPlaceholder",
                "Search patient, doctor, reason"
              )}
              aria-label="Search appointments"
              className="input-field input-icon w-full sm:w-64"
            />
          </div>

          <SelectDropdown
            value={status}
            onChange={setStatus}
            options={STATUS_FILTER_OPTIONS}
            ariaLabel="Filter by status"
            className="w-full sm:w-40"
          />

          <button
            type="button"
            onClick={() => load(true)}
            aria-label="Refresh appointments"
            className="btn-secondary text-sm inline-flex items-center justify-center gap-2"
          >
            <FiRefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </motion.div>

      {/* ============ STATS ============ */}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <MiniStat
          icon={FiCalendar}
          label={t("appointments.stat.today", "Today")}
          value={stats?.today}
          tone="brand"
          loading={loading}
        />
        <MiniStat
          icon={FiClock}
          label={t("appointments.stat.upcoming", "Upcoming")}
          value={stats?.upcoming}
          tone="blue"
          loading={loading}
        />
        <MiniStat
          icon={FiCheckCircle}
          label={t("appointments.stat.completed", "Completed")}
          value={stats?.completed}
          tone="emerald"
          loading={loading}
        />
        <MiniStat
          icon={FiXCircle}
          label={t("appointments.stat.cancelled", "Cancelled")}
          value={stats?.cancelled}
          tone="red"
          loading={loading}
        />
        <MiniStat
          icon={FiUsers}
          label={t("appointments.stat.pendingApproval", "Pending approval")}
          value={stats?.pending}
          tone="amber"
          loading={loading}
        />
      </div>

      {/* ============ SCOPE TABS ============ */}

      <div className="glass-card">
        <div className="flex gap-1.5 overflow-x-auto pb-1 [mask-image:linear-gradient(to_right,transparent,black_8px,black_calc(100%-8px),transparent)]">
          {SCOPES.map((item) => (
            <button
              key={item.key || "all"}
              type="button"
              onClick={() => setScope(item.key)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                scope === item.key
                  ? "bg-brand-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {t(item.tKey, item.label)}
            </button>
          ))}
        </div>
      </div>

      {/* ============ TABLE ============ */}

      {loading ? (
        <SkeletonTable rows={6} cols={7} />
      ) : error ? (
        <div className="glass-card">
          <ErrorState error={error} onRetry={() => load()} />
        </div>
      ) : items.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={FiCalendar}
            title={t("appointments.empty.title", "No appointments found")}
            description={t(
              "appointments.empty.description",
              "Nothing matches the current filters."
            )}
          />
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="glass overflow-hidden hidden lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b border-slate-200/60 dark:border-slate-700/60">
                  <tr>
                    {[
                      t("label.patient", "Patient"),
                      t("label.doctor", "Doctor"),
                      t("label.department", "Department"),
                      t("label.date", "Date"),
                      t("label.time", "Time"),
                      t("label.status", "Status"),
                      t("appointments.col.actions", "Actions"),
                    ].map(
                      (heading) => (
                        <th
                          key={heading}
                          className="text-left px-4 py-3 text-xs uppercase tracking-wide text-slate-400 font-semibold"
                        >
                          {heading}
                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody>
                  {items.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-slate-100/60 dark:border-slate-800/60 hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium truncate">{row.patientName}</p>
                        <p className="text-xs text-slate-400 truncate">{row.patientEmail}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {row.doctorName}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {row.department || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDate(row.date)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {row.time}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${STATUS_STYLES[row.status]}`}>
                          {statusLabel(row.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <RowActions
                          appointment={row}
                          onView={() => setDetail(row)}
                          onStatus={changeStatus}
                          onCancel={() => setCancelTarget(row)}
                          onDelete={() => setDeleteTarget(row)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile */}
          <div className="lg:hidden space-y-3">
            {items.map((row, index) => (
              <motion.div
                key={row.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.03, 0.25), duration: 0.24 }}
                className="glass-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{row.patientName}</p>
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {row.doctorName} · {row.department}
                    </p>
                  </div>

                  <span className={`badge shrink-0 ${STATUS_STYLES[row.status]}`}>
                    {statusLabel(row.status)}
                  </span>
                </div>

                <div className="flex items-center gap-4 mt-3 text-xs text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <FiCalendar size={12} />
                    {formatDate(row.date)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <FiClock size={12} />
                    {row.time}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setDetail(row)}
                  className="btn-secondary text-xs w-full mt-3 inline-flex items-center justify-center gap-1.5"
                >
                  <FiEye size={13} />
                  {t("appointments.manage", "Manage")}
                </button>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {/* ============ DETAIL ============ */}

      <Modal
        open={Boolean(detail)}
        onClose={() => {
          setDetail(null);
          setDecisionNote("");
        }}
        title={
          detail
            ? `${t("appointments.modal.title", "Appointment")} APT-${detail.id}`
            : ""
        }
        description={
          detail ? `${detail.patientName} · ${detail.doctorName}` : ""
        }
      >
        {detail && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <Detail
                label={t("label.patient", "Patient")}
                value={detail.patientName}
              />
              <Detail
                label={t("label.email", "Email")}
                value={detail.patientEmail}
              />
              <Detail
                label={t("label.doctor", "Doctor")}
                value={detail.doctorName}
              />
              <Detail
                label={t("label.department", "Department")}
                value={detail.department}
              />
              <Detail
                label={t("label.date", "Date")}
                value={formatDate(detail.date)}
              />
              <Detail label={t("label.time", "Time")} value={detail.time} />
              <Detail
                label={t("appointments.detail.fee", "Fee")}
                value={`₹${Number(detail.consultationFee || 0).toLocaleString("en-IN")}`}
              />
              <Detail
                label={t("label.status", "Status")}
                value={statusLabel(detail.status)}
              />
            </div>

            {detail.reason && (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                  {t("appointments.reasonForVisit", "Reason for visit")}
                </p>
                <p className="text-sm">{detail.reason}</p>
              </div>
            )}

            {detail.notes && (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                  {t("appointments.patientNotes", "Patient notes")}
                </p>
                <p className="text-sm">{detail.notes}</p>
              </div>
            )}

            {/* ---------- DECISION ---------- */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
              <p className="text-sm font-semibold">
                {isAwaitingDecision(detail.status)
                  ? t(
                      "appointments.awaitingDecision",
                      "This request is awaiting your decision"
                    )
                  : t("appointments.changeDecision", "Change the decision")}
              </p>

              <p className="text-xs text-slate-400 mt-1">
                {detail.patientName} → {detail.doctorName}.{" "}
                {t(
                  "appointments.decisionHint",
                  "The patient is notified with your choice and any note below."
                )}
              </p>

              <label
                htmlFor="decision-note"
                className="block text-xs font-medium mt-4 mb-1.5"
              >
                {t("appointments.noteToPatient", "Note to patient")}{" "}
                <span className="text-slate-400 font-normal">
                  {t("appointments.optional", "(optional)")}
                </span>
              </label>

              <textarea
                id="decision-note"
                rows={2}
                maxLength={300}
                value={decisionNote}
                onChange={(event) => setDecisionNote(event.target.value)}
                placeholder={t(
                  "appointments.notePlaceholder",
                  "e.g. Doctor unavailable that morning — please pick an afternoon slot."
                )}
                className="input-field resize-none"
              />

              <div className="grid grid-cols-2 gap-2 mt-3">
                <ActionButton
                  label={t("appointments.action.approve", "Approve")}
                  icon={FiCheckCircle}
                  tone="emerald"
                  disabled={working || detail.status === "confirmed"}
                  onClick={() => changeStatus(detail, "confirmed", decisionNote)}
                />
                <ActionButton
                  label={t("appointments.action.reject", "Reject")}
                  icon={FiXCircle}
                  tone="red"
                  disabled={working || detail.status === "rejected"}
                  onClick={() => changeStatus(detail, "rejected", decisionNote)}
                />
                <ActionButton
                  label={t("appointments.action.keepPending", "Keep pending")}
                  icon={FiClock}
                  tone="amber"
                  disabled={working || isAwaitingDecision(detail.status)}
                  onClick={() => changeStatus(detail, "pending", decisionNote)}
                />
                <ActionButton
                  label={t("appointments.action.complete", "Complete")}
                  icon={FiCheckCircle}
                  tone="blue"
                  disabled={working || detail.status === "completed"}
                  onClick={() => changeStatus(detail, "completed", decisionNote)}
                />
                <ActionButton
                  label={t("appointments.action.noShow", "No show")}
                  icon={FiUserX}
                  tone="brand"
                  disabled={working || detail.status === "no_show"}
                  onClick={() => changeStatus(detail, "no_show", decisionNote)}
                />
                <ActionButton
                  label={t("action.cancel", "Cancel")}
                  icon={FiXCircle}
                  tone="amber"
                  disabled={working || detail.status === "cancelled"}
                  onClick={() => {
                    setCancelTarget(detail);
                    setDetail(null);
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => setDeleteTarget(detail)}
                disabled={working}
                className="w-full mt-3 inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70 transition disabled:opacity-40"
              >
                <FiTrash2 size={14} />
                {t(
                  "appointments.deleteRecord",
                  "Delete this record permanently"
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onCancel={() => setCancelTarget(null)}
        onConfirm={confirmCancel}
        loading={working}
        title={t("appointments.confirm.cancelTitle", "Cancel appointment")}
        confirmLabel={t("appointments.confirm.cancelTitle", "Cancel appointment")}
        cancelLabel={t("appointments.confirm.keepIt", "Keep it")}
        message={
          cancelTarget
            ? t(
                "appointments.confirm.cancelMessage",
                "Cancel {patient}'s appointment with {doctor} on {date}? The patient will be notified and the slot released."
              )
                .replace("{patient}", cancelTarget.patientName)
                .replace("{doctor}", cancelTarget.doctorName)
                .replace("{date}", formatDate(cancelTarget.date))
            : ""
        }
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={working}
        title={t("appointments.confirm.deleteTitle", "Delete appointment record")}
        confirmLabel={t("appointments.confirm.deletePermanently", "Delete permanently")}
        message={
          deleteTarget
            ? t(
                "appointments.confirm.deleteMessage",
                "Permanently delete appointment APT-{id} for {patient}? This cannot be undone — cancel it instead if you only want to free the slot. The patient will be notified."
              )
                .replace("{id}", deleteTarget.id)
                .replace("{patient}", deleteTarget.patientName)
            : ""
        }
      />
    </div>
  );
}

/* ================================================================== */

function RowActions({ appointment, onView, onStatus, onCancel, onDelete }) {
  const t = useT();
  const awaiting = isAwaitingDecision(appointment.status);
  const live = awaiting || ["confirmed", "rescheduled"].includes(appointment.status);

  return (
    <RowActionsMenu
      label={`Actions for appointment APT-${appointment.id}`}
      items={[
        {
          key: "review",
          label: t("appointments.action.review", "Review"),
          icon: FiEye,
          onClick: onView,
        },
        {
          key: "approve",
          label: t("appointments.action.approve", "Approve"),
          icon: FiCheckCircle,
          tone: "success",
          onClick: () => onStatus(appointment, "confirmed"),
          hidden: !awaiting,
        },
        {
          key: "reject",
          label: t("appointments.action.reject", "Reject"),
          icon: FiXCircle,
          tone: "danger",
          onClick: () => onStatus(appointment, "rejected"),
          hidden: !awaiting,
        },
        {
          key: "cancel",
          label: t("action.cancel", "Cancel"),
          icon: FiSlash,
          tone: "warning",
          onClick: onCancel,
          hidden: !(live && !awaiting),
        },
        {
          key: "delete",
          label: t("appointments.action.deleteRecord", "Delete record"),
          icon: FiTrash2,
          tone: "danger",
          onClick: onDelete,
        },
      ]}
    />
  );
}

/** "no_show" → "noShow", so status keys read as camelCase in the dictionary. */
function camel(value) {
  return String(value).replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

const TONES = {
  brand: "bg-brand-100 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400",
  blue: "bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400",
  emerald: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
  red: "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400",
  amber: "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400",
};

function MiniStat({ icon: Icon, label, value, tone, loading }) {
  return (
    <div className="glass-card">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-400 leading-tight break-words">{label}</p>
          <p className="text-xl sm:text-2xl font-bold mt-1">
            {loading ? (
              <span className="inline-block h-6 w-8 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
            ) : (
              value ?? 0
            )}
          </p>
        </div>

        <div className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${TONES[tone]}`}>
          <Icon size={16} />
        </div>
      </div>
    </div>
  );
}

function ActionButton({ label, icon: Icon, tone, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed ${TONES[tone]}`}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

function Detail({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-sm font-medium mt-0.5 truncate">{value || "—"}</p>
    </div>
  );
}

function formatDate(value) {
  if (!value) return "—";

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
