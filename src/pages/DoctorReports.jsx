import React, { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { FiFileText, FiSearch } from "react-icons/fi";

import doctorPortalService from "../services/doctorPortalService.js";
import { useDebouncedValue } from "../hooks/useApi.js";
import { useT } from "../context/LanguageContext.jsx";
import { EmptyState, ErrorState } from "../components/ui/States.jsx";
import { SkeletonList } from "../components/ui/Skeleton.jsx";
import { statusColor } from "../utils/format.js";

export default function DoctorReports() {
  const navigate = useNavigate();
  const t = useT();
  const { search: navbarSearch } = useOutletContext() || {};

  const [localSearch, setLocalSearch] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const term = useDebouncedValue(localSearch || navbarSearch || "", 350);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await doctorPortalService.myReports();
      setItems(data.items);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = term
    ? items.filter((r) =>
        `${r.title} ${r.patientName || ""} ${r.type}`.toLowerCase().includes(term.toLowerCase())
      )
    : items;

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-xl font-bold">{t("doctorReports.title", "Reports")}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t("doctorReports.subtitle", "Reports for patients under your care.")}
          </p>
        </div>

        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            value={localSearch}
            onChange={(event) => setLocalSearch(event.target.value)}
            placeholder={t("doctorReports.searchPlaceholder", "Search reports or patient")}
            aria-label="Search reports"
            className="input-field input-icon w-full sm:w-64"
          />
        </div>
      </motion.div>

      {loading ? (
        <SkeletonList count={5} />
      ) : error ? (
        <div className="glass-card">
          <ErrorState error={error} onRetry={load} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={FiFileText}
            title={t("doctorReports.emptyTitle", "No reports found")}
            description={t(
              "doctorReports.emptyDesc",
              "Lab, imaging and other reports for your patients will appear here."
            )}
          />
        </div>
      ) : (
        <div className="glass-card space-y-3">
          {filtered.map((report) => (
            <button
              key={report.id}
              type="button"
              onClick={() => navigate(`/doctor/patients/${report.patientId}`, { state: { tab: "reports" } })}
              disabled={!report.patientId}
              className="w-full text-left flex items-center gap-4 rounded-2xl border border-slate-100 dark:border-slate-800 p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition disabled:cursor-default"
            >
              <div className="w-10 h-10 shrink-0 rounded-xl bg-brand-50 dark:bg-brand-950/40 text-brand-500 flex items-center justify-center">
                <FiFileText size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm truncate">{report.title}</p>
                <p className="text-xs text-slate-400">
                  {report.patientName || t("doctorReports.unknownPatient", "Unknown patient")} ·{" "}
                  {report.type} · {report.reportDate}
                </p>
              </div>
              <span className={`badge shrink-0 ${statusColor(report.status)}`}>
                {report.status}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
