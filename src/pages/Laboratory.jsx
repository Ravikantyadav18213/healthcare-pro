import React, { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiActivity,
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiRefreshCw,
} from "react-icons/fi";

import { laboratoryService, patientService } from "../services/adminService.js";
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

const STATUSES = ["Scheduled", "In Progress", "Completed", "Cancelled"];
const RESULTS = ["Pending", "Available", "Inconclusive"];

const EMPTY_FORM = {
  patient: "",
  patientId: "",
  test: "",
  category: "",
  price: "",
  date: new Date().toISOString().slice(0, 10),
  status: "Scheduled",
  result: "Pending",
};

/** "In Progress" → "inProgress", so status keys read as camelCase. */
function camel(value) {
  return String(value)
    .replace(/[^A-Za-z0-9]+(.)?/g, (_, letter) => (letter ? letter.toUpperCase() : ""))
    .replace(/^./, (letter) => letter.toLowerCase());
}

export default function Laboratory() {
  const { search: navbarSearch } = useOutletContext() || {};
  const toast = useToast();
  const t = useT();

  /* Statuses and results are fixed UI wording, not free-text data. */
  const statusLabel = (value) => t(`laboratory.status.${camel(value)}`, value);
  const resultLabel = (value) => t(`laboratory.result.${camel(value)}`, value);

  const [tests, setTests] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [localSearch, setLocalSearch] = useState("");
  const [status, setStatus] = useState("All");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const term = useDebouncedValue(localSearch || navbarSearch || "", 350);

  useEffect(() => {
    patientService
      .list()
      .then((data) => setPatients(data.patients))
      .catch(() => setPatients([]));
  }, []);

  const load = useCallback(
    async (isRefresh = false) => {
      const startedAt = Date.now();
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      setError(null);

      try {
        const data = await laboratoryService.list({ search: term, status });
        setTests(data.tests);
      } catch (caught) {
        setError(caught);
      } finally {
        await padRefresh(isRefresh, startedAt);
        setLoading(false);
        setRefreshing(false);
      }
    },
    [term, status]
  );

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (test) => {
    setEditing(test);
    setForm({
      patient: test.patient,
      patientId: test.patientId || "",
      test: test.test,
      category: test.category || "",
      price: String(test.price ?? ""),
      date: test.date || "",
      status: test.status,
      result: test.result,
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
        await laboratoryService.update(editing.id, form);
        toast.success("Test updated.");
      } else {
        await laboratoryService.create(form);
        toast.success("Laboratory test scheduled.");
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
      await laboratoryService.remove(deleteTarget.id);
      toast.success("Test removed.");
      setDeleteTarget(null);
      load(true);
    } catch (caught) {
      toast.error(caught.message);
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
        className="glass p-5 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4"
      >
        <div>
          <h1 className="text-xl font-bold">
            {t("laboratory.title", "Laboratory")}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {loading
              ? t("laboratory.loading", "Loading tests...")
              : (tests.length === 1
                  ? t("laboratory.countOne", "{count} test on record")
                  : t("laboratory.countMany", "{count} tests on record")
                ).replace("{count}", tests.length)}
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
                "laboratory.searchPlaceholder",
                "Search tests or patients"
              )}
              aria-label="Search laboratory tests"
              className="input-field input-icon w-full sm:w-56"
            />
          </div>

          <SelectDropdown
            value={status}
            onChange={setStatus}
            options={[
              { value: "All", label: t("laboratory.allStatuses", "All statuses") },
              ...STATUSES.map((item) => ({ value: item, label: statusLabel(item) })),
            ]}
            ariaLabel="Filter by status"
            className="w-full sm:w-40"
          />

          <button
            type="button"
            onClick={() => load(true)}
            aria-label="Refresh tests"
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
            {t("laboratory.newTest", "New Test")}
          </button>
        </div>
      </motion.div>

      {loading ? (
        <SkeletonTable rows={5} cols={6} />
      ) : error ? (
        <div className="glass-card">
          <ErrorState error={error} onRetry={() => load()} />
        </div>
      ) : tests.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={FiActivity}
            title={t("laboratory.empty.title", "No laboratory tests")}
            description={t(
              "laboratory.empty.description",
              "Schedule a test to start tracking its progress and result."
            )}
            action={openAdd}
            actionLabel={t("laboratory.newTest", "New Test")}
          />
        </div>
      ) : (
        <>
          <div className="glass overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-sm">
                <thead className="border-b border-slate-200/60 dark:border-slate-700/60">
                  <tr>
                    {[
                      t("label.patient", "Patient"),
                      t("laboratory.col.test", "Test"),
                      t("laboratory.col.category", "Category"),
                      t("label.date", "Date"),
                      t("label.status", "Status"),
                      t("laboratory.col.result", "Result"),
                      t("laboratory.col.actions", "Actions"),
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
                  {tests.map((test) => (
                    <tr
                      key={test.id}
                      className="border-b border-slate-100/60 dark:border-slate-800/60 hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3 font-medium">{test.patient}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {test.test}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {test.category || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {test.date || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${statusColor(test.status)}`}>
                          {statusLabel(test.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`badge ${
                            test.result === "Available"
                              ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                          }`}
                        >
                          {resultLabel(test.result)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <RowActionsMenu
                          label={`Actions for ${test.test}`}
                          items={[
                            {
                              key: "edit",
                              label: t("laboratory.editTest", "Edit test"),
                              icon: FiEdit2,
                              onClick: () => openEdit(test),
                            },
                            {
                              key: "delete",
                              label: t("laboratory.deleteTest", "Delete test"),
                              icon: FiTrash2,
                              tone: "danger",
                              onClick: () => setDeleteTarget(test),
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

          <div className="md:hidden space-y-3">
            {tests.map((test, index) => (
              <motion.div
                key={test.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.03, 0.25), duration: 0.24 }}
                className="glass-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{test.test}</p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{test.patient}</p>
                  </div>

                  <span className={`badge shrink-0 ${statusColor(test.status)}`}>
                    {statusLabel(test.status)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
                  <div>
                    <p className="text-slate-400">{t("label.date", "Date")}</p>
                    <p className="font-medium mt-0.5">{test.date || "—"}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">
                      {t("laboratory.col.result", "Result")}
                    </p>
                    <p className="font-medium mt-0.5">{resultLabel(test.result)}</p>
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => openEdit(test)}
                    className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300"
                  >
                    {t("action.edit", "Edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(test)}
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

      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={
          editing
            ? t("laboratory.modal.editTitle", "Edit Test")
            : t("laboratory.modal.createTitle", "Schedule Laboratory Test")
        }
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}

          {!editing && (
            <Field label={t("label.patient", "Patient")} required>
              <SelectDropdown
                value={form.patientId}
                onChange={(value) => {
                  const selected = patients.find((patient) => String(patient.id) === value);
                  setForm({ ...form, patientId: value, patient: selected?.name || "" });
                }}
                options={[
                  {
                    value: "",
                    label: t("laboratory.selectPatient", "Select a patient"),
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
          )}

          <Field label={t("laboratory.field.testName", "Test name")} required>
            <input
              value={form.test}
              onChange={(event) => setForm({ ...form, test: event.target.value })}
              placeholder={t(
                "laboratory.placeholder.testName",
                "Lipid Profile (Blood Test)"
              )}
              className="input-field"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t("laboratory.col.category", "Category")}>
              <input
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                placeholder={t("laboratory.placeholder.category", "Biochemistry")}
                className="input-field"
              />
            </Field>

            <Field label={t("laboratory.field.price", "Price (₹)")}>
              <input
                type="number"
                min="0"
                value={form.price}
                onChange={(event) => setForm({ ...form, price: event.target.value })}
                className="input-field"
              />
            </Field>

            <Field label={t("laboratory.field.testDate", "Test date")}>
              <DatePicker
                value={form.date}
                onChange={(iso) => setForm({ ...form, date: iso })}
                placeholder={t("laboratory.selectDate", "Select date")}
                ariaLabel="Test date"
                className="input-field input-icon w-full"
              />
            </Field>

            <Field label={t("label.status", "Status")}>
              <SelectDropdown
                value={form.status}
                onChange={(value) => setForm({ ...form, status: value })}
                options={STATUSES.map((item) => ({
                  value: item,
                  label: statusLabel(item),
                }))}
                ariaLabel="Status"
                className="w-full"
              />
            </Field>
          </div>

          <Field label={t("laboratory.col.result", "Result")}>
            <SelectDropdown
              value={form.result}
              onChange={(value) => setForm({ ...form, result: value })}
              options={RESULTS.map((item) => ({
                value: item,
                label: resultLabel(item),
              }))}
              ariaLabel="Result"
              className="w-full"
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
              className="btn-primary flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {saving && <Spinner size={14} />}
              {saving
                ? t("laboratory.saving", "Saving...")
                : editing
                ? t("laboratory.saveChanges", "Save Changes")
                : t("laboratory.scheduleTest", "Schedule Test")}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title={t("laboratory.confirm.deleteTitle", "Delete laboratory test")}
        confirmLabel={t("action.delete", "Delete")}
        message={
          deleteTarget
            ? t(
                "laboratory.confirm.deleteMessage",
                'Delete the record for "{test}"?'
              ).replace("{test}", deleteTarget.test)
            : ""
        }
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
