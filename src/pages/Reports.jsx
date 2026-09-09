import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiBarChart2,
  FiDownload,
  FiPlus,
  FiFileText,
  FiSearch,
  FiRefreshCw,
  FiTrash2,
  FiEdit2,
  FiPaperclip,
  FiUsers,
  FiDollarSign,
  FiCalendar,
  FiActivity,
  FiX,
} from "react-icons/fi";

import adminService from "../services/adminService.js";
import api from "../services/api.js";
import reportService, { REPORT_TYPES } from "../services/reportService.js";
import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";
import { useDebouncedValue } from "../hooks/useApi.js";
import { Modal, ConfirmDialog } from "../components/ui/Modal.jsx";
import { Alert, EmptyState, ErrorState, Spinner } from "../components/ui/States.jsx";
import { Skeleton, SkeletonCards } from "../components/ui/Skeleton.jsx";
import RowActionsMenu from "../components/ui/RowActionsMenu.jsx";
import DateRangePicker from "../components/ui/DateRangePicker.jsx";
import SelectDropdown from "../components/ui/SelectDropdown.jsx";
import DatePicker from "../components/ui/DatePicker.jsx";
import { padRefresh } from "../utils/timing.js";
import {
  RevenueLineChart,
  DepartmentPieChart,
  AppointmentsBarChart,
  StatusDoughnutChart,
  DoctorUtilisationChart,
} from "../components/Statistics.jsx";

const TABS = [
  { key: "analytics", tKey: "reports.tab.analytics", label: "Analytics" },
  { key: "records", tKey: "reports.tab.records", label: "Patient Reports" },
];

const DEFAULT_DAYS = 14;

const EMPTY_FORM = {
  userId: "",
  title: "",
  type: "Laboratory",
  description: "",
  result: "",
  status: "Completed",
  reportDate: new Date().toISOString().slice(0, 10),
};

export default function Reports() {
  const { search: navbarSearch } = useOutletContext() || {};
  const toast = useToast();
  const t = useT();

  /* Completed / Pending are UI wording, not free-text data. */
  const statusLabel = (value) =>
    t(`reports.status.${String(value).toLowerCase()}`, value);

  const [tab, setTab] = useState("analytics");

  /* ---- analytics ---- */
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState(null);
  const [days, setDays] = useState(DEFAULT_DAYS);

  /* "preset" keeps the original Last N Days behaviour; "range" pins
     the charts to one explicit start/end period picked from the
     calendar instead of a rolling window counted back from today. */
  const [periodMode, setPeriodMode] = useState("preset");
  const [customRange, setCustomRange] = useState({ from: null, to: null });

  const reportParams = useMemo(() => {
    if (periodMode === "range" && customRange.from && customRange.to) {
      return { mode: "range", from: customRange.from, to: customRange.to };
    }
    return { days };
  }, [periodMode, days, customRange]);

  const hasCustomFilter = periodMode !== "preset" || days !== DEFAULT_DAYS;

  const clearFilter = () => {
    setPeriodMode("preset");
    setDays(DEFAULT_DAYS);
    setCustomRange({ from: null, to: null });
  };

  /* ---- records ---- */
  const [records, setRecords] = useState([]);
  const [recordStats, setRecordStats] = useState(null);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState(null);
  const [users, setUsers] = useState([]);

  const [localSearch, setLocalSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const term = useDebouncedValue(localSearch || navbarSearch || "", 350);

  /* ---------------- analytics ---------------- */

  const loadAnalytics = useCallback(async () => {
    const startedAt = Date.now();
    setAnalyticsLoading(true);
    setAnalyticsError(null);

    try {
      setAnalytics(await adminService.hospitalReports(reportParams));
    } catch (caught) {
      setAnalyticsError(caught);
    } finally {
      await padRefresh(true, startedAt);
      setAnalyticsLoading(false);
    }
  }, [reportParams]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  /* ---------------- records ---------------- */

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    setRecordsError(null);

    try {
      const [reportData, userData] = await Promise.all([
        reportService.all({ search: term }),
        adminService.users({ role: "user" }),
      ]);

      setRecords(reportData.reports);
      setRecordStats(reportData.stats);
      setUsers(userData.users);
    } catch (caught) {
      setRecordsError(caught);
    } finally {
      setRecordsLoading(false);
    }
  }, [term]);

  useEffect(() => {
    if (tab === "records") loadRecords();
  }, [tab, loadRecords]);

  /* ---------------- CSV export ---------------- */

  const [exportingPdf, setExportingPdf] = useState(false);

  /* Same numbers as the CSV, laid out as a document the hospital can
     file or email. Streamed through axios so the auth cookie goes
     with it — a plain link would drop it. */
  const exportPdf = async () => {
    setExportingPdf(true);

    try {
      const params =
        reportParams.mode === "range"
          ? { from: reportParams.from, to: reportParams.to }
          : { days };

      const response = await api.get("/stats/reports/pdf", {
        params,
        responseType: "blob",
      });

      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `hospital-report-${analytics?.periodLabel || "latest"}.pdf`.replace(
        /[^\w.-]+/g,
        "-"
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      toast.success("Report PDF downloaded.");
    } catch (caught) {
      toast.error(caught.message || "Could not build the PDF.");
    } finally {
      setExportingPdf(false);
    }
  };

  const exportSummary = () => {
    if (!analytics) return;

    const rows = [
      ["HealthCare Pro — Hospital Summary"],
      ["Generated", new Date().toLocaleString()],
      [],
      ["Metric", "Value"],
      ["Total patients", analytics.overview.totalPatients],
      ["Active doctors", analytics.overview.totalDoctors],
      ["Appointments today", analytics.overview.appointmentsToday],
      ["ICU beds free", `${analytics.overview.icuBedsFree}/${analytics.overview.icuBedsTotal}`],
      ["Revenue today", analytics.overview.revenueToday],
      ["Emergency cases", analytics.overview.emergencyCases],
      ["Discharged today", analytics.overview.dischargedToday],
      [],
      ["Revenue trend"],
      ["Date", "Amount"],
      ...analytics.revenueTrend.labels.map((label, index) => [
        label,
        analytics.revenueTrend.values[index],
      ]),
      [],
      ["Patients by department"],
      ["Department", "Patients"],
      ...analytics.patientsByDepartment.labels.map((label, index) => [
        label,
        analytics.patientsByDepartment.values[index],
      ]),
      [],
      ["Appointments by day"],
      ["Date", "Appointments"],
      ...analytics.appointmentsByDay.labels.map((label, index) => [
        label,
        analytics.appointmentsByDay.values[index],
      ]),
      [],
      ["Appointment status"],
      ["Status", "Count"],
      ...analytics.appointmentStatus.labels.map((label, index) => [
        label,
        analytics.appointmentStatus.values[index],
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
    link.download = `healthcare-pro-summary-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    toast.success("Summary CSV downloaded.");
  };

  /* ---------------- record CRUD ---------------- */

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFile(null);
    setFormError("");
    setFieldErrors({});
    setModalOpen(true);
  };

  const openEdit = (report) => {
    setEditing(report);
    setForm({
      userId: report.userId,
      title: report.title,
      type: report.type,
      description: report.description || "",
      result: report.result || "",
      status: report.status,
      reportDate: report.reportDate,
    });
    setFile(null);
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
        await reportService.update(editing.id, form);
        toast.success("Report updated.");
      } else {
        await reportService.create(form, file);
        toast.success("Report published to the patient's account.");
      }

      setModalOpen(false);
      loadRecords();
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
      await reportService.remove(deleteTarget.id);
      toast.success("Report deleted.");
      setDeleteTarget(null);
      loadRecords();
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
          <h1 className="text-xl font-bold">
            {t("reports.title", "Reports & Analytics")}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t(
              "reports.subtitle",
              "Hospital-wide performance and patient report management."
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
            {tab === "analytics" ? (
              <>
                {periodMode === "range" ? (
                  <DateRangePicker
                    value={customRange}
                    onApply={(range) => setCustomRange(range)}
                    label={t("reports.customDateRange", "Custom Date Range")}
                  />
                ) : (
                  <SelectDropdown
                    value={String(days)}
                    ariaLabel="Reporting period"
                    options={[
                      { value: "7", label: t("reports.period.days7", "Last 7 days") },
                      { value: "14", label: t("reports.period.days14", "Last 14 days") },
                      { value: "30", label: t("reports.period.days30", "Last 30 days") },
                      {
                        value: "custom",
                        label: t("reports.period.custom", "Custom Range"),
                      },
                    ]}
                    onChange={(value) => {
                      if (value === "custom") {
                        setPeriodMode("range");
                        return;
                      }
                      setPeriodMode("preset");
                      setDays(Number(value));
                    }}
                  />
                )}

                {hasCustomFilter && (
                  <button
                    type="button"
                    onClick={clearFilter}
                    aria-label="Clear filter"
                    className="btn-secondary text-sm inline-flex items-center justify-center gap-2"
                  >
                    <FiX size={15} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={loadAnalytics}
                  aria-label="Refresh analytics"
                  className="btn-secondary text-sm inline-flex items-center justify-center gap-2"
                >
                  <FiRefreshCw size={15} className={analyticsLoading ? "animate-spin" : ""} />
                </button>

                <button
                  type="button"
                  onClick={exportSummary}
                  disabled={!analytics}
                  className="btn-secondary text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <FiDownload size={15} />
                  CSV
                </button>

                <button
                  type="button"
                  onClick={exportPdf}
                  disabled={!analytics || exportingPdf}
                  className="btn-primary text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {exportingPdf ? <Spinner size={14} /> : <FiFileText size={15} />}
                  {exportingPdf
                    ? t("reports.building", "Building...")
                    : t("reports.exportPdf", "Export PDF")}
                </button>
              </>
            ) : (
              <>
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    value={localSearch}
                    onChange={(event) => setLocalSearch(event.target.value)}
                    placeholder={t("reports.searchPlaceholder", "Search reports")}
                    aria-label="Search reports"
                    className="input-field input-icon w-full sm:w-56"
                  />
                </div>

                <button
                  type="button"
                  onClick={openAdd}
                  className="btn-primary text-sm inline-flex items-center justify-center gap-2"
                >
                  <FiPlus size={16} />
                  {t("reports.newReport", "New Report")}
                </button>
              </>
            )}
          </div>
      </motion.div>

      {/* ============ TABS ============ */}

      <div className="glass-card">
        <div className="flex gap-1.5">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                tab === item.key
                  ? "bg-brand-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {t(item.tKey, item.label)}
            </button>
          ))}
        </div>
      </div>

      {/* ============ ANALYTICS ============ */}

      {tab === "analytics" &&
        (analyticsError ? (
          <div className="glass-card">
            <ErrorState error={analyticsError} onRetry={loadAnalytics} />
          </div>
        ) : analyticsLoading ? (
          <>
            <SkeletonCards count={4} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="glass-card">
                  <Skeleton className="h-4 w-40 mb-4" />
                  <Skeleton className="h-[260px] rounded-xl" />
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <Metric
                icon={FiUsers}
                label={t("reports.metric.totalPatients", "Total Patients")}
                value={analytics.overview.totalPatients}
              />
              <Metric
                icon={FiCalendar}
                label={t("reports.metric.appointmentsToday", "Appointments Today")}
                value={analytics.overview.appointmentsToday}
              />
              <Metric
                icon={FiDollarSign}
                label={t("reports.metric.revenueToday", "Revenue Today")}
                value={`₹${Number(analytics.overview.revenueToday).toLocaleString("en-IN")}`}
              />
              <Metric
                icon={FiActivity}
                label={t("reports.metric.icuBedsFree", "ICU Beds Free")}
                value={`${analytics.overview.icuBedsFree}/${analytics.overview.icuBedsTotal}`}
              />
            </div>

            {/* Like-for-like against the window immediately before
                this one. Absent for month/year views, where the
                labels are not dates and no equal window exists. */}
            {analytics.comparison && (
              <div className="glass-card">
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
                  <h2 className="font-semibold text-sm">
                    {t(
                      "reports.comparedWith",
                      "Compared with the previous {days} days"
                    ).replace("{days}", analytics.comparison.spanDays)}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {analytics.comparison.previous.from} → {analytics.comparison.previous.to}
                  </p>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                  <Delta
                    label={t("reports.delta.revenue", "Revenue")}
                    metric={analytics.comparison.metrics.revenue}
                    money
                  />
                  <Delta
                    label={t("reports.delta.appointments", "Appointments")}
                    metric={analytics.comparison.metrics.appointments}
                  />
                  <Delta
                    label={t("reports.delta.completed", "Completed")}
                    metric={analytics.comparison.metrics.completed}
                  />
                  <Delta
                    label={t("reports.delta.cancelled", "Cancelled")}
                    metric={analytics.comparison.metrics.cancelled}
                    invert
                  />
                  <Delta
                    label={t("reports.delta.newPatients", "New patients")}
                    metric={analytics.comparison.metrics.newPatients}
                  />
                  <Delta
                    label={t("reports.delta.labTests", "Lab tests")}
                    metric={analytics.comparison.metrics.labTests}
                  />
                </div>
              </div>
            )}

            <div className="glass-card">
              <h2 className="font-semibold text-sm mb-3">
                {t("reports.revenueTrend", "Revenue Trend")} —{" "}
                {analytics.periodLabel ||
                  t("reports.lastNDays", "Last {days} Days").replace(
                    "{days}",
                    days
                  )}
              </h2>
              <RevenueLineChart
                labels={analytics.revenueTrend.labels}
                values={analytics.revenueTrend.values}
                height={300}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="glass-card">
                <h2 className="font-semibold text-sm mb-3">
                  {t("reports.patientsByDepartment", "Patients by Department")}
                </h2>
                {analytics.patientsByDepartment.labels.length === 0 ? (
                  <EmptyState
                    icon={FiUsers}
                    title={t("reports.noPatientData", "No patient data")}
                    compact
                  />
                ) : (
                  <DepartmentPieChart
                    labels={analytics.patientsByDepartment.labels}
                    values={analytics.patientsByDepartment.values}
                  />
                )}
              </div>

              <div className="glass-card">
                <h2 className="font-semibold text-sm mb-3">
                  {t("reports.appointmentsPerDay", "Appointments per Day")}
                </h2>
                <AppointmentsBarChart
                  labels={analytics.appointmentsByDay.labels}
                  values={analytics.appointmentsByDay.values}
                />
              </div>

              <div className="glass-card">
                <h2 className="font-semibold text-sm mb-3">
                  {t(
                    "reports.appointmentStatusDistribution",
                    "Appointment Status Distribution"
                  )}
                </h2>
                {analytics.appointmentStatus.labels.length === 0 ? (
                  <EmptyState
                    icon={FiCalendar}
                    title={t("reports.noAppointmentsYet", "No appointments yet")}
                    compact
                  />
                ) : (
                  <StatusDoughnutChart
                    labels={analytics.appointmentStatus.labels}
                    values={analytics.appointmentStatus.values}
                  />
                )}
              </div>

              <div className="glass-card">
                <h2 className="font-semibold text-sm mb-3">
                  {t("reports.doctorUtilisation", "Doctor Utilisation")}
                </h2>
                <DoctorUtilisationChart
                  labels={analytics.doctorUtilisation.labels}
                  values={analytics.doctorUtilisation.values}
                />
              </div>
            </div>
          </>
        ))}

      {/* ============ RECORDS ============ */}

      {tab === "records" && (
        <>
          {recordStats && (
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              <Metric
                icon={FiFileText}
                label={t("reports.metric.totalReports", "Total Reports")}
                value={recordStats.total}
              />
              <Metric
                icon={FiBarChart2}
                label={t("reports.status.completed", "Completed")}
                value={recordStats.completed}
              />
              <Metric
                icon={FiActivity}
                label={t("reports.status.pending", "Pending")}
                value={recordStats.pending}
              />
            </div>
          )}

          {recordsLoading ? (
            <div className="glass-card space-y-3">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : recordsError ? (
            <div className="glass-card">
              <ErrorState error={recordsError} onRetry={loadRecords} />
            </div>
          ) : records.length === 0 ? (
            <div className="glass-card">
              <EmptyState
                icon={FiFileText}
                title={t("reports.empty.title", "No reports published")}
                description={t(
                  "reports.empty.description",
                  "Create a report and it appears instantly in the patient's portal."
                )}
                action={openAdd}
                actionLabel={t("reports.newReport", "New Report")}
              />
            </div>
          ) : (
            <div className="glass overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="border-b border-slate-200/60 dark:border-slate-700/60">
                    <tr>
                      {[
                        t("reports.col.report", "Report"),
                        t("label.patient", "Patient"),
                        t("reports.col.type", "Type"),
                        t("label.date", "Date"),
                        t("label.status", "Status"),
                        t("reports.col.file", "File"),
                        t("reports.col.actions", "Actions"),
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
                    {records.map((report) => (
                      <tr
                        key={report.id}
                        className="border-b border-slate-100/60 dark:border-slate-800/60 hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium truncate">{report.title}</p>
                          <p className="text-xs text-slate-400">RPT-{report.id}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                          <p className="truncate">{report.ownerName}</p>
                          <p className="text-xs truncate">{report.ownerEmail}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                          {report.type}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {report.reportDate}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`badge ${
                              report.status === "Completed"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                            }`}
                          >
                            {statusLabel(report.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {report.hasFile ? (
                            <span className="text-xs text-brand-600 dark:text-brand-400 inline-flex items-center gap-1">
                              <FiPaperclip size={12} />
                              {report.fileName?.slice(0, 18)}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <RowActionsMenu
                            label={`Actions for ${report.title}`}
                            items={[
                              {
                                key: "edit",
                                label: t("action.edit", "Edit"),
                                icon: FiEdit2,
                                onClick: () => openEdit(report),
                              },
                              {
                                key: "delete",
                                label: t("action.delete", "Delete"),
                                icon: FiTrash2,
                                tone: "danger",
                                onClick: () => setDeleteTarget(report),
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
          )}
        </>
      )}

      {/* ============ FORM ============ */}

      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={
          editing
            ? t("reports.modal.editTitle", "Edit Report")
            : t("reports.modal.createTitle", "New Patient Report")
        }
        description={
          editing
            ? t(
                "reports.modal.editDescription",
                "Changes are visible to the patient immediately."
              )
            : t(
                "reports.modal.createDescription",
                "The patient is notified as soon as the report is published."
              )
        }
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}

          {!editing && (
            <FormField
              label={t("reports.field.patientAccount", "Patient account")}
              required
              error={fieldErrors.userId}
            >
              <SelectDropdown
                value={form.userId}
                onChange={(value) => update("userId")({ target: { value } })}
                options={[
                  {
                    value: "",
                    label: t("reports.selectPatient", "Select a patient"),
                  },
                  ...users.map((row) => ({
                    value: String(row.id),
                    label: `${row.name} — ${row.email}`,
                  })),
                ]}
                ariaLabel="Patient account"
                className="w-full"
              />
            </FormField>
          )}

          <FormField
            label={t("reports.field.title", "Report title")}
            required
            error={fieldErrors.title}
          >
            <input
              value={form.title}
              onChange={update("title")}
              placeholder={t("reports.placeholder.title", "Complete Blood Count")}
              className="input-field"
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label={t("reports.col.type", "Type")}
              required
              error={fieldErrors.type}
            >
              <SelectDropdown
                value={form.type}
                onChange={(value) => update("type")({ target: { value } })}
                options={REPORT_TYPES.map((type) => ({ value: type, label: type }))}
                ariaLabel="Type"
                className="w-full"
              />
            </FormField>

            <FormField label={t("label.status", "Status")}>
              <SelectDropdown
                value={form.status}
                onChange={(value) => update("status")({ target: { value } })}
                options={[
                  {
                    value: "Pending",
                    label: t("reports.status.pending", "Pending"),
                  },
                  {
                    value: "Completed",
                    label: t("reports.status.completed", "Completed"),
                  },
                ]}
                ariaLabel="Status"
                className="w-full"
              />
            </FormField>
          </div>

          <FormField
            label={t("reports.field.reportDate", "Report date")}
            required
            error={fieldErrors.reportDate}
          >
            <DatePicker
              value={form.reportDate}
              onChange={(iso) => update("reportDate")({ target: { value: iso } })}
              placeholder={t("reports.selectDate", "Select date")}
              ariaLabel="Report date"
              required
              className="input-field input-icon w-full"
            />
          </FormField>

          <FormField label={t("reports.field.result", "Result summary")}>
            <textarea
              rows={2}
              value={form.result}
              onChange={update("result")}
              placeholder={t(
                "reports.placeholder.result",
                "All values within normal reference range."
              )}
              className="input-field resize-none"
            />
          </FormField>

          <FormField label={t("reports.field.notes", "Notes")}>
            <textarea
              rows={2}
              value={form.description}
              onChange={update("description")}
              placeholder={t(
                "reports.placeholder.notes",
                "Additional clinical notes for the patient."
              )}
              className="input-field resize-none"
            />
          </FormField>

          {!editing && (
            <FormField
              label={t("reports.field.file", "Attach file")}
              hint={t(
                "reports.hint.file",
                "PDF, image, DOCX, TXT or CSV up to 5 MB. Optional."
              )}
            >
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.docx"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className="input-field file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand-700 dark:file:bg-brand-950/40 dark:file:text-brand-300"
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
                ? t("reports.publishing", "Publishing...")
                : editing
                ? t("reports.saveChanges", "Save Changes")
                : t("reports.publishReport", "Publish Report")}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title={t("reports.confirm.deleteTitle", "Delete report")}
        confirmLabel={t("reports.confirm.deletePermanently", "Delete permanently")}
        message={
          deleteTarget
            ? t(
                "reports.confirm.deleteMessage",
                'Delete "{title}"? It will be removed from the patient\'s portal along with any attached file.'
              ).replace("{title}", deleteTarget.title)
            : ""
        }
      />
    </div>
  );
}

/**
 * One period-over-period figure.
 *
 * `invert` flips the colour meaning for metrics where up is bad —
 * more cancellations is not a green number.
 *
 * A null change means the previous window had nothing to compare
 * against; that is said in words rather than shown as +100%, which
 * would be a claim the data does not support.
 */
function Delta({ label, metric, money = false, invert = false }) {
  const t = useT();

  if (!metric) return null;

  const format = (value) =>
    money ? `₹${Number(value).toLocaleString("en-IN")}` : Number(value).toLocaleString("en-IN");

  const change = metric.change;
  const flat = change === 0;
  const good = change === null || flat ? null : invert ? change < 0 : change > 0;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
      <p className="text-[11px] text-slate-400 truncate">{label}</p>
      <p className="text-lg font-bold mt-0.5">{format(metric.current)}</p>

      {change === null ? (
        <p className="text-[11px] text-slate-400 mt-1">
          {t("reports.noPriorData", "No prior data")}
        </p>
      ) : (
        <p
          className={`text-[11px] mt-1 font-medium ${
            good === null
              ? "text-slate-400"
              : good
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {change > 0 ? "▲" : change < 0 ? "▼" : "—"} {Math.abs(change)}%
          <span className="text-slate-400 font-normal">
            {" "}
            {t("reports.vs", "vs")} {format(metric.previous)}
          </span>
        </p>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="glass-card">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-400 leading-tight break-words">{label}</p>
          <p className="text-lg sm:text-2xl font-bold mt-1 truncate">{value}</p>
        </div>

        <div className="w-10 h-10 shrink-0 rounded-xl bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-300 flex items-center justify-center">
          <Icon size={18} />
        </div>
      </div>
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
