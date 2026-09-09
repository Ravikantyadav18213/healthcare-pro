import React, { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiFileText,
  FiDownload,
  FiCheckCircle,
  FiClock,
  FiSearch,
  FiRefreshCw,
  FiUser,
  FiLayers,
} from "react-icons/fi";

import reportService from "../services/reportService.js";
import { useAuth } from "../hooks/useAuth.js";
import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";
import { useDebouncedValue } from "../hooks/useApi.js";
import { EmptyState, ErrorState, Spinner } from "../components/ui/States.jsx";
import { SkeletonList } from "../components/ui/Skeleton.jsx";
import SelectDropdown from "../components/ui/SelectDropdown.jsx";
import { documentService } from "../services/clinicalService.js";
import { padRefresh } from "../utils/timing.js";

const FILTERS = ["All", "Completed", "Pending"];

/* Filter values are sent to the API verbatim, so only the label is translated. */
const FILTER_KEYS = {
  All: "userReports.filter.all",
  Completed: "userReports.filter.completed",
  Pending: "userReports.filter.pending",
};

export default function UserReports() {
  const { user } = useAuth();
  const toast = useToast();
  const t = useT();
  const { search: navbarSearch } = useOutletContext() || {};

  const [status, setStatus] = useState("All");
  const [localSearch, setLocalSearch] = useState("");

  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(null);
  const [pdfFor, setPdfFor] = useState(null);

  const downloadPdf = async (report) => {
    setPdfFor(report.id);

    try {
      const name = await documentService.reportPdf(report.id);
      toast.success(`Downloaded ${name}`);
    } catch (caught) {
      toast.error(caught.message || "Could not build that PDF.");
    } finally {
      setPdfFor(null);
    }
  };

  const term = useDebouncedValue(localSearch || navbarSearch || "", 350);

  const load = useCallback(async () => {
    const startedAt = Date.now();
    setLoading(true);
    setError(null);

    try {
      const data = await reportService.mine({
        status: status === "All" ? "" : status,
        search: term,
      });
      setReports(data.reports);
      setStats(data.stats);
    } catch (caught) {
      setError(caught);
    } finally {
      await padRefresh(true, startedAt);
      setLoading(false);
    }
  }, [status, term]);

  useEffect(() => {
    load();
  }, [load]);

  /*
   * Reports with an uploaded file stream from the API. Reports
   * recorded without an attachment are rendered client-side from the
   * data the user is already allowed to see.
   */
  const download = async (report) => {
    setDownloading(report.id);

    try {
      if (report.hasFile) {
        const name = await reportService.download(report.id, `${report.title}.pdf`);
        toast.success(`Downloaded ${name}`);
        return;
      }

      const lines = [
        "HEALTHCARE PRO — PATIENT REPORT",
        "=========================================",
        "",
        `Reference     : RPT-${report.id}`,
        `Title         : ${report.title}`,
        `Type          : ${report.type}`,
        `Status        : ${report.status}`,
        `Report date   : ${formatDate(report.reportDate)}`,
        "",
        `Patient       : ${user?.name || "—"}`,
        `Email         : ${user?.email || "—"}`,
        "",
        "FINDINGS",
        "-----------------------------------------",
        report.result || "No result recorded.",
        "",
        "NOTES",
        "-----------------------------------------",
        report.description || "No additional notes.",
        "",
        "-----------------------------------------",
        `Generated ${new Date().toLocaleString()}`,
      ];

      const blob = new Blob([lines.join("\n")], {
        type: "text/plain;charset=utf-8",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `RPT-${report.id}-${report.title
        .toLowerCase()
        .replace(/\s+/g, "-")}.txt`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      toast.success("Report downloaded.");
    } catch (caught) {
      toast.error(caught.message || "Download failed.");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-5">

      {/* ============ HEADER ============ */}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
      >
        <div>
          <p className="text-sm text-slate-400">{t("nav.myReports", "My Reports")}</p>
          <h1 className="text-2xl font-bold mt-1">
            {t("userReports.title", "Medical Reports")}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            {stats
              ? `${t(
                  stats.total === 1
                    ? "userReports.summary.reportOne"
                    : "userReports.summary.reportMany",
                  stats.total === 1 ? "{count} report" : "{count} reports"
                ).replace("{count}", stats.total)} · ${t(
                  "userReports.summary.completed",
                  "{count} completed"
                ).replace("{count}", stats.completed)} · ${t(
                  "userReports.summary.pending",
                  "{count} pending"
                ).replace("{count}", stats.pending)}`
              : t("userReports.linkedTo", "Records linked to {account}").replace(
                  "{account}",
                  user?.email || t("userReports.yourAccount", "your account")
                )}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <FiSearch
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              type="text"
              value={localSearch}
              onChange={(event) => setLocalSearch(event.target.value)}
              placeholder={t("userReports.searchPlaceholder", "Search my reports")}
              aria-label="Search my reports"
              className="input-field input-icon w-full sm:w-56"
            />
          </div>

          <SelectDropdown
            value={status}
            onChange={setStatus}
            options={FILTERS.map((item) => ({
              value: item,
              label: t(FILTER_KEYS[item], item),
            }))}
            ariaLabel="Filter by status"
            className="w-full sm:w-36"
          />

          <button
            type="button"
            onClick={load}
            aria-label="Refresh reports"
            className="btn-secondary text-sm inline-flex items-center justify-center gap-2"
          >
            <FiRefreshCw size={15} className={loading ? "animate-spin" : ""} />
            <span className="sm:hidden lg:inline">
              {t("action.refresh", "Refresh")}
            </span>
          </button>
        </div>
      </motion.div>

      {/* ============ LIST ============ */}

      {loading ? (
        <div className="glass-card">
          <p className="text-sm text-slate-400 mb-4">
            {t("userReports.loading", "Loading reports...")}
          </p>
          <SkeletonList count={3} />
        </div>
      ) : error ? (
        <div className="glass-card">
          <ErrorState error={error} onRetry={load} />
        </div>
      ) : reports.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={FiFileText}
            title={t("userReports.empty.title", "No reports available")}
            description={t(
              "userReports.empty.description",
              "When the hospital publishes a lab result or consultation summary for you, it will appear here."
            )}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {reports.map((report, index) => {
            const completed = report.status === "Completed";

            return (
              <motion.article
                key={report.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: index * 0.04 }}
                className="glass-card hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center ${
                        completed
                          ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                          : "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {completed ? <FiCheckCircle size={20} /> : <FiClock size={20} />}
                    </div>

                    <div className="min-w-0">
                      <h2 className="font-semibold truncate">{report.title}</h2>
                      <p className="text-xs text-slate-400 mt-1">
                        RPT-{report.id} · {formatDate(report.reportDate)}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`badge shrink-0 ${
                      completed
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                    }`}
                  >
                    {report.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-5 text-xs">
                  <Detail
                    icon={FiLayers}
                    label={t("userReports.label.type", "Type")}
                    value={report.type}
                  />
                  <Detail
                    icon={FiUser}
                    label={t("label.patient", "Patient")}
                    value={report.patientName || user?.name}
                  />
                </div>

                {report.result && (
                  <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                      {t("userReports.result", "Result")}
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-200 leading-6">
                      {report.result}
                    </p>
                  </div>
                )}

                {report.description && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-6 mt-3 line-clamp-3">
                    {report.description}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 mt-5">
                  <button
                    type="button"
                    onClick={() => download(report)}
                    disabled={downloading === report.id}
                    className="btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-60"
                  >
                    {downloading === report.id ? (
                      <Spinner size={14} />
                    ) : (
                      <FiDownload size={15} />
                    )}
                    {downloading === report.id
                      ? t("userReports.preparing", "Preparing...")
                      : t("userReports.downloadReport", "Download Report")}
                  </button>

                  {/* The attachment above is whatever was uploaded; this
                      is the hospital's own formatted document. */}
                  <button
                    type="button"
                    onClick={() => downloadPdf(report)}
                    disabled={pdfFor === report.id}
                    className="btn-secondary text-sm inline-flex items-center gap-2 disabled:opacity-60"
                  >
                    {pdfFor === report.id ? <Spinner size={14} /> : <FiFileText size={15} />}
                    PDF
                  </button>
                </div>
              </motion.article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Detail({ icon: Icon, label, value }) {
  return (
    <div>
      <p className="text-slate-400 flex items-center gap-1.5">
        <Icon size={11} />
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
