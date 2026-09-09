import React, { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiPackage,
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiAlertTriangle,
  FiRefreshCw,
} from "react-icons/fi";

import { pharmacyService } from "../services/adminService.js";
import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";
import { useDebouncedValue } from "../hooks/useApi.js";
import { Modal, ConfirmDialog } from "../components/ui/Modal.jsx";
import { Alert, EmptyState, ErrorState, Spinner } from "../components/ui/States.jsx";
import { SkeletonTable } from "../components/ui/Skeleton.jsx";
import RowActionsMenu from "../components/ui/RowActionsMenu.jsx";
import DatePicker from "../components/ui/DatePicker.jsx";
import { padRefresh } from "../utils/timing.js";

const EMPTY_FORM = {
  name: "",
  category: "",
  stock: "",
  price: "",
  supplier: "",
  expiry: "",
};

export default function Pharmacy() {
  const { search: navbarSearch } = useOutletContext() || {};
  const toast = useToast();
  const t = useT();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [localSearch, setLocalSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const term = useDebouncedValue(localSearch || navbarSearch || "", 350);

  const load = useCallback(
    async (isRefresh = false) => {
      const startedAt = Date.now();
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      setError(null);

      try {
        const data = await pharmacyService.list({ search: term });
        setItems(data.items);
      } catch (caught) {
        setError(caught);
      } finally {
        await padRefresh(isRefresh, startedAt);
        setLoading(false);
        setRefreshing(false);
      }
    },
    [term]
  );

  useEffect(() => {
    load();
  }, [load]);

  const lowStock = items.filter((item) => item.lowStock).length;

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      name: item.name,
      category: item.category || "",
      stock: String(item.stock),
      price: String(item.price),
      supplier: item.supplier || "",
      expiry: item.expiry || "",
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
        await pharmacyService.update(editing.id, form);
        toast.success(`${form.name} updated.`);
      } else {
        await pharmacyService.create(form);
        toast.success(`${form.name} added to inventory.`);
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
      await pharmacyService.remove(deleteTarget.id);
      toast.success(`${deleteTarget.name} removed.`);
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
            {t("pharmacy.title", "Pharmacy Inventory")}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {loading
              ? t("pharmacy.loading", "Loading inventory...")
              : `${(items.length === 1
                  ? t("pharmacy.countOne", "{count} item")
                  : t("pharmacy.countMany", "{count} items")
                ).replace("{count}", items.length)}${
                  lowStock
                    ? ` · ${t(
                        "pharmacy.lowStockSuffix",
                        "{count} low on stock"
                      ).replace("{count}", lowStock)}`
                    : ""
                }`}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={localSearch}
              onChange={(event) => setLocalSearch(event.target.value)}
              placeholder={t("pharmacy.searchPlaceholder", "Search medicines")}
              aria-label="Search pharmacy"
              className="input-field input-icon w-full sm:w-56"
            />
          </div>

          <button
            type="button"
            onClick={() => load(true)}
            aria-label="Refresh inventory"
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
            {t("pharmacy.addItem", "Add Item")}
          </button>
        </div>
      </motion.div>

      {lowStock > 0 && !loading && (
        <Alert tone="warning">
          <span className="inline-flex items-center gap-2">
            <FiAlertTriangle size={15} />
            {(lowStock === 1
              ? t(
                  "pharmacy.lowStockAlertOne",
                  "{count} item is at or below 50 units. Consider reordering."
                )
              : t(
                  "pharmacy.lowStockAlertMany",
                  "{count} items are at or below 50 units. Consider reordering."
                )
            ).replace("{count}", lowStock)}
          </span>
        </Alert>
      )}

      {loading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : error ? (
        <div className="glass-card">
          <ErrorState error={error} onRetry={() => load()} />
        </div>
      ) : items.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={FiPackage}
            title={t("pharmacy.empty.title", "No medicines found")}
            description={t(
              "pharmacy.empty.description",
              "Add stock so it can be dispensed and tracked."
            )}
            action={openAdd}
            actionLabel={t("pharmacy.addItem", "Add Item")}
          />
        </div>
      ) : (
        <>
          <div className="glass overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b border-slate-200/60 dark:border-slate-700/60">
                  <tr>
                    {[
                      t("pharmacy.col.medicine", "Medicine"),
                      t("pharmacy.col.category", "Category"),
                      t("pharmacy.col.stock", "Stock"),
                      t("pharmacy.col.unitPrice", "Unit price"),
                      t("pharmacy.col.supplier", "Supplier"),
                      t("pharmacy.col.expiry", "Expiry"),
                      t("pharmacy.col.actions", "Actions"),
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
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-slate-100/60 dark:border-slate-800/60 hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3 font-medium">{item.name}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {item.category || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`badge ${
                            item.lowStock
                              ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                              : "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                          }`}
                        >
                          {item.stock} {t("pharmacy.units", "units")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        ₹{Number(item.price).toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {item.supplier || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {item.expiry || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <RowActionsMenu
                          label={`Actions for ${item.name}`}
                          items={[
                            {
                              key: "edit",
                              label: t("action.edit", "Edit"),
                              icon: FiEdit2,
                              onClick: () => openEdit(item),
                            },
                            {
                              key: "delete",
                              label: t("action.delete", "Delete"),
                              icon: FiTrash2,
                              tone: "danger",
                              onClick: () => setDeleteTarget(item),
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
            {items.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.03, 0.25), duration: 0.24 }}
                className="glass-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{item.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{item.category}</p>
                  </div>

                  <span
                    className={`badge shrink-0 ${
                      item.lowStock
                        ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                        : "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                    }`}
                  >
                    {item.stock}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
                  <div>
                    <p className="text-slate-400">
                      {t("pharmacy.label.price", "Price")}
                    </p>
                    <p className="font-medium mt-0.5">
                      ₹{Number(item.price).toLocaleString("en-IN")}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">
                      {t("pharmacy.col.expiry", "Expiry")}
                    </p>
                    <p className="font-medium mt-0.5">{item.expiry || "—"}</p>
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300"
                  >
                    {t("action.edit", "Edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(item)}
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
            ? t("pharmacy.modal.editTitle", "Edit Item")
            : t("pharmacy.modal.createTitle", "Add Pharmacy Item")
        }
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}

          <Field label={t("pharmacy.field.name", "Medicine name")} required>
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder={t("pharmacy.placeholder.name", "Paracetamol 500mg")}
              className="input-field"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t("pharmacy.col.category", "Category")}>
              <input
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                placeholder={t("pharmacy.placeholder.category", "Analgesic")}
                className="input-field"
              />
            </Field>

            <Field label={t("pharmacy.col.supplier", "Supplier")}>
              <input
                value={form.supplier}
                onChange={(event) => setForm({ ...form, supplier: event.target.value })}
                placeholder={t(
                  "pharmacy.placeholder.supplier",
                  "MedLife Distributors"
                )}
                className="input-field"
              />
            </Field>

            <Field label={t("pharmacy.field.stock", "Stock (units)")}>
              <input
                type="number"
                min="0"
                value={form.stock}
                onChange={(event) => setForm({ ...form, stock: event.target.value })}
                className="input-field"
              />
            </Field>

            <Field label={t("pharmacy.field.unitPrice", "Unit price (₹)")}>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(event) => setForm({ ...form, price: event.target.value })}
                className="input-field"
              />
            </Field>
          </div>

          <Field label={t("pharmacy.field.expiry", "Expiry date")}>
            <DatePicker
              value={form.expiry}
              onChange={(iso) => setForm({ ...form, expiry: iso })}
              placeholder={t("pharmacy.selectExpiry", "Select expiry date")}
              ariaLabel="Expiry date"
              className="input-field input-icon w-full"
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
                ? t("pharmacy.saving", "Saving...")
                : editing
                ? t("pharmacy.saveChanges", "Save Changes")
                : t("pharmacy.addItem", "Add Item")}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title={t("pharmacy.confirm.removeTitle", "Remove inventory item")}
        confirmLabel={t("pharmacy.remove", "Remove")}
        message={
          deleteTarget
            ? t(
                "pharmacy.confirm.removeMessage",
                "Remove {name} from the pharmacy inventory?"
              ).replace("{name}", deleteTarget.name)
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
