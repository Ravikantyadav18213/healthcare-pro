import React, { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiLayers,
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiUsers,
  FiUserCheck,
  FiRefreshCw,
} from "react-icons/fi";

import { departmentService } from "../services/adminService.js";
import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";
import { useDebouncedValue } from "../hooks/useApi.js";
import { Modal, ConfirmDialog } from "../components/ui/Modal.jsx";
import { Alert, EmptyState, ErrorState, Spinner } from "../components/ui/States.jsx";
import { Skeleton } from "../components/ui/Skeleton.jsx";
import SelectDropdown from "../components/ui/SelectDropdown.jsx";
import { padRefresh } from "../utils/timing.js";

const EMPTY_FORM = {
  name: "",
  description: "",
  headDoctor: "",
  status: "active",
};

export default function Departments() {
  const { search: navbarSearch } = useOutletContext() || {};
  const toast = useToast();
  const t = useT();

  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const term = useDebouncedValue(navbarSearch || "", 300);

  const load = useCallback(async (isRefresh = false) => {
    const startedAt = Date.now();
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError(null);

    try {
      const data = await departmentService.list({ includeInactive: true });
      setDepartments(data.departments);
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

  const visible = departments.filter((department) =>
    !term ? true : department.name.toLowerCase().includes(term.toLowerCase())
  );

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (department) => {
    setEditing(department);
    setForm({
      name: department.name,
      description: department.description || "",
      headDoctor: department.headDoctor || "",
      status: department.status,
    });
    setFormError("");
    setModalOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError("");

    try {
      if (editing) {
        await departmentService.update(editing.id, form);
        toast.success(`${form.name} updated.`);
      } else {
        await departmentService.create(form);
        toast.success(`${form.name} created.`);
      }

      setModalOpen(false);
      load(true);
    } catch (caught) {
      setFormError(caught.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);

    try {
      await departmentService.remove(deleteTarget.id);
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

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-xl font-bold">{t("departments.title", "Departments")}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {loading
              ? t("departments.loading", "Loading departments...")
              : `${departments.length} ${
                  departments.length === 1
                    ? t("departments.departmentOne", "department")
                    : t("departments.departmentMany", "departments")
                } ${t("departments.configured", "configured")}`}
          </p>
        </div>

        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => load(true)}
            aria-label="Refresh departments"
            className="btn-secondary text-sm inline-flex items-center justify-center gap-2"
          >
            <FiRefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          </button>

          <button
            type="button"
            onClick={openAdd}
            className="btn-primary text-sm inline-flex items-center justify-center gap-2"
          >
            <FiPlus size={16} />
            {t("departments.addDepartment", "Add Department")}
          </button>
        </div>
      </motion.div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <div className="glass-card">
          <ErrorState error={error} onRetry={() => load()} />
        </div>
      ) : visible.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={FiLayers}
            title={t("departments.empty.title", "No departments found")}
            description={t(
              "departments.empty.description",
              "Create a department so doctors and patients can be grouped."
            )}
            action={openAdd}
            actionLabel={t("departments.addDepartment", "Add Department")}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((department, index) => (
            <motion.article
              key={department.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.26, delay: Math.min(index * 0.04, 0.3) }}
              className="glass-card flex flex-col hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="w-11 h-11 rounded-xl bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-300 flex items-center justify-center">
                  <FiLayers size={20} />
                </div>

                {department.status === "inactive" && (
                  <span className="badge bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                    {t("label.inactive", "Inactive")}
                  </span>
                )}
              </div>

              <h2 className="font-semibold mt-4">{department.name}</h2>

              {department.description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-5 mt-1.5 line-clamp-2">
                  {department.description}
                </p>
              )}

              <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <span className="inline-flex items-center gap-1.5">
                  <FiUserCheck size={13} />
                  {department.doctors}{" "}
                  {department.doctors === 1
                    ? t("departments.doctorOne", "doctor")
                    : t("departments.doctorMany", "doctors")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <FiUsers size={13} />
                  {department.patients}{" "}
                  {department.patients === 1
                    ? t("departments.patientOne", "patient")
                    : t("departments.patientMany", "patients")}
                </span>
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => openEdit(department)}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 inline-flex items-center justify-center gap-1 transition"
                >
                  <FiEdit2 size={12} />
                  {t("action.edit", "Edit")}
                </button>

                <button
                  type="button"
                  onClick={() => setDeleteTarget(department)}
                  aria-label={`Delete ${department.name}`}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 transition"
                >
                  <FiTrash2 size={12} />
                </button>
              </div>
            </motion.article>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={
          editing
            ? t("departments.modal.editTitle", "Edit Department")
            : t("departments.addDepartment", "Add Department")
        }
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}

          <div>
            <label className="block text-sm font-medium mb-1.5">
              {t("label.name", "Name")} <span className="text-red-500">*</span>
            </label>
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Oncology"
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              {t("label.description", "Description")}
            </label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder={t(
                "departments.form.descriptionPlaceholder",
                "Cancer diagnosis, chemotherapy and follow-up care."
              )}
              className="input-field resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              {t("departments.form.headOfDepartment", "Head of department")}
            </label>
            <input
              value={form.headDoctor}
              onChange={(event) => setForm({ ...form, headDoctor: event.target.value })}
              placeholder="Dr. Meera Nair"
              className="input-field"
            />
          </div>

          {editing && (
            <div>
              <label className="block text-sm font-medium mb-1.5">
                {t("label.status", "Status")}
              </label>
              <SelectDropdown
                value={form.status}
                onChange={(value) => setForm({ ...form, status: value })}
                options={[
                  { value: "active", label: t("label.active", "Active") },
                  { value: "inactive", label: t("label.inactive", "Inactive") },
                ]}
                ariaLabel="Status"
                className="w-full"
              />
            </div>
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
                ? t("action.saving", "Saving...")
                : editing
                ? t("action.saveChanges", "Save Changes")
                : t("departments.addDepartment", "Add Department")}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title={t("departments.confirm.deleteTitle", "Delete department")}
        confirmLabel={t("action.delete", "Delete")}
        message={
          deleteTarget
            ? `Delete ${deleteTarget.name}? Departments with assigned doctors cannot be deleted.`
            : ""
        }
      />
    </div>
  );
}
