import React, { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { FiActivity, FiSearch, FiDownload } from "react-icons/fi";

import doctorPortalService from "../services/doctorPortalService.js";
import { documentService } from "../services/clinicalService.js";
import { useDebouncedValue } from "../hooks/useApi.js";
import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";
import { EmptyState, ErrorState, Spinner } from "../components/ui/States.jsx";
import { SkeletonList } from "../components/ui/Skeleton.jsx";

export default function DoctorPrescriptions() {
  const navigate = useNavigate();
  const { search: navbarSearch } = useOutletContext() || {};

  const toast = useToast();
  const t = useT();

  const [localSearch, setLocalSearch] = useState("");
  const [pdfFor, setPdfFor] = useState(null);
  const [items, setItems] = useState([]);

  const downloadPdf = async (rx) => {
    setPdfFor(rx.id);

    try {
      const name = await documentService.prescriptionPdf(rx.id);
      toast.success(`Downloaded ${name}`);
    } catch (caught) {
      toast.error(caught.message || "Could not build that PDF.");
    } finally {
      setPdfFor(null);
    }
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const term = useDebouncedValue(localSearch || navbarSearch || "", 350);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await doctorPortalService.myPrescriptions();
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
    ? items.filter((rx) =>
        `${rx.medicine} ${rx.patientName || ""}`.toLowerCase().includes(term.toLowerCase())
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
          <h1 className="text-xl font-bold">{t("doctorPrescriptions.title", "Prescriptions")}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t("doctorPrescriptions.subtitle", "Medicines you have prescribed.")}
          </p>
        </div>

        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            value={localSearch}
            onChange={(event) => setLocalSearch(event.target.value)}
            placeholder={t("doctorPrescriptions.searchPlaceholder", "Search medicine or patient")}
            aria-label="Search prescriptions"
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
            icon={FiActivity}
            title={t("doctorPrescriptions.emptyTitle", "No prescriptions yet")}
            description={t(
              "doctorPrescriptions.emptyDesc",
              "Prescriptions you create for your patients will appear here."
            )}
          />
        </div>
      ) : (
        <div className="glass-card space-y-3">
          {filtered.map((rx) => (
            <div
              key={rx.id}
              className="flex items-center gap-3 rounded-2xl border border-slate-100 dark:border-slate-800 p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
            >
              <button
                type="button"
                onClick={() =>
                  navigate(`/doctor/patients/${rx.patientId}`, { state: { tab: "prescriptions" } })
                }
                disabled={!rx.patientId}
                className="flex-1 min-w-0 text-left flex items-center gap-4 disabled:cursor-default"
              >
                <div className="w-10 h-10 shrink-0 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-500 flex items-center justify-center">
                  <FiActivity size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{rx.medicine}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {rx.patientName || t("doctorPrescriptions.unknownPatient", "Unknown patient")} ·{" "}
                    {[rx.dosage, rx.frequency, rx.duration].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => downloadPdf(rx)}
                disabled={pdfFor === rx.id}
                aria-label={`Download ${rx.medicine} prescription as PDF`}
                title={t("doctorPrescriptions.downloadPdf", "Download as PDF")}
                className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-brand-600 hover:bg-white dark:hover:bg-slate-800 transition disabled:opacity-60"
              >
                {pdfFor === rx.id ? <Spinner size={14} /> : <FiDownload size={15} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
