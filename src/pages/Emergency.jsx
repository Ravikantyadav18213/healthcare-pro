import React, { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  FiAlertCircle,
  FiPlus,
  FiRefreshCw,
  FiTruck,
  FiDroplet,
  FiActivity,
  FiClock,
} from "react-icons/fi";

import { emergencyService } from "../services/adminService.js";
import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { Alert, EmptyState, ErrorState, Spinner } from "../components/ui/States.jsx";
import { Skeleton } from "../components/ui/Skeleton.jsx";
import SelectDropdown from "../components/ui/SelectDropdown.jsx";
import TimePicker from "../components/ui/TimePicker.jsx";
import { padRefresh } from "../utils/timing.js";

const SEVERITIES = ["Critical", "Serious", "Stable"];
const STATUSES = ["Active", "Admitted", "Discharged"];

const SEVERITY_STYLES = {
  Critical: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  Serious: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  Stable: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
};

const EMPTY_FORM = {
  name: "",
  phone: "",
  condition: "",
  severity: "Stable",
  status: "Active",
  arrivedAt: "",
  notes: "",
};

export default function Emergency() {
  const toast = useToast();
  const t = useT();

  /* Severity and case status are a fixed set of UI words. */
  const severityLabel = (value) =>
    t(`emergency.severity.${String(value).toLowerCase()}`, value);
  const caseStatusLabel = (value) =>
    t(`emergency.status.${String(value).toLowerCase()}`, value);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    const startedAt = Date.now();
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError(null);

    try {
      setData(await emergencyService.overview());
    } catch (caught) {
      setError(caught);
    } finally {
      await padRefresh(isRefresh, startedAt);
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = async (item, status) => {
    try {
      await emergencyService.update(item.id, { status });
      toast.success(`${item.name} marked ${status.toLowerCase()}.`);
      load(true);
    } catch (caught) {
      toast.error(caught.message);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError("");

    try {
      await emergencyService.create(form);
      toast.success("Emergency case registered.");
      setModalOpen(false);
      setForm(EMPTY_FORM);
      load(true);
    } catch (caught) {
      setFormError(caught.message);
    } finally {
      setSaving(false);
    }
  };

  const icuFree = data ? Math.max(0, data.icuBeds.total - data.icuBeds.occupied) : 0;
  const icuPercent = data && data.icuBeds.total
    ? Math.round((data.icuBeds.occupied / data.icuBeds.total) * 100)
    : 0;

  if (error) {
    return (
      <div className="glass-card">
        <ErrorState error={error} onRetry={() => load()} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FiAlertCircle className="text-red-500" />
            {t("emergency.title", "Emergency")}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t(
              "emergency.subtitle",
              "Live cases, ambulance fleet, ICU capacity and blood bank."
            )}
          </p>
        </div>

        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => load(true)}
            aria-label="Refresh emergency data"
            className="btn-secondary text-sm inline-flex items-center justify-center gap-2"
          >
            <FiRefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          </button>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm shadow-md transition"
          >
            <FiPlus size={16} />
            {t("emergency.newCase", "New Case")}
          </button>
        </div>
      </motion.div>

      {/* ============ CAPACITY ============ */}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <FiActivity size={15} className="text-brand-600 dark:text-brand-400" />
              {t("emergency.icuCapacity", "ICU Capacity")}
            </h2>
            {!loading && (
              <span
                className={`badge ${
                  icuPercent >= 85
                    ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                    : "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                }`}
              >
                {icuPercent}% {t("emergency.occupied", "occupied")}
              </span>
            )}
          </div>

          {loading ? (
            <Skeleton className="h-20 rounded-xl" />
          ) : (
            <>
              <p className="text-3xl font-bold">
                {icuFree}
                <span className="text-base font-medium text-slate-400">
                  {" "}
                  / {data.icuBeds.total} {t("emergency.free", "free")}
                </span>
              </p>

              <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 mt-4 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${icuPercent}%` }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className={`h-full rounded-full ${
                    icuPercent >= 85 ? "bg-red-500" : "bg-brand-500"
                  }`}
                />
              </div>
            </>
          )}
        </div>

        <div className="glass-card">
          <h2 className="font-semibold text-sm flex items-center gap-2 mb-4">
            <FiTruck size={15} className="text-brand-600 dark:text-brand-400" />
            {t("emergency.ambulances", "Ambulances")}
          </h2>

          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-9 rounded-lg" />
              ))}
            </div>
          ) : (
            <ul className="space-y-2">
              {data.ambulances.map((ambulance) => (
                <li
                  key={ambulance.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="font-medium">{ambulance.id}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{ambulance.location}</span>
                    <span
                      className={`badge ${
                        ambulance.status === "Available"
                          ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                          : ambulance.status === "On Call"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      {ambulance.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="glass-card">
          <h2 className="font-semibold text-sm flex items-center gap-2 mb-4">
            <FiDroplet size={15} className="text-red-500" />
            {t("emergency.bloodBank", "Blood Bank")}
          </h2>

          {loading ? (
            <Skeleton className="h-20 rounded-xl" />
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {data.bloodBank.map((blood) => (
                <div
                  key={blood.type}
                  className={`rounded-xl px-2 py-2.5 text-center ${
                    blood.units < 10
                      ? "bg-red-50 dark:bg-red-950/30"
                      : "bg-slate-50 dark:bg-slate-800/60"
                  }`}
                >
                  <p className="text-sm font-bold">{blood.type}</p>
                  <p
                    className={`text-xs mt-0.5 ${
                      blood.units < 10
                        ? "text-red-600 dark:text-red-400 font-semibold"
                        : "text-slate-400"
                    }`}
                  >
                    {blood.units} {t("emergency.units", "units")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ============ CASES ============ */}

      <div className="glass-card">
        <h2 className="font-semibold text-sm mb-4">
          {t("emergency.activeCases", "Active Emergency Cases")}
        </h2>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : data.cases.length === 0 ? (
          <EmptyState
            icon={FiAlertCircle}
            title={t("emergency.empty.title", "No active emergency cases")}
            description={t(
              "emergency.empty.description",
              "The emergency department is currently clear."
            )}
            compact
          />
        ) : (
          <div className="space-y-3">
            {data.cases.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.04, 0.3), duration: 0.25 }}
                className={`rounded-2xl border p-4 ${
                  item.severity === "Critical"
                    ? "border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20"
                    : "border-slate-200 dark:border-slate-800"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold truncate">{item.name}</p>
                      <span className={`badge ${SEVERITY_STYLES[item.severity]}`}>
                        {severityLabel(item.severity)}
                      </span>
                      <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {caseStatusLabel(item.status)}
                      </span>
                    </div>

                    {item.condition && (
                      <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
                        {item.condition}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 mt-2">
                      <span className="inline-flex items-center gap-1">
                        <FiClock size={11} />
                        {t("emergency.arrived", "Arrived")} {item.arrivedAt}
                      </span>
                      {item.phone && <span>{item.phone}</span>}
                    </div>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    {item.status !== "Admitted" && (
                      <button
                        type="button"
                        onClick={() => changeStatus(item, "Admitted")}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 transition"
                      >
                        {t("emergency.admit", "Admit")}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => changeStatus(item, "Discharged")}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 transition"
                    >
                      {t("emergency.discharge", "Discharge")}
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* ============ FORM ============ */}

      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={t("emergency.modal.title", "Register Emergency Case")}
        description={t(
          "emergency.modal.description",
          "Record a walk-in or ambulance arrival."
        )}
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}

          <Field label={t("emergency.field.patientName", "Patient name")} required>
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder={t(
                "emergency.placeholder.patientName",
                "Unknown — RTA Case"
              )}
              className="input-field"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t("label.phone", "Phone")}>
              <input
                value={form.phone}
                onChange={(event) =>
                  setForm({ ...form, phone: event.target.value.replace(/\D/g, "").slice(0, 10) })
                }
                maxLength={10}
                inputMode="numeric"
                className="input-field"
              />
            </Field>

            <Field label={t("emergency.field.arrivalTime", "Arrival time")}>
              <TimePicker
                value={form.arrivedAt}
                onChange={(value) => setForm({ ...form, arrivedAt: value })}
                placeholder={t("emergency.selectTime", "Select time")}
                ariaLabel="Arrival time"
                className="input-field input-icon w-full"
              />
            </Field>

            <Field label={t("emergency.field.severity", "Severity")}>
              <SelectDropdown
                value={form.severity}
                onChange={(value) => setForm({ ...form, severity: value })}
                options={SEVERITIES.map((item) => ({
                  value: item,
                  label: severityLabel(item),
                }))}
                ariaLabel="Severity"
                className="w-full"
              />
            </Field>

            <Field label={t("label.status", "Status")}>
              <SelectDropdown
                value={form.status}
                onChange={(value) => setForm({ ...form, status: value })}
                options={STATUSES.map((item) => ({
                  value: item,
                  label: caseStatusLabel(item),
                }))}
                ariaLabel="Status"
                className="w-full"
              />
            </Field>
          </div>

          <Field label={t("emergency.field.condition", "Presenting condition")}>
            <textarea
              rows={2}
              value={form.condition}
              onChange={(event) => setForm({ ...form, condition: event.target.value })}
              placeholder={t(
                "emergency.placeholder.condition",
                "Road traffic accident, multiple trauma"
              )}
              className="input-field resize-none"
            />
          </Field>

          <Field label={t("emergency.field.notes", "Triage notes")}>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              className="input-field resize-none"
            />
          </Field>

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              disabled={saving}
              className="btn-secondary flex-1"
            >
              {t("action.cancel", "Cancel")}
            </button>

            <button
              type="submit"
              disabled={saving}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2 font-semibold text-sm text-white shadow-md transition disabled:opacity-60"
            >
              {saving && <Spinner size={14} />}
              {saving
                ? t("emergency.registering", "Registering...")
                : t("emergency.registerCase", "Register Case")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
