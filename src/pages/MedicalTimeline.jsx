import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiActivity,
  FiCalendar,
  FiClipboard,
  FiFileText,
  FiDroplet,
  FiCreditCard,
  FiLogOut,
  FiRefreshCw,
  FiDownload,
  FiUser,
} from "react-icons/fi";

import { timelineService, documentService } from "../services/clinicalService.js";
import { useAuth } from "../hooks/useAuth.js";
import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";
import { EmptyState, ErrorState, Spinner } from "../components/ui/States.jsx";
import { SkeletonList } from "../components/ui/Skeleton.jsx";
import SelectDropdown from "../components/ui/SelectDropdown.jsx";
import { padRefresh } from "../utils/timing.js";
import { ROLES } from "../constants/roles.js";

/* ==================================================================
   MEDICAL TIMELINE

   Every dated clinical record for one patient in a single feed —
   visits, diagnoses, prescriptions, lab work, reports, invoices and
   discharges. The server does the merging; this page groups the
   result by day and renders one card per event.
================================================================== */

const KINDS = [
  { value: "", key: "timeline.everything", label: "Everything" },
  { value: "appointment", key: "timeline.visits", label: "Visits" },
  { value: "diagnosis", key: "timeline.diagnoses", label: "Diagnoses" },
  { value: "prescription", key: "timeline.prescriptions", label: "Prescriptions" },
  { value: "lab", key: "timeline.labTests", label: "Lab tests" },
  { value: "report", key: "timeline.reports", label: "Reports" },
  { value: "billing", key: "timeline.invoices", label: "Invoices" },
  { value: "discharge", key: "timeline.discharges", label: "Discharges" },
];

const STYLES = {
  appointment: {
    icon: FiCalendar,
    labelKey: "timeline.visit",
    label: "Visit",
    dot: "bg-blue-500",
    chip: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  },
  diagnosis: {
    icon: FiActivity,
    labelKey: "timeline.diagnosis",
    label: "Diagnosis",
    dot: "bg-rose-500",
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  },
  prescription: {
    icon: FiClipboard,
    labelKey: "timeline.prescription",
    label: "Prescription",
    dot: "bg-emerald-500",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  lab: {
    icon: FiDroplet,
    labelKey: "timeline.labTest",
    label: "Lab test",
    dot: "bg-violet-500",
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  },
  report: {
    icon: FiFileText,
    labelKey: "timeline.report",
    label: "Report",
    dot: "bg-amber-500",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  },
  billing: {
    icon: FiCreditCard,
    labelKey: "timeline.invoice",
    label: "Invoice",
    dot: "bg-slate-400",
    chip: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
  discharge: {
    icon: FiLogOut,
    labelKey: "timeline.discharge",
    label: "Discharge",
    dot: "bg-teal-500",
    chip: "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
  },
};

function formatDay(value, t) {
  if (!value) return t("timeline.undated", "Undated");

  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(value) {
  if (!value) return "";

  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export default function MedicalTimeline() {
  const { patientId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const t = useT();

  const [kind, setKind] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const isOwnTimeline = user?.role === ROLES.PATIENT;

  const load = useCallback(async () => {
    const startedAt = Date.now();
    setLoading(true);
    setError(null);

    try {
      const params = kind ? { kinds: kind } : {};

      const result = isOwnTimeline
        ? await timelineService.mine(params)
        : await timelineService.forPatient(patientId, params);

      setData(result);
    } catch (caught) {
      setError(caught);
    } finally {
      await padRefresh(true, startedAt);
      setLoading(false);
    }
  }, [kind, patientId, isOwnTimeline]);

  useEffect(() => {
    load();
  }, [load]);

  /* Events arrive newest-first already; grouping only has to walk the
     list once and start a new bucket when the day changes. */
  const days = useMemo(() => {
    const buckets = [];

    for (const event of data?.events || []) {
      const day = event.at ? event.at.slice(0, 10) : "undated";
      const last = buckets.at(-1);

      if (last && last.day === day) last.events.push(event);
      else buckets.push({ day, at: event.at, events: [event] });
    }

    return buckets;
  }, [data]);

  const downloadPrescriptions = async () => {
    const id = data?.patient?.id;
    if (!id) return;

    setDownloading(true);

    try {
      const name = await documentService.allPrescriptionsPdf(id);
      toast.success(`Downloaded ${name}`);
    } catch (caught) {
      toast.error(caught.message || "Could not build that PDF.");
    } finally {
      setDownloading(false);
    }
  };

  const counts = data?.counts || {};

  return (
    <div className="space-y-5">

      {/* ============ HEADER ============ */}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
      >
        <div className="min-w-0">
          <p className="text-sm text-slate-400">{t("timeline.medicalRecord", "Medical record")}</p>
          <h1 className="text-2xl font-bold mt-1 truncate">
            {isOwnTimeline
              ? t("timeline.title", "My Health Timeline")
              : data?.patient?.name || t("timeline.patientTimeline", "Patient Timeline")}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            {loading
              ? t("timeline.loadingRecords", "Loading records...")
              : t("timeline.recordSummary", "{records} records across {categories} categories")
                  .replace("{records}", data?.total ?? 0)
                  .replace("{categories}", Object.keys(counts).length)}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <SelectDropdown
            value={kind}
            onChange={setKind}
            options={KINDS.map((item) => ({
              value: item.value,
              label: t(item.key, item.label),
            }))}
            ariaLabel="Filter timeline"
            className="w-full sm:w-44"
          />

          <button
            type="button"
            onClick={load}
            aria-label="Refresh timeline"
            className="btn-secondary text-sm inline-flex items-center justify-center gap-2"
          >
            <FiRefreshCw size={15} className={loading ? "animate-spin" : ""} />
            <span className="sm:hidden lg:inline">{t("action.refresh", "Refresh")}</span>
          </button>

          {counts.prescription > 0 && (
            <button
              type="button"
              onClick={downloadPrescriptions}
              disabled={downloading}
              className="btn-primary text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {downloading ? <Spinner size={14} /> : <FiDownload size={15} />}
              {t("timeline.prescriptionsPdf", "Prescriptions PDF")}
            </button>
          )}
        </div>
      </motion.div>

      {/* ============ CATEGORY COUNTS ============ */}

      {!loading && !error && data?.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
          {KINDS.filter((item) => item.value).map((item) => {
            const style = STYLES[item.value];
            const Icon = style.icon;

            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setKind(kind === item.value ? "" : item.value)}
                className={`glass-card !p-3.5 text-left transition ${
                  kind === item.value ? "ring-2 ring-brand-500" : "hover:shadow-md"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {t(item.key, item.label)}
                  </span>
                  <Icon size={14} className="text-slate-400 shrink-0" />
                </div>
                <p className="text-xl font-bold mt-1">{counts[item.value] || 0}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* ============ TIMELINE ============ */}

      {loading ? (
        <div className="glass-card">
          <SkeletonList count={4} />
        </div>
      ) : error ? (
        <div className="glass-card">
          <ErrorState error={error} onRetry={load} />
        </div>
      ) : days.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={FiActivity}
            title={t("timeline.empty", "Nothing recorded yet")}
            description={
              kind
                ? t(
                    "timeline.emptyFiltered",
                    "No records of this kind. Clear the filter to see everything."
                  )
                : t(
                    "timeline.emptyDescription",
                    "Visits, prescriptions, lab results and reports will appear here as they are recorded."
                  )
            }
          />
        </div>
      ) : (
        <div className="space-y-5">
          {days.map((bucket, dayIndex) => (
            <motion.section
              key={bucket.day}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(dayIndex * 0.03, 0.2) }}
              className="glass-card"
            >
              <div className="flex items-center gap-2 mb-4">
                <FiCalendar size={14} className="text-slate-400 shrink-0" />
                <h2 className="font-semibold text-sm">{formatDay(bucket.at, t)}</h2>
                <span className="text-xs text-slate-400">
                  {t("timeline.recordCount", "{n} records").replace("{n}", bucket.events.length)}
                </span>
              </div>

              {/* The rail is drawn by the left border on each row so it
                  never runs past the last item in the group. */}
              <ol className="space-y-0">
                {bucket.events.map((event, index) => {
                  const style = STYLES[event.kind] || STYLES.report;
                  const Icon = style.icon;
                  const isLast = index === bucket.events.length - 1;

                  return (
                    <li
                      key={`${event.kind}-${event.id}`}
                      className={`relative pl-8 pb-5 ${
                        isLast ? "" : "border-l border-slate-200 dark:border-slate-800"
                      } ${isLast ? "ml-[7px] pl-[27px]" : "ml-[7px]"}`}
                    >
                      <span
                        className={`absolute -left-[7px] top-1 w-3.5 h-3.5 rounded-full ring-4 ring-white dark:ring-slate-900 ${style.dot}`}
                      />

                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`badge shrink-0 ${style.chip}`}>
                              <Icon size={10} className="mr-1 inline" />
                              {t(style.labelKey, style.label)}
                            </span>

                            {event.meta?.status && (
                              <span className="text-[11px] text-slate-400">
                                {event.meta.status}
                              </span>
                            )}

                            {event.at && formatTime(event.at) && (
                              <span className="text-[11px] text-slate-400">
                                {formatTime(event.at)}
                              </span>
                            )}
                          </div>

                          <h3 className="font-semibold mt-1.5 break-words">{event.title}</h3>

                          {event.summary && (
                            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-6 break-words">
                              {event.summary}
                            </p>
                          )}

                          <EventDetails event={event} />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </motion.section>
          ))}
        </div>
      )}
    </div>
  );
}

/* Only the fields that carry information for that kind of record —
   an invoice has no doctor, a prescription has no amount. */
function EventDetails({ event }) {
  const t = useT();
  const meta = event.meta || {};

  const rows = [];

  if (meta.doctor) rows.push([t("label.doctor", "Doctor"), meta.doctor]);
  if (meta.department) rows.push([t("label.department", "Department"), meta.department]);
  if (event.kind === "appointment" && meta.mode === "video") {
    rows.push([
      t("timeline.mode", "Mode"),
      t("timeline.videoConsultation", "Video consultation"),
    ]);
  }
  if (meta.symptoms && event.kind === "diagnosis") {
    rows.push([t("timeline.symptoms", "Symptoms"), meta.symptoms]);
  }
  if (meta.instructions) rows.push([t("timeline.instructions", "Instructions"), meta.instructions]);
  if (meta.followUpDate) rows.push([t("timeline.followUp", "Follow-up"), meta.followUpDate]);
  if (meta.category) rows.push([t("timeline.category", "Category"), meta.category]);
  if (event.kind === "billing" && meta.total != null) {
    rows.push([
      t("timeline.amount", "Amount"),
      `₹${Number(meta.total).toLocaleString("en-IN")}`,
    ]);
  }
  if (meta.admittedOn) rows.push([t("timeline.admitted", "Admitted"), meta.admittedOn]);
  if (meta.condition) rows.push([t("timeline.condition", "Condition"), meta.condition]);
  if (meta.notes) rows.push([t("timeline.notes", "Notes"), meta.notes]);

  if (rows.length === 0) return null;

  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mt-2.5">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[11px] text-slate-400">{label}</dt>
          <dd className="text-xs text-slate-700 dark:text-slate-200 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
