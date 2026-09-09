import React, { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  FiLogOut,
  FiPlus,
  FiRefreshCw,
  FiDownload,
  FiEdit2,
  FiTrash2,
  FiUser,
  FiSearch,
} from "react-icons/fi";

import { dischargeService } from "../services/clinicalService.js";
import { patientService } from "../services/adminService.js";
import { doctorService } from "../services/doctorService.js";
import { useAuth } from "../hooks/useAuth.js";
import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";
import { Modal, ConfirmDialog } from "../components/ui/Modal.jsx";
import { Alert, EmptyState, ErrorState, Spinner } from "../components/ui/States.jsx";
import { SkeletonList } from "../components/ui/Skeleton.jsx";
import SelectDropdown from "../components/ui/SelectDropdown.jsx";
import DatePicker from "../components/ui/DatePicker.jsx";
import { padRefresh } from "../utils/timing.js";
import { ROLES } from "../constants/roles.js";

/* ==================================================================
   DISCHARGE SUMMARIES

   Writing one is what actually closes a stay: the API marks the
   patient discharged and frees their bed in the same transaction, so
   this page never has to remember to do those separately.
================================================================== */

const todayISO = new Date().toISOString().slice(0, 10);

const EMPTY = {
  patientId: "",
  doctorId: "",
  admittedOn: "",
  dischargedOn: todayISO,
  diagnosis: "",
  treatmentSummary: "",
  medications: "",
  followUpInstructions: "",
  conditionOnDischarge: "Stable",
};

/* The stored value stays English — only what is shown is translated. */
const CONDITIONS = [
  { value: "Stable", key: "discharges.conditionStable", label: "Stable" },
  { value: "Improved", key: "discharges.conditionImproved", label: "Improved" },
  { value: "Recovered", key: "discharges.conditionRecovered", label: "Recovered" },
  { value: "Referred", key: "discharges.conditionReferred", label: "Referred" },
  {
    value: "Against medical advice",
    key: "discharges.conditionAgainstAdvice",
    label: "Against medical advice",
  },
];

function conditionLabel(t, value) {
  const found = CONDITIONS.find((item) => item.value === value);
  return found ? t(found.key, found.label) : value;
}

export default function DischargeSummaries() {
  const { user } = useAuth();
  const toast = useToast();
  const t = useT();

  const canWrite = user?.role === ROLES.ADMIN || user?.role === ROLES.DOCTOR;
  const canDelete = user?.role === ROLES.ADMIN;

  const [summaries, setSummaries] = useState([]);
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pdfFor, setPdfFor] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    const startedAt = Date.now();
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await dischargeService.list();
      setSummaries(data.summaries);
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

  /* Only needed once somebody actually opens the form. */
  const openForm = async (existing = null) => {
    setFormError("");
    setForm(
      existing
        ? {
            patientId: String(existing.patientId),
            doctorId: existing.doctorId ? String(existing.doctorId) : "",
            admittedOn: existing.admittedOn || "",
            dischargedOn: existing.dischargedOn || todayISO,
            diagnosis: existing.diagnosis || "",
            treatmentSummary: existing.treatmentSummary || "",
            medications: existing.medications || "",
            followUpInstructions: existing.followUpInstructions || "",
            conditionOnDischarge: existing.conditionOnDischarge || "Stable",
          }
        : EMPTY
    );
    setModal(existing || "new");

    if (patients.length === 0) {
      try {
        const [patientData, doctorData] = await Promise.all([
          patientService.list({ limit: 200 }),
          doctorService.list({}),
        ]);
        setPatients(patientData.patients || []);
        setDoctors(doctorData.doctors || []);
      } catch {
        /* the selects stay empty; the form still validates server-side */
      }
    }
  };

  const save = async (event) => {
    event.preventDefault();

    if (!form.patientId) {
      setFormError("Choose a patient.");
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      if (modal === "new") {
        await dischargeService.create({ ...form, patientId: Number(form.patientId) });
        toast.success("Discharge summary created. The patient's bed is now free.");
      } else {
        await dischargeService.update(modal.id, form);
        toast.success("Discharge summary updated.");
      }

      setModal(null);
      load(true);
    } catch (caught) {
      setFormError(caught.message || "Could not save the summary.");
    } finally {
      setSaving(false);
    }
  };

  const download = async (summary) => {
    setPdfFor(summary.id);

    try {
      const name = await dischargeService.downloadPdf(summary.id);
      toast.success(`Downloaded ${name}`);
    } catch (caught) {
      toast.error(caught.message || "Could not build that PDF.");
    } finally {
      setPdfFor(null);
    }
  };

  const remove = async () => {
    if (!confirm) return;

    try {
      await dischargeService.remove(confirm.id);
      toast.success("Discharge summary deleted.");
      load(true);
    } catch (caught) {
      toast.error(caught.message || "Could not delete that summary.");
    } finally {
      setConfirm(null);
    }
  };

  const visible = summaries.filter((summary) =>
    `${summary.patientName} ${summary.diagnosis || ""} ${summary.doctorName || ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  if (error) {
    return (
      <div className="glass-card">
        <ErrorState error={error} onRetry={() => load()} />
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ============ HEADER ============ */}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold">{t("discharges.title", "Discharge Summaries")}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {loading
              ? t("label.loading", "Loading...")
              : t("discharges.count", "{n} summaries on record").replace(
                  "{n}",
                  summaries.length
                )}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("discharges.searchPlaceholder", "Search patient or diagnosis")}
              aria-label="Search discharge summaries"
              className="input-field input-icon w-full sm:w-60"
            />
          </div>

          <button
            type="button"
            onClick={() => load(true)}
            aria-label="Refresh discharge summaries"
            className="btn-secondary text-sm inline-flex items-center justify-center gap-2"
          >
            <FiRefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          </button>

          {canWrite && (
            <button
              type="button"
              onClick={() => openForm()}
              className="btn-primary text-sm inline-flex items-center justify-center gap-2"
            >
              <FiPlus size={16} />
              {t("discharges.newSummary", "New Summary")}
            </button>
          )}
        </div>
      </motion.div>

      {/* ============ LIST ============ */}

      {loading ? (
        <div className="glass-card">
          <SkeletonList count={3} />
        </div>
      ) : visible.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={FiLogOut}
            title={
              search
                ? t("discharges.noMatches", "No matching summaries")
                : t("discharges.empty", "No discharge summaries yet")
            }
            description={
              search
                ? t("discharges.tryAnotherSearch", "Try a different search term.")
                : canWrite
                ? t("discharges.emptyWriter", "Create one when a patient leaves the hospital.")
                : t(
                    "discharges.emptyViewer",
                    "Summaries appear here once patients are discharged."
                  )
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {visible.map((summary, index) => (
            <motion.article
              key={summary.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.2) }}
              className="glass-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-11 h-11 shrink-0 rounded-xl bg-teal-100 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                    <FiLogOut size={19} />
                  </div>

                  <div className="min-w-0">
                    <h2 className="font-semibold truncate">{summary.patientName}</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {t("discharges.dischargedOnShort", "Discharged")} {summary.dischargedOn}
                      {summary.admittedOn
                        ? ` · ${t("discharges.admittedOnShort", "admitted")} ${summary.admittedOn}`
                        : ""}
                    </p>
                  </div>
                </div>

                {summary.conditionOnDischarge && (
                  <span className="badge shrink-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    {conditionLabel(t, summary.conditionOnDischarge)}
                  </span>
                )}
              </div>

              {summary.diagnosis && (
                <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                    {t("discharges.diagnosis", "Diagnosis")}
                  </p>
                  <p className="text-sm text-slate-700 dark:text-slate-200 leading-6">
                    {summary.diagnosis}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
                <div>
                  <p className="text-slate-400 flex items-center gap-1.5">
                    <FiUser size={11} />
                    {t("label.doctor", "Doctor")}
                  </p>
                  <p className="font-medium mt-0.5 truncate">{summary.doctorName || "—"}</p>
                </div>
                <div>
                  <p className="text-slate-400">{t("label.department", "Department")}</p>
                  <p className="font-medium mt-0.5 truncate">{summary.departmentName || "—"}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => download(summary)}
                  disabled={pdfFor === summary.id}
                  className="btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  {pdfFor === summary.id ? <Spinner size={12} /> : <FiDownload size={13} />}
                  PDF
                </button>

                {canWrite && (
                  <button
                    type="button"
                    onClick={() => openForm(summary)}
                    className="btn-secondary text-xs inline-flex items-center gap-1.5"
                  >
                    <FiEdit2 size={13} />
                    {t("action.edit", "Edit")}
                  </button>
                )}

                {canDelete && (
                  <button
                    type="button"
                    onClick={() => setConfirm(summary)}
                    aria-label={`Delete summary for ${summary.patientName}`}
                    className="btn-secondary text-xs !text-red-600 inline-flex items-center gap-1.5"
                  >
                    <FiTrash2 size={13} />
                  </button>
                )}
              </div>
            </motion.article>
          ))}
        </div>
      )}

      {/* ============ FORM ============ */}

      <Modal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        title={
          modal === "new"
            ? t("discharges.newTitle", "New Discharge Summary")
            : t("discharges.editTitle", "Edit Discharge Summary")
        }
        description={
          modal === "new"
            ? t(
                "discharges.newDescription",
                "Creating this marks the patient discharged and frees their bed."
              )
            : undefined
        }
        size="lg"
      >
        <form onSubmit={save} className="space-y-4" noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t("label.patient", "Patient")} required>
              <SelectDropdown
                value={form.patientId}
                onChange={(value) => setForm({ ...form, patientId: value })}
                disabled={modal !== "new"}
                options={[
                  {
                    value: "",
                    label: patients.length
                      ? t("discharges.selectPatient", "Select a patient")
                      : t("label.loading", "Loading..."),
                  },
                  ...patients.map((patient) => ({
                    value: String(patient.id),
                    label: patient.name,
                  })),
                ]}
                ariaLabel="Patient"
                className="w-full"
              />
            </Field>

            <Field label={t("discharges.attendingDoctor", "Attending doctor")}>
              <SelectDropdown
                value={form.doctorId}
                onChange={(value) => setForm({ ...form, doctorId: value })}
                options={[
                  { value: "", label: t("discharges.notRecorded", "Not recorded") },
                  ...doctors.map((doctor) => ({
                    value: String(doctor.id),
                    label: doctor.name,
                  })),
                ]}
                ariaLabel="Attending doctor"
                className="w-full"
              />
            </Field>

            <Field label={t("discharges.admittedOn", "Admitted on")}>
              <DatePicker
                value={form.admittedOn}
                onChange={(iso) => setForm({ ...form, admittedOn: iso })}
                max={todayISO}
                placeholder={t("discharges.selectDate", "Select date")}
                ariaLabel="Admitted on"
                className="input-field input-icon w-full"
              />
            </Field>

            <Field label={t("discharges.dischargedOn", "Discharged on")} required>
              <DatePicker
                value={form.dischargedOn}
                onChange={(iso) => setForm({ ...form, dischargedOn: iso })}
                max={todayISO}
                placeholder={t("discharges.selectDate", "Select date")}
                ariaLabel="Discharged on"
                className="input-field input-icon w-full"
              />
            </Field>
          </div>

          <Field label={t("discharges.conditionAtDischarge", "Condition at discharge")}>
            <SelectDropdown
              value={form.conditionOnDischarge}
              onChange={(value) => setForm({ ...form, conditionOnDischarge: value })}
              options={CONDITIONS.map((item) => ({
                value: item.value,
                label: t(item.key, item.label),
              }))}
              ariaLabel="Condition at discharge"
              className="w-full"
            />
          </Field>

          <Field label={t("discharges.diagnosis", "Diagnosis")}>
            <textarea
              rows={2}
              value={form.diagnosis}
              onChange={(event) => setForm({ ...form, diagnosis: event.target.value })}
              placeholder={t("discharges.diagnosisPlaceholder", "Acute bronchitis")}
              className="input-field resize-none"
            />
          </Field>

          <Field label={t("discharges.treatmentSummary", "Treatment summary")}>
            <textarea
              rows={3}
              value={form.treatmentSummary}
              onChange={(event) => setForm({ ...form, treatmentSummary: event.target.value })}
              placeholder={t(
                "discharges.treatmentPlaceholder",
                "IV antibiotics for 5 days, nebulisation twice daily."
              )}
              className="input-field resize-none"
            />
          </Field>

          <Field label={t("discharges.medications", "Medications on discharge")}>
            <textarea
              rows={2}
              value={form.medications}
              onChange={(event) => setForm({ ...form, medications: event.target.value })}
              placeholder="Amoxicillin 250mg TDS x 7 days"
              className="input-field resize-none"
            />
          </Field>

          <Field label={t("discharges.followUp", "Follow-up instructions")}>
            <textarea
              rows={2}
              value={form.followUpInstructions}
              onChange={(event) => setForm({ ...form, followUpInstructions: event.target.value })}
              placeholder={t("discharges.followUpPlaceholder", "Review in OPD after 1 week.")}
              className="input-field resize-none"
            />
          </Field>

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
            <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1">
              {t("action.cancel", "Cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {saving && <Spinner size={14} />}
              {saving
                ? t("action.saving", "Saving...")
                : modal === "new"
                ? t("discharges.createAndDischarge", "Create & Discharge")
                : t("profile.saveChanges", "Save Changes")}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={t("discharges.deleteTitle", "Delete this discharge summary?")}
        message={t(
          "discharges.deleteMessage",
          "The summary for {name} will be removed. This does not re-admit the patient."
        ).replace("{name}", confirm?.patientName)}
        confirmLabel={t("action.delete", "Delete")}
        tone="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={remove}
      />
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
