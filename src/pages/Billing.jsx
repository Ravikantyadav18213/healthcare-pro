import React, { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiFileText,
  FiPlus,
  FiSearch,
  FiRefreshCw,
  FiDollarSign,
  FiCheckCircle,
  FiClock,
  FiDownload,
} from "react-icons/fi";

import { billingService, patientService } from "../services/adminService.js";
import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";
import { useDebouncedValue } from "../hooks/useApi.js";
import { Modal } from "../components/ui/Modal.jsx";
import { Alert, EmptyState, ErrorState, Spinner } from "../components/ui/States.jsx";
import { SkeletonTable } from "../components/ui/Skeleton.jsx";
import SelectDropdown from "../components/ui/SelectDropdown.jsx";
import PayInvoiceButton from "../components/PayInvoiceButton.jsx";
import { formatCurrency } from "../utils/format.js";
import { padRefresh } from "../utils/timing.js";

const EMPTY_FORM = {
  patient: "",
  patientId: "",
  amount: "",
  gst: "",
  discount: "",
  insurance: "None",
  status: "Pending",
  date: new Date().toISOString().slice(0, 10),
};

export default function Billing() {
  const { search: navbarSearch } = useOutletContext() || {};
  const toast = useToast();
  const t = useT();

  /* Paid / Pending / Cancelled are UI wording, not free-text data, so
     they are translated at the point of display. */
  const statusLabel = (value) =>
    t(`billing.status.${String(value).toLowerCase()}`, value);

  const [invoices, setInvoices] = useState([]);
  const [totals, setTotals] = useState(null);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [localSearch, setLocalSearch] = useState("");
  const [status, setStatus] = useState("All");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  /* Set only while editing an existing invoice — same form, same
     modal, but the submit handler PATCHes instead of POSTs, and the
     patient/status fields lock, since only a still-Pending invoice's
     numbers should ever change this way. */
  const [editingInvoice, setEditingInvoice] = useState(null);

  const openCreate = () => {
    setEditingInvoice(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (invoice) => {
    setEditingInvoice(invoice);
    setForm({
      patient: invoice.patient,
      patientId: invoice.patientId ? String(invoice.patientId) : "",
      amount: String(invoice.amount),
      gst: String(invoice.gst),
      discount: String(invoice.discount),
      insurance: invoice.insurance || "None",
      status: invoice.status,
      date: invoice.date,
    });
    setFormError("");
    setModalOpen(true);
  };

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
        const data = await billingService.list({ search: term, status });
        setInvoices(data.items);
        setTotals(data.totals);
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

  /* The invoice being paid at the counter, or null when that dialog
     is closed. Cash/Card/UPI all go through the same recording step —
     only the method differs — so one modal covers all three instead
     of three near-identical buttons. */
  const [counterInvoice, setCounterInvoice] = useState(null);
  const [counterMethod, setCounterMethod] = useState("Cash");
  const [collecting, setCollecting] = useState(false);

  const openCounterPayment = (invoice) => {
    setCounterMethod("Cash");
    setCounterInvoice(invoice);
  };

  const confirmCounterPayment = async () => {
    setCollecting(true);

    try {
      await billingService.collectAtCounter(counterInvoice.id, counterMethod);
      toast.success(`${counterInvoice.invoiceNo} marked paid (${counterMethod}).`);
      setCounterInvoice(null);
      load(true);
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setCollecting(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError("");

    try {
      if (editingInvoice) {
        const updated = await billingService.update(editingInvoice.id, form);
        toast.success(`Invoice ${updated.invoice.invoiceNo} updated.`);
      } else {
        const created = await billingService.create(form);
        toast.success(`Invoice ${created.invoice.invoiceNo} created.`);
      }

      setModalOpen(false);
      setEditingInvoice(null);
      setForm(EMPTY_FORM);
      load(true);
    } catch (caught) {
      setFormError(caught.message);
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const rows = [
      ["Invoice", "Patient", "Amount", "GST", "Discount", "Total", "Insurance", "Status", "Date"],
      ...invoices.map((invoice) => [
        invoice.invoiceNo,
        invoice.patient,
        invoice.amount,
        invoice.gst,
        invoice.discount,
        invoice.total,
        invoice.insurance,
        invoice.status,
        invoice.date,
      ]),
    ];

    const csv = rows
      .map((row) =>
        row
          .map((cell) => {
            const text = String(cell ?? "");
            return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
          })
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    toast.success("Invoice list exported.");
  };

  const preview = {
    amount: Number(form.amount) || 0,
    gst: Number(form.gst) || 0,
    discount: Number(form.discount) || 0,
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
          <h1 className="text-xl font-bold">{t("billing.title", "Billing")}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t(
              "billing.subtitle",
              "Invoices, collections and outstanding balances."
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
              placeholder={t("billing.searchPlaceholder", "Search invoices")}
              aria-label="Search invoices"
              className="input-field input-icon w-full sm:w-52"
            />
          </div>

          <SelectDropdown
            value={status}
            onChange={setStatus}
            options={[
              { value: "All", label: t("billing.filter.all", "All") },
              { value: "Paid", label: t("billing.status.paid", "Paid") },
              { value: "Pending", label: t("billing.status.pending", "Pending") },
              {
                value: "Cancelled",
                label: t("billing.status.cancelled", "Cancelled"),
              },
            ]}
            ariaLabel="Filter by status"
            className="w-full sm:w-36"
          />

          <button
            type="button"
            onClick={() => load(true)}
            aria-label="Refresh invoices"
            className="btn-secondary text-sm inline-flex items-center justify-center gap-2"
          >
            <FiRefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          </button>

          <button
            type="button"
            onClick={exportCsv}
            disabled={invoices.length === 0}
            className="btn-secondary text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <FiDownload size={15} />
            {t("billing.export", "Export")}
          </button>

          <button
            type="button"
            onClick={openCreate}
            className="btn-primary text-sm inline-flex items-center justify-center gap-2"
          >
            <FiPlus size={16} />
            {t("billing.newInvoice", "New Invoice")}
          </button>
        </div>
      </motion.div>

      {/* ============ TOTALS ============ */}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Summary
          icon={FiCheckCircle}
          label={t("billing.stat.collected", "Collected")}
          value={totals ? formatCurrency(totals.collected) : "—"}
          tone="emerald"
          loading={loading}
        />
        <Summary
          icon={FiClock}
          label={t("billing.stat.outstanding", "Outstanding")}
          value={totals ? formatCurrency(totals.outstanding) : "—"}
          tone="amber"
          loading={loading}
        />
        <Summary
          icon={FiFileText}
          label={t("billing.stat.totalInvoices", "Total Invoices")}
          value={totals ? totals.count : "—"}
          tone="brand"
          loading={loading}
        />
      </div>

      {/* ============ TABLE ============ */}

      {loading ? (
        <SkeletonTable rows={5} cols={7} />
      ) : error ? (
        <div className="glass-card">
          <ErrorState error={error} onRetry={() => load()} />
        </div>
      ) : invoices.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={FiFileText}
            title={t("billing.empty.title", "No invoices found")}
            description={t(
              "billing.empty.description",
              "Create an invoice to start tracking payments."
            )}
            action={openCreate}
            actionLabel={t("billing.newInvoice", "New Invoice")}
          />
        </div>
      ) : (
        <>
          <div className="glass overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="border-b border-slate-200/60 dark:border-slate-700/60">
                  <tr>
                    {[
                      t("billing.col.invoice", "Invoice"),
                      t("label.patient", "Patient"),
                      t("billing.col.amount", "Amount"),
                      t("billing.col.gst", "GST"),
                      t("billing.col.discount", "Discount"),
                      t("billing.col.total", "Total"),
                      t("label.status", "Status"),
                      t("billing.col.actions", "Actions"),
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
                  {invoices.map((invoice) => (
                    <tr
                      key={invoice.id}
                      className="border-b border-slate-100/60 dark:border-slate-800/60 hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3 font-medium">{invoice.invoiceNo}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {invoice.patient}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {formatCurrency(invoice.amount)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {formatCurrency(invoice.gst)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {formatCurrency(invoice.discount)}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {formatCurrency(invoice.total)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`badge ${
                            invoice.status === "Paid"
                              ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                              : invoice.status === "Cancelled"
                              ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                          }`}
                        >
                          {statusLabel(invoice.status)}
                        </span>
                        {invoice.status === "Paid" && invoice.method && (
                          <p className="text-[11px] text-slate-400 mt-1">
                            {t("billing.via", "via")} {invoice.method}
                            {invoice.collectedBy ? ` · ${invoice.collectedBy}` : ""}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {invoice.status === "Pending" ? (
                          <div className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap">
                            {/* Renders nothing unless the server has
                                gateway keys configured. */}
                            <PayInvoiceButton invoice={invoice} onPaid={() => load(true)} />

                            <button
                              type="button"
                              onClick={() => openCounterPayment(invoice)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 transition"
                            >
                              {t("billing.recordPayment", "Record payment")}
                            </button>

                            <button
                              type="button"
                              onClick={() => openEdit(invoice)}
                              aria-label={`Edit ${invoice.invoiceNo}`}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition"
                            >
                              {t("action.edit", "Edit")}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="md:hidden space-y-3">
            {invoices.map((invoice, index) => (
              <motion.div
                key={invoice.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.03, 0.25), duration: 0.24 }}
                className="glass-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{invoice.invoiceNo}</p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {invoice.patient}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`badge ${
                        invoice.status === "Paid"
                          ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                      }`}
                    >
                      {statusLabel(invoice.status)}
                    </span>
                    {invoice.status === "Paid" && invoice.method && (
                      <p className="text-[11px] text-slate-400 mt-1">
                        {t("billing.via", "via")} {invoice.method}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 mt-3">
                  <div>
                    <p className="text-xs text-slate-400">
                      {t("billing.col.total", "Total")}
                    </p>
                    <p className="text-lg font-bold">{formatCurrency(invoice.total)}</p>
                  </div>

                  {invoice.status === "Pending" && (
                    <div className="flex flex-wrap gap-2">
                      <PayInvoiceButton invoice={invoice} onPaid={() => load(true)} />

                      <button
                        type="button"
                        onClick={() => openCounterPayment(invoice)}
                        className="px-3 py-2 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"
                      >
                        {t("billing.recordPayment", "Record payment")}
                      </button>

                      <button
                        type="button"
                        onClick={() => openEdit(invoice)}
                        aria-label={`Edit ${invoice.invoiceNo}`}
                        className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {t("action.edit", "Edit")}
                      </button>
                    </div>
                  )}
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
          editingInvoice
            ? `${t("billing.modal.editTitle", "Edit")} ${editingInvoice.invoiceNo}`
            : t("billing.newInvoice", "New Invoice")
        }
        description={
          editingInvoice
            ? t(
                "billing.modal.editDescription",
                "Only the numbers can change here — the patient and payment status can't."
              )
            : t(
                "billing.modal.createDescription",
                "The invoice number is generated automatically."
              )
        }
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}

          <Field label={t("label.patient", "Patient")} required>
            {editingInvoice ? (
              <p className="input-field flex items-center bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
                {form.patient}
              </p>
            ) : (
              <SelectDropdown
                value={form.patientId}
                onChange={(value) => {
                  const selected = patients.find((patient) => String(patient.id) === value);
                  setForm({ ...form, patientId: value, patient: selected?.name || "" });
                }}
                options={[
                  {
                    value: "",
                    label: t("billing.selectPatient", "Select a patient"),
                  },
                  ...patients.map((patient) => ({
                    value: String(patient.id),
                    label: patient.name,
                  })),
                ]}
                ariaLabel="Patient"
                className="w-full"
              />
            )}
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label={t("billing.field.amount", "Amount (₹)")} required>
              <input
                type="number"
                min="0"
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
                className="input-field"
              />
            </Field>

            <Field label={t("billing.field.gst", "GST (₹)")}>
              <input
                type="number"
                min="0"
                value={form.gst}
                onChange={(event) => setForm({ ...form, gst: event.target.value })}
                className="input-field"
              />
            </Field>

            <Field label={t("billing.field.discount", "Discount (₹)")}>
              <input
                type="number"
                min="0"
                value={form.discount}
                onChange={(event) => setForm({ ...form, discount: event.target.value })}
                className="input-field"
              />
            </Field>
          </div>

          <div className={editingInvoice ? "" : "grid grid-cols-1 sm:grid-cols-2 gap-3"}>
            <Field label={t("billing.field.insurance", "Insurance")}>
              <input
                value={form.insurance}
                onChange={(event) => setForm({ ...form, insurance: event.target.value })}
                className="input-field"
              />
            </Field>

            {/* Changing status here would mark an invoice Paid with no
                method and no collector on record — that's what the
                Record Payment flow is for. Editing only ever touches
                a still-Pending invoice, so there's nothing to pick. */}
            {!editingInvoice && (
              <Field label={t("label.status", "Status")}>
                <SelectDropdown
                  value={form.status}
                  onChange={(value) => setForm({ ...form, status: value })}
                  options={[
                    {
                      value: "Pending",
                      label: t("billing.status.pending", "Pending"),
                    },
                    { value: "Paid", label: t("billing.status.paid", "Paid") },
                  ]}
                  ariaLabel="Status"
                  className="w-full"
                />
              </Field>
            )}
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4 flex items-center justify-between">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {t("billing.invoiceTotal", "Invoice total")}
            </span>
            <span className="text-lg font-bold">
              {formatCurrency(preview.amount + preview.gst - preview.discount)}
            </span>
          </div>

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
                ? editingInvoice
                  ? t("billing.saving", "Saving...")
                  : t("billing.creating", "Creating...")
                : editingInvoice
                ? t("billing.saveChanges", "Save Changes")
                : t("billing.createInvoice", "Create Invoice")}
            </button>
          </div>
        </form>
      </Modal>

      {/* ============ COUNTER PAYMENT ============ */}

      <Modal
        open={Boolean(counterInvoice)}
        onClose={() => !collecting && setCounterInvoice(null)}
        title={t("billing.modal.recordPaymentTitle", "Record Payment")}
        description={
          counterInvoice
            ? `${counterInvoice.invoiceNo} — ${formatCurrency(counterInvoice.total)}`
            : undefined
        }
      >
        {counterInvoice && (
          <div className="space-y-4">
            <Field label={t("billing.howPaid", "How was it paid?")}>
              <SelectDropdown
                value={counterMethod}
                onChange={setCounterMethod}
                options={[
                  { value: "Cash", label: t("billing.method.cash", "Cash") },
                  {
                    value: "Card",
                    label: t("billing.method.card", "Card (counter machine)"),
                  },
                  {
                    value: "UPI",
                    label: t("billing.method.upi", "UPI (counter QR)"),
                  },
                ]}
                ariaLabel="Payment method"
                className="w-full"
              />
            </Field>

            <p className="text-xs text-slate-400">
              {t(
                "billing.counterNote",
                "This records that {patient} paid in person. Online payments through the Pay button are recorded automatically."
              ).replace("{patient}", counterInvoice.patient)}
            </p>

            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
              <button
                type="button"
                onClick={() => setCounterInvoice(null)}
                disabled={collecting}
                className="btn-secondary flex-1"
              >
                {t("action.cancel", "Cancel")}
              </button>

              <button
                type="button"
                onClick={confirmCounterPayment}
                disabled={collecting}
                className="btn-primary flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {collecting && <Spinner size={14} />}
                {collecting
                  ? t("billing.recording", "Recording...")
                  : t("billing.confirmPayment", "Confirm {method} Payment").replace(
                      "{method}",
                      counterMethod
                    )}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

const TONES = {
  emerald: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400",
  brand: "bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-300",
};

function Summary({ icon: Icon, label, value, tone, loading }) {
  return (
    <div className="glass-card">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-400">{label}</p>
          <p className="text-xl sm:text-2xl font-bold mt-1 truncate">
            {loading ? (
              <span className="inline-block h-7 w-24 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
            ) : (
              value
            )}
          </p>
        </div>

        <div className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center ${TONES[tone]}`}>
          <Icon size={19} />
        </div>
      </div>
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
