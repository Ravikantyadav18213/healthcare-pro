import React, { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiUsers,
  FiRefreshCw,
  FiPhone,
  FiActivity,
  FiEye,
} from "react-icons/fi";

import { patientService, departmentService } from "../services/adminService.js";
import doctorService from "../services/doctorService.js";
import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";
import { useDebouncedValue } from "../hooks/useApi.js";
import { Modal, ConfirmDialog } from "../components/ui/Modal.jsx";
import { Alert, EmptyState, ErrorState, Spinner } from "../components/ui/States.jsx";
import { SkeletonTable } from "../components/ui/Skeleton.jsx";
import RowActionsMenu from "../components/ui/RowActionsMenu.jsx";
import SelectDropdown from "../components/ui/SelectDropdown.jsx";
import DatePicker from "../components/ui/DatePicker.jsx";
import { statusColor } from "../utils/format.js";
import { padRefresh } from "../utils/timing.js";

const STATUSES = ["Stable", "Recovering", "Critical", "Outpatient", "Discharged"];
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

/* The stored value stays English — only what the screen shows is
   translated, so filters and the API contract are untouched. */
const STATUS_KEYS = {
  Stable: "patients.status.stable",
  Recovering: "patients.status.recovering",
  Critical: "patients.status.critical",
  Outpatient: "patients.status.outpatient",
  Discharged: "patients.status.discharged",
};

const PATIENT_COLUMNS = [
  { key: "label.name", label: "Name" },
  { key: "patients.col.age", label: "Age" },
  { key: "label.department", label: "Department" },
  { key: "label.doctor", label: "Doctor" },
  { key: "patients.col.room", label: "Room" },
  { key: "label.status", label: "Status" },
  { key: "patients.col.admitted", label: "Admitted" },
  { key: "label.actions", label: "Actions" },
];

const EMPTY_FORM = {
  name: "",
  phone: "",
  email: "",
  dateOfBirth: "",
  gender: "Female",
  bloodGroup: "",
  address: "",
  emergencyContact: "",
  departmentId: "",
  doctorId: "",
  room: "",
  status: "Stable",
  admittedAt: "",
  medicalHistory: [],
};

export default function Patients() {
  const { search: navbarSearch } = useOutletContext() || {};
  const toast = useToast();
  const t = useT();

  const statusLabel = (value) =>
    STATUS_KEYS[value] ? t(STATUS_KEYS[value], value) : value;

  const [patients, setPatients] = useState([]);
  const [stats, setStats] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [localSearch, setLocalSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [historyText, setHistoryText] = useState("");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const term = useDebouncedValue(localSearch || navbarSearch || "", 350);

  useEffect(() => {
    Promise.all([departmentService.list(), doctorService.list()])
      .then(([deptData, docData]) => {
        setDepartments(deptData.departments);
        setDoctors(docData.doctors);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(
    async (isRefresh = false) => {
      const startedAt = Date.now();
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      setError(null);

      try {
        const data = await patientService.list({
          search: term,
          departmentId: departmentId || undefined,
        });
        setPatients(data.patients);
        setStats(data.stats);
      } catch (caught) {
        setError(caught);
      } finally {
        await padRefresh(isRefresh, startedAt);
        setLoading(false);
        setRefreshing(false);
      }
    },
    [term, departmentId]
  );

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, admittedAt: new Date().toISOString().slice(0, 10) });
    setHistoryText("");
    setFormError("");
    setFieldErrors({});
    setModalOpen(true);
  };

  const openEdit = (patient) => {
    setEditing(patient);
    setForm({
      name: patient.name,
      phone: patient.phone || "",
      email: patient.email || "",
      dateOfBirth: patient.dateOfBirth || "",
      gender: patient.gender || "Female",
      bloodGroup: patient.bloodGroup || "",
      address: patient.address || "",
      emergencyContact: patient.emergencyContact || "",
      departmentId: patient.departmentId || "",
      doctorId: patient.doctorId || "",
      room: patient.room || "",
      status: patient.status,
      admittedAt: patient.admittedAt || "",
      medicalHistory: patient.medicalHistory || [],
    });
    setHistoryText((patient.medicalHistory || []).join("\n"));
    setFormError("");
    setFieldErrors({});
    setModalOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();

    setSaving(true);
    setFormError("");
    setFieldErrors({});

    const payload = {
      ...form,
      medicalHistory: historyText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    };

    try {
      if (editing) {
        await patientService.update(editing.id, payload);
        toast.success(`${form.name} updated.`);
      } else {
        await patientService.create(payload);
        toast.success(`${form.name} added to patient records.`);
      }

      setModalOpen(false);
      load(true);
    } catch (caught) {
      setFieldErrors(caught?.errors || {});
      setFormError(caught.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);

    try {
      await patientService.remove(deleteTarget.id);
      toast.success(`${deleteTarget.name} removed.`);
      setDeleteTarget(null);
      load(true);
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setDeleting(false);
    }
  };

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
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
          <h1 className="text-xl font-bold">{t("patients.title", "Patients")}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {stats
              ? `${stats.total} ${t("patients.records", "records")} · ${
                  stats.critical
                } ${t("patients.criticalCount", "critical")} · ${
                  stats.admittedToday
                } ${t("patients.admittedToday", "admitted today")}`
              : t("patients.loading", "Loading patient records...")}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={localSearch}
              onChange={(event) => setLocalSearch(event.target.value)}
              placeholder={t("patients.searchPlaceholder", "Search patients")}
              aria-label="Search patients"
              className="input-field input-icon w-full sm:w-56"
            />
          </div>

          <SelectDropdown
            value={departmentId}
            onChange={setDepartmentId}
            options={[
              { value: "", label: t("patients.allDepartments", "All departments") },
              ...departments.map((department) => ({
                value: String(department.id),
                label: department.name,
              })),
            ]}
            ariaLabel="Filter by department"
            className="w-full sm:w-44"
          />

          <button
            type="button"
            onClick={() => load(true)}
            aria-label="Refresh patients"
            className="btn-secondary text-sm inline-flex items-center justify-center gap-2"
          >
            <FiRefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          </button>

          <button
            type="button"
            onClick={openAdd}
            className="btn-primary text-sm inline-flex items-center justify-center gap-2 shrink-0"
          >
            <FiPlus size={16} />
            {t("patients.addPatient", "Add Patient")}
          </button>
        </div>
      </motion.div>

      {/* ============ TABLE ============ */}

      {loading ? (
        <SkeletonTable rows={6} cols={7} />
      ) : error ? (
        <div className="glass-card">
          <ErrorState error={error} onRetry={() => load()} />
        </div>
      ) : patients.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={FiUsers}
            title={t("patients.empty.title", "No patients found")}
            description={t(
              "patients.empty.description",
              "Add a patient record or clear your filters."
            )}
            action={openAdd}
            actionLabel={t("patients.addPatient", "Add Patient")}
          />
        </div>
      ) : (
        <>
          <div className="glass overflow-hidden hidden lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b border-slate-200/60 dark:border-slate-700/60">
                  <tr>
                    {PATIENT_COLUMNS.map((column) => (
                      <th
                        key={column.key}
                        className="text-left px-4 py-3 text-xs uppercase tracking-wide text-slate-400 font-semibold"
                      >
                        {t(column.key, column.label)}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {patients.map((patient) => (
                    <tr
                      key={patient.id}
                      className="border-b border-slate-100/60 dark:border-slate-800/60 hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setDetail(patient)}
                          className="font-medium hover:text-brand-600 transition text-left"
                        >
                          {patient.name}
                        </button>
                        <p className="text-xs text-slate-400">{patient.phone || "—"}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {patient.age ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {patient.department || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {patient.doctor || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {patient.room || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${statusColor(patient.status)}`}>
                          {statusLabel(patient.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDate(patient.admittedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <RowActionsMenu
                          label={`Actions for ${patient.name}`}
                          items={[
                            {
                              key: "view",
                              label: t("action.view", "View"),
                              icon: FiEye,
                              onClick: () => setDetail(patient),
                            },
                            {
                              key: "edit",
                              label: t("action.edit", "Edit"),
                              icon: FiEdit2,
                              onClick: () => openEdit(patient),
                            },
                            {
                              key: "delete",
                              label: t("action.delete", "Delete"),
                              icon: FiTrash2,
                              tone: "danger",
                              onClick: () => setDeleteTarget(patient),
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
            {patients.map((patient, index) => (
              <motion.div
                key={patient.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.03, 0.25), duration: 0.24 }}
                className="glass-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{patient.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {patient.age ? `${patient.age} yrs · ` : ""}
                      {patient.gender || "—"}
                    </p>
                  </div>

                  <span className={`badge shrink-0 ${statusColor(patient.status)}`}>
                    {statusLabel(patient.status)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
                  <Field
                    label={t("label.department", "Department")}
                    value={patient.department}
                  />
                  <Field label={t("label.doctor", "Doctor")} value={patient.doctor} />
                  <Field label={t("patients.col.room", "Room")} value={patient.room} />
                  <Field label={t("label.phone", "Phone")} value={patient.phone} />
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setDetail(patient)}
                    className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {t("action.view", "View")}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(patient)}
                    className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300"
                  >
                    {t("action.edit", "Edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(patient)}
                    className="px-3 py-2 rounded-lg text-xs font-medium bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300"
                  >
                    <FiTrash2 size={13} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {/* ============ FORM ============ */}

      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={
          editing
            ? t("patients.modal.editTitle", "Edit Patient")
            : t("patients.addPatient", "Add Patient")
        }
        size="lg"
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field2
              label={t("label.fullName", "Full name")}
              required
              error={fieldErrors.name}
            >
              <input value={form.name} onChange={update("name")} className="input-field" />
            </Field2>

            <Field2 label={t("label.phone", "Phone")} error={fieldErrors.phone}>
              <input
                value={form.phone}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, "").slice(0, 10);
                  setForm((current) => ({ ...current, phone: digits }));
                  setFieldErrors((current) => ({ ...current, phone: undefined }));
                }}
                maxLength={10}
                inputMode="numeric"
                className="input-field"
              />
            </Field2>

            <Field2 label={t("label.email", "Email")}>
              <input
                type="email"
                value={form.email}
                onChange={update("email")}
                className="input-field"
              />
            </Field2>

            <Field2
              label={t("patients.form.dateOfBirth", "Date of birth")}
              error={fieldErrors.dateOfBirth}
            >
              <DatePicker
                value={form.dateOfBirth}
                onChange={(iso) => update("dateOfBirth")({ target: { value: iso } })}
                max={new Date().toISOString().slice(0, 10)}
                placeholder={t("patients.form.selectDateOfBirth", "Select date of birth")}
                ariaLabel="Date of birth"
                className="input-field input-icon w-full"
              />
            </Field2>

            <Field2 label={t("label.gender", "Gender")}>
              <SelectDropdown
                value={form.gender}
                onChange={(value) => update("gender")({ target: { value } })}
                options={[
                  { value: "Female", label: t("patients.gender.female", "Female") },
                  { value: "Male", label: t("patients.gender.male", "Male") },
                  { value: "Other", label: t("patients.gender.other", "Other") },
                ]}
                ariaLabel="Gender"
                className="w-full"
              />
            </Field2>

            <Field2 label={t("label.bloodGroup", "Blood group")}>
              <SelectDropdown
                value={form.bloodGroup}
                onChange={(value) => update("bloodGroup")({ target: { value } })}
                options={[
                  { value: "", label: t("patients.bloodGroup.unknown", "Unknown") },
                  ...BLOOD_GROUPS.map((group) => ({ value: group, label: group })),
                ]}
                ariaLabel="Blood group"
                className="w-full"
              />
            </Field2>

            <Field2 label={t("label.department", "Department")}>
              <SelectDropdown
                value={form.departmentId}
                onChange={(value) => update("departmentId")({ target: { value } })}
                options={[
                  { value: "", label: t("label.notAssigned", "Not assigned") },
                  ...departments.map((department) => ({
                    value: String(department.id),
                    label: department.name,
                  })),
                ]}
                ariaLabel="Department"
                className="w-full"
              />
            </Field2>

            <Field2 label={t("patients.form.attendingDoctor", "Attending doctor")}>
              <SelectDropdown
                value={form.doctorId}
                onChange={(value) => update("doctorId")({ target: { value } })}
                options={[
                  { value: "", label: t("label.notAssigned", "Not assigned") },
                  ...doctors.map((doctor) => ({
                    value: String(doctor.id),
                    label: doctor.name,
                  })),
                ]}
                ariaLabel="Attending doctor"
                className="w-full"
              />
            </Field2>

            <Field2 label={t("patients.col.room", "Room")}>
              <input value={form.room} onChange={update("room")} className="input-field" />
            </Field2>

            <Field2 label={t("label.status", "Status")}>
              <SelectDropdown
                value={form.status}
                onChange={(value) => update("status")({ target: { value } })}
                options={STATUSES.map((status) => ({
                  value: status,
                  label: statusLabel(status),
                }))}
                ariaLabel="Status"
                className="w-full"
              />
            </Field2>

            <Field2 label={t("patients.form.admittedOn", "Admitted on")}>
              <DatePicker
                value={form.admittedAt}
                onChange={(iso) => update("admittedAt")({ target: { value: iso } })}
                placeholder={t("patients.form.selectDate", "Select date")}
                ariaLabel="Admitted on"
                className="input-field input-icon w-full"
              />
            </Field2>

            <Field2 label={t("patients.form.emergencyContact", "Emergency contact")}>
              <input
                value={form.emergencyContact}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    emergencyContact: event.target.value.replace(/\D/g, "").slice(0, 10),
                  }))
                }
                maxLength={10}
                inputMode="numeric"
                placeholder="+91 90000 00000"
                className="input-field"
              />
            </Field2>
          </div>

          <Field2 label={t("label.address", "Address")}>
            <input value={form.address} onChange={update("address")} className="input-field" />
          </Field2>

          <Field2
            label={t("patients.form.medicalHistory", "Medical history")}
            hint={t("patients.form.medicalHistoryHint", "One condition per line.")}
          >
            <textarea
              rows={3}
              value={historyText}
              onChange={(event) => setHistoryText(event.target.value)}
              placeholder={"Hypertension (2019)\nAngioplasty (2023)"}
              className="input-field resize-none"
            />
          </Field2>

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
              className="btn-primary flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {saving && <Spinner size={14} />}
              {saving
                ? t("action.saving", "Saving...")
                : editing
                ? t("action.saveChanges", "Save Changes")
                : t("patients.addPatient", "Add Patient")}
            </button>
          </div>
        </form>
      </Modal>

      {/* ============ DETAIL ============ */}

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.name || ""}
        description={
          detail
            ? `${detail.age ? `${detail.age} yrs · ` : ""}${detail.gender || ""}${
                detail.room ? ` · Room ${detail.room}` : ""
              }`
            : ""
        }
      >
        {detail && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Detail
                icon={FiPhone}
                label={t("label.phone", "Phone")}
                value={detail.phone}
              />
              <Detail
                icon={FiActivity}
                label={t("label.bloodGroup", "Blood group")}
                value={detail.bloodGroup}
              />
              <Detail
                label={t("label.department", "Department")}
                value={detail.department}
              />
              <Detail label={t("label.doctor", "Doctor")} value={detail.doctor} />
              <Detail
                label={t("patients.col.admitted", "Admitted")}
                value={formatDate(detail.admittedAt)}
              />
              <Detail
                label={t("patients.form.emergencyContact", "Emergency contact")}
                value={detail.emergencyContact}
              />
            </div>

            {detail.address && (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                  {t("label.address", "Address")}
                </p>
                <p className="text-sm">{detail.address}</p>
              </div>
            )}

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
                {t("patients.form.medicalHistory", "Medical history")}
              </p>

              {detail.medicalHistory.length === 0 ? (
                <p className="text-sm text-slate-400">
                  {t("patients.detail.noHistory", "No records on file.")}
                </p>
              ) : (
                <ul className="text-sm space-y-1.5 list-disc list-inside text-slate-600 dark:text-slate-300">
                  {detail.medicalHistory.map((entry, index) => (
                    <li key={index}>{entry}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title={t("patients.confirm.deleteTitle", "Delete patient record")}
        confirmLabel={t("action.deletePermanently", "Delete permanently")}
        message={
          deleteTarget
            ? `Permanently delete the record for ${deleteTarget.name}? This cannot be undone.`
            : ""
        }
      />
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-slate-400">{label}</p>
      <p className="font-medium mt-0.5 truncate">{value || "—"}</p>
    </div>
  );
}

function Field2({ label, required, error, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-red-600 mt-1.5">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-400 mt-1.5">{hint}</p>
      ) : null}
    </div>
  );
}

function Detail({ icon: Icon, label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-slate-400 flex items-center gap-1">
        {Icon && <Icon size={11} />}
        {label}
      </p>
      <p className="font-medium mt-0.5 truncate">{value || "—"}</p>
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
