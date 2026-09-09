import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { FiUsers, FiSearch, FiCalendar } from "react-icons/fi";

import doctorPortalService from "../services/doctorPortalService.js";
import { useDebouncedValue } from "../hooks/useApi.js";
import { useT } from "../context/LanguageContext.jsx";
import { EmptyState, ErrorState } from "../components/ui/States.jsx";
import { SkeletonTable } from "../components/ui/Skeleton.jsx";
import { statusColor } from "../utils/format.js";
import SelectDropdown from "../components/ui/SelectDropdown.jsx";

const STATUSES = [
  { value: "All", key: "doctorPatients.status.all" },
  { value: "Stable", key: "doctorPatients.status.stable" },
  { value: "Recovering", key: "doctorPatients.status.recovering" },
  { value: "Critical", key: "doctorPatients.status.critical" },
  { value: "Outpatient", key: "doctorPatients.status.outpatient" },
  { value: "Discharged", key: "doctorPatients.status.discharged" },
];

const COLUMNS = [
  { key: "label.patient", label: "Patient" },
  { key: "doctorPatients.col.id", label: "ID" },
  { key: "doctorPatients.col.age", label: "Age" },
  { key: "doctorPatients.col.gender", label: "Gender" },
  { key: "label.phone", label: "Phone" },
  { key: "doctorPatients.col.lastVisit", label: "Last Visit" },
  { key: "doctorPatients.col.nextAppointment", label: "Next Appointment" },
  { key: "label.status", label: "Status" },
];

export default function DoctorPatients() {
  const navigate = useNavigate();
  const t = useT();
  const { search: navbarSearch } = useOutletContext() || {};

  const [localSearch, setLocalSearch] = useState("");
  const [status, setStatus] = useState("All");

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const term = useDebouncedValue(localSearch || navbarSearch || "", 350);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await doctorPortalService.patients({ search: term, status });
      setItems(data.items);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [term, status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-xl font-bold">{t("doctorPatients.title", "My Patients")}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {loading
              ? t("label.loading", "Loading...")
              : `${items.length} ${
                  items.length === 1
                    ? t("doctorPatients.countOne", "patient under your care")
                    : t("doctorPatients.countMany", "patients under your care")
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
              placeholder={t("doctorPatients.searchPlaceholder", "Search name or patient ID")}
              aria-label="Search patients"
              className="input-field input-icon w-full sm:w-64"
            />
          </div>

          <SelectDropdown
            value={status}
            onChange={setStatus}
            options={STATUSES.map(({ value, key }) => ({ value, label: t(key, value) }))}
            ariaLabel="Filter by status"
            className="w-full sm:w-40"
          />
        </div>
      </motion.div>

      {loading ? (
        <SkeletonTable rows={6} cols={7} />
      ) : error ? (
        <div className="glass-card">
          <ErrorState error={error} onRetry={load} />
        </div>
      ) : items.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={FiUsers}
            title={t("doctorPatients.emptyTitle", "No patients yet")}
            description={t(
              "doctorPatients.emptyDesc",
              "Patients you're assigned to, have appointments with, or have an approved chat with will appear here."
            )}
          />
        </div>
      ) : (
        <>
          <div className="glass overflow-hidden hidden lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b border-slate-200/60 dark:border-slate-700/60">
                  <tr>
                    {COLUMNS.map(({ key, label }) => (
                      <th
                        key={key}
                        className="text-left px-4 py-3 text-xs uppercase tracking-wide text-slate-400 font-semibold"
                      >
                        {t(key, label)}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {items.map((patient) => (
                    <tr
                      key={patient.id}
                      className="border-b border-slate-100/60 dark:border-slate-800/60 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 cursor-pointer"
                      onClick={() => navigate(`/doctor/patients/${patient.id}`)}
                    >
                      <td className="px-4 py-3 font-medium">{patient.name}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        #{patient.id}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {patient.age ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {patient.gender || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {patient.phone || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {patient.lastVisit || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {patient.nextAppointment
                          ? `${patient.nextAppointment.date} · ${patient.nextAppointment.time}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${statusColor(patient.status)}`}>
                          {patient.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-3">
            {items.map((patient, index) => (
              <motion.button
                key={patient.id}
                type="button"
                onClick={() => navigate(`/doctor/patients/${patient.id}`)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.03, 0.25), duration: 0.24 }}
                className="glass-card w-full text-left block"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{patient.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      #{patient.id} ·{" "}
                      {patient.age ? `${patient.age} ${t("doctorPatients.yrs", "yrs")} · ` : ""}
                      {patient.gender || "—"}
                    </p>
                  </div>
                  <span className={`badge shrink-0 ${statusColor(patient.status)}`}>
                    {patient.status}
                  </span>
                </div>

                {patient.nextAppointment && (
                  <p className="text-xs text-brand-600 dark:text-brand-400 mt-3 flex items-center gap-1.5">
                    <FiCalendar size={12} />
                    {t("doctorPatients.next", "Next")}: {patient.nextAppointment.date}{" "}
                    {t("doctorPatients.at", "at")} {patient.nextAppointment.time}
                  </p>
                )}
              </motion.button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
