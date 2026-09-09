import React, { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiUserCheck,
  FiStar,
  FiClock,
  FiPhone,
  FiMail,
  FiToggleLeft,
  FiToggleRight,
  FiRefreshCw,
} from "react-icons/fi";

import doctorService from "../services/doctorService.js";
import { departmentService } from "../services/adminService.js";
import { padRefresh } from "../utils/timing.js";
import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";
import { useDebouncedValue } from "../hooks/useApi.js";
import { Modal, ConfirmDialog } from "../components/ui/Modal.jsx";
import { Alert, EmptyState, ErrorState, Spinner } from "../components/ui/States.jsx";
import { Skeleton } from "../components/ui/Skeleton.jsx";
import SelectDropdown from "../components/ui/SelectDropdown.jsx";

const AVAILABILITY = ["Available", "In Surgery", "In Ward", "On Leave"];

/* Stored values stay English — only the rendered label is translated,
   so the filter and the API contract are unaffected. */
const AVAILABILITY_KEYS = {
  Available: "doctors.availability.available",
  "In Surgery": "doctors.availability.inSurgery",
  "In Ward": "doctors.availability.inWard",
  "On Leave": "doctors.availability.onLeave",
};

const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
  specialization: "",
  departmentId: "",
  qualification: "",
  experienceYears: "",
  consultationFee: "",
  bio: "",
  availability: "Available",
  slotMinutes: 30,
  status: "active",
};

export default function Doctors() {
  const { search: navbarSearch } = useOutletContext() || {};
  const toast = useToast();
  const t = useT();

  const availabilityLabel = (value) =>
    AVAILABILITY_KEYS[value] ? t(AVAILABILITY_KEYS[value], value) : value;

  const [doctors, setDoctors] = useState([]);
  const [specializations, setSpecializations] = useState([]);
  const [departments, setDepartments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [localSearch, setLocalSearch] = useState("");
  const [specialization, setSpecialization] = useState("All");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const term = useDebouncedValue(localSearch || navbarSearch || "", 350);

  useEffect(() => {
    departmentService
      .list()
      .then((data) => setDepartments(data.departments))
      .catch(() => setDepartments([]));
  }, []);

  const load = useCallback(
    async (isRefresh = false) => {
      const startedAt = Date.now();
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      setError(null);

      try {
        const data = await doctorService.list({
          search: term,
          specialization: specialization === "All" ? "" : specialization,
          includeInactive: true,
        });

        setDoctors(data.doctors);
        setSpecializations(data.specializations);
      } catch (caught) {
        setError(caught);
      } finally {
        await padRefresh(isRefresh, startedAt);
        setLoading(false);
        setRefreshing(false);
      }
    },
    [term, specialization]
  );

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setFieldErrors({});
    setModalOpen(true);
  };

  const openEdit = (doctor) => {
    setEditing(doctor);
    setForm({
      name: doctor.name,
      email: doctor.email,
      phone: doctor.phone || "",
      specialization: doctor.specialization,
      departmentId: doctor.departmentId || "",
      qualification: doctor.qualification || "",
      experienceYears: String(doctor.experienceYears ?? ""),
      consultationFee: String(doctor.consultationFee ?? ""),
      bio: doctor.bio || "",
      availability: doctor.availability,
      slotMinutes: doctor.slotMinutes,
      status: doctor.status,
    });
    setFormError("");
    setFieldErrors({});
    setModalOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();

    setSaving(true);
    setFormError("");
    setFieldErrors({});

    try {
      if (editing) {
        await doctorService.update(editing.id, form);
        toast.success(`${form.name} updated.`);
      } else {
        await doctorService.create(form);
        toast.success(`${form.name} added and is now bookable.`);
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

  const toggleStatus = async (doctor) => {
    const next = doctor.status === "active" ? "inactive" : "active";

    try {
      await doctorService.setStatus(doctor.id, next);
      toast.success(
        next === "active"
          ? `${doctor.name} is accepting appointments again.`
          : `${doctor.name} is no longer bookable.`
      );
      load(true);
    } catch (caught) {
      toast.error(caught.message);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);

    try {
      await doctorService.remove(deleteTarget.id);
      toast.success(`${deleteTarget.name} removed.`);
      setDeleteTarget(null);
      load(true);
    } catch (caught) {
      toast.error(caught.message);
      setDeleteTarget(null);
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
          <h1 className="text-xl font-bold">{t("doctors.title", "Doctors")}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {loading
              ? t("doctors.loading", "Loading medical staff...")
              : `${doctors.length} ${
                  doctors.length === 1
                    ? t("doctors.recordOne", "record")
                    : t("doctors.recordMany", "records")
                } ${t("doctors.inDatabase", "in the database")}`}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={localSearch}
              onChange={(event) => setLocalSearch(event.target.value)}
              placeholder={t("doctors.searchPlaceholder", "Search doctors")}
              aria-label="Search doctors"
              className="input-field input-icon w-full sm:w-56"
            />
          </div>

          <SelectDropdown
            value={specialization}
            onChange={setSpecialization}
            options={[
              {
                value: "All",
                label: t("doctors.allSpecialisations", "All specialisations"),
              },
              ...specializations.map((item) => ({ value: item, label: item })),
            ]}
            ariaLabel="Filter by specialisation"
            className="w-full sm:w-44"
          />

          <button
            type="button"
            onClick={() => load(true)}
            aria-label="Refresh doctors"
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
            {t("doctors.addDoctor", "Add Doctor")}
          </button>
        </div>
      </motion.div>

      {/* ============ GRID ============ */}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="glass-card space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-12 h-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-8 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="glass-card">
          <ErrorState error={error} onRetry={() => load()} />
        </div>
      ) : doctors.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={FiUserCheck}
            title={t("doctors.empty.title", "No doctors found")}
            description={t(
              "doctors.empty.description",
              "Add your first doctor and they become immediately bookable by patients."
            )}
            action={openAdd}
            actionLabel={t("doctors.addDoctor", "Add Doctor")}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {doctors.map((doctor, index) => (
            <motion.article
              key={doctor.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.26, delay: Math.min(index * 0.035, 0.3) }}
              className={`glass-card flex flex-col ${
                doctor.status === "inactive" ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 shrink-0 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white flex items-center justify-center font-bold">
                  {initials(doctor.name)}
                </div>

                <div className="min-w-0">
                  <h2 className="font-semibold text-sm truncate">{doctor.name}</h2>
                  <p className="text-xs text-slate-400 truncate">
                    {doctor.specialization}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-3">
                <span
                  className={`badge ${
                    doctor.availability === "Available"
                      ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  {availabilityLabel(doctor.availability)}
                </span>

                {doctor.status === "inactive" && (
                  <span className="badge bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                    {t("doctors.deactivated", "Deactivated")}
                  </span>
                )}
              </div>

              <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400 mt-3">
                <p className="flex items-center gap-1.5 truncate">
                  <FiMail size={11} className="shrink-0" />
                  {doctor.email}
                </p>
                <p className="flex items-center gap-1.5 truncate">
                  <FiPhone size={11} className="shrink-0" />
                  {doctor.phone || "—"}
                </p>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <span className="inline-flex items-center gap-1">
                  <FiStar className="text-amber-400" size={12} />
                  {doctor.rating}
                </span>
                <span className="inline-flex items-center gap-1">
                  <FiClock size={12} />
                  {doctor.experienceYears} {t("doctors.yrs", "yrs")}
                </span>
                <span className="font-semibold text-brand-600 dark:text-brand-400">
                  ₹{Number(doctor.consultationFee).toLocaleString("en-IN")}
                </span>
              </div>

              <div className="flex items-center gap-1.5 mt-4">
                <button
                  type="button"
                  onClick={() => openEdit(doctor)}
                  className="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/70 inline-flex items-center justify-center gap-1 transition"
                >
                  <FiEdit2 size={12} />
                  {t("action.edit", "Edit")}
                </button>

                <button
                  type="button"
                  onClick={() => toggleStatus(doctor)}
                  aria-label={
                    doctor.status === "active" ? "Deactivate doctor" : "Activate doctor"
                  }
                  className="px-2 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition"
                >
                  {doctor.status === "active" ? (
                    <FiToggleRight size={14} />
                  ) : (
                    <FiToggleLeft size={14} />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setDeleteTarget(doctor)}
                  aria-label="Delete doctor"
                  className="px-2 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70 transition"
                >
                  <FiTrash2 size={12} />
                </button>
              </div>
            </motion.article>
          ))}
        </div>
      )}

      {/* ============ FORM ============ */}

      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={
          editing
            ? t("doctors.modal.editTitle", "Edit Doctor")
            : t("doctors.addDoctor", "Add Doctor")
        }
        description={
          editing
            ? t(
                "doctors.modal.editDescription",
                "Changes apply immediately across the hospital."
              )
            : t(
                "doctors.modal.addDescription",
                "A standard Mon–Sat clinic schedule is created automatically."
              )
        }
        size="lg"
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label={t("label.fullName", "Full name")}
              required
              error={fieldErrors.name}
            >
              <input
                value={form.name}
                onChange={update("name")}
                placeholder="Dr. Neha Kapoor"
                className="input-field"
              />
            </FormField>

            <FormField
              label={t("label.email", "Email")}
              required
              error={fieldErrors.email}
            >
              <input
                type="email"
                value={form.email}
                onChange={update("email")}
                placeholder="neha.kapoor@healthcarepro.io"
                className="input-field"
              />
            </FormField>

            <FormField label={t("label.phone", "Phone")} error={fieldErrors.phone}>
              <input
                value={form.phone}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, "").slice(0, 10);
                  setForm((current) => ({ ...current, phone: digits }));
                  setFieldErrors((current) => ({ ...current, phone: undefined }));
                }}
                maxLength={10}
                inputMode="numeric"
                placeholder="+91 98200 00000"
                className="input-field"
              />
            </FormField>

            <FormField
              label={t("doctors.form.specialization", "Specialization")}
              required
              error={fieldErrors.specialization}
            >
              <input
                value={form.specialization}
                onChange={update("specialization")}
                placeholder="Oncology"
                className="input-field"
              />
            </FormField>

            <FormField label={t("label.department", "Department")}>
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
            </FormField>

            <FormField label={t("doctors.form.qualification", "Qualification")}>
              <input
                value={form.qualification}
                onChange={update("qualification")}
                placeholder="MBBS, MD (Oncology)"
                className="input-field"
              />
            </FormField>

            <FormField
              label={t("doctors.form.experienceYears", "Experience (years)")}
              error={fieldErrors.experienceYears}
            >
              <input
                type="number"
                min="0"
                max="70"
                value={form.experienceYears}
                onChange={update("experienceYears")}
                placeholder="7"
                className="input-field"
              />
            </FormField>

            <FormField
              label={t("doctors.form.consultationFee", "Consultation fee (₹)")}
              error={fieldErrors.consultationFee}
            >
              <input
                type="number"
                min="0"
                value={form.consultationFee}
                onChange={update("consultationFee")}
                placeholder="1200"
                className="input-field"
              />
            </FormField>

            <FormField label={t("doctors.form.availability", "Availability")}>
              <SelectDropdown
                value={form.availability}
                onChange={(value) => update("availability")({ target: { value } })}
                options={AVAILABILITY.map((item) => ({
                  value: item,
                  label: availabilityLabel(item),
                }))}
                ariaLabel="Availability"
                className="w-full"
              />
            </FormField>

            <FormField
              label={t("doctors.form.slotLength", "Slot length (minutes)")}
              hint={t(
                "doctors.form.slotLengthHint",
                "Controls how appointment times are generated."
              )}
            >
              <SelectDropdown
                value={String(form.slotMinutes)}
                onChange={(value) => update("slotMinutes")({ target: { value } })}
                options={[15, 20, 30, 45, 60].map((value) => ({
                  value: String(value),
                  label: `${value} ${t("doctors.form.minutes", "minutes")}`,
                }))}
                ariaLabel="Slot length"
                className="w-full"
              />
            </FormField>
          </div>

          <FormField label={t("doctors.form.profileSummary", "Profile summary")}>
            <textarea
              rows={3}
              value={form.bio}
              onChange={update("bio")}
              placeholder={t(
                "doctors.form.profileSummaryPlaceholder",
                "Short description shown to patients when booking."
              )}
              className="input-field resize-none"
            />
          </FormField>

          {editing && (
            <FormField label={t("doctors.form.accountStatus", "Account status")}>
              <SelectDropdown
                value={form.status}
                onChange={(value) => update("status")({ target: { value } })}
                options={[
                  {
                    value: "active",
                    label: t(
                      "doctors.status.activeOption",
                      "Active — accepting appointments"
                    ),
                  },
                  {
                    value: "inactive",
                    label: t(
                      "doctors.status.inactiveOption",
                      "Inactive — hidden from patients"
                    ),
                  },
                ]}
                ariaLabel="Account status"
                className="w-full"
              />
            </FormField>
          )}

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
                ? editing
                  ? t("action.saving", "Saving...")
                  : t("doctors.addingDoctor", "Adding doctor...")
                : editing
                ? t("action.saveChanges", "Save Changes")
                : t("doctors.addDoctor", "Add Doctor")}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title={t("doctors.confirm.deleteTitle", "Delete doctor")}
        confirmLabel={t("action.deletePermanently", "Delete permanently")}
        message={
          deleteTarget
            ? `Permanently remove ${deleteTarget.name} from the hospital? If they have active appointments the deletion will be blocked — deactivate them instead.`
            : ""
        }
      />
    </div>
  );
}

function FormField({ label, required, error, hint, children }) {
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

function initials(name) {
  return String(name || "")
    .replace(/^Dr\.?\s*/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
