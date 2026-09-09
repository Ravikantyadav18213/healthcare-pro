import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiSearch,
  FiUserCheck,
  FiStar,
  FiClock,
  FiPhone,
  FiAward,
  FiCalendar,
} from "react-icons/fi";

import doctorService from "../services/doctorService.js";
import { departmentService } from "../services/adminService.js";
import { useDebouncedValue } from "../hooks/useApi.js";
import { useT } from "../context/LanguageContext.jsx";
import { EmptyState, ErrorState } from "../components/ui/States.jsx";
import { Skeleton } from "../components/ui/Skeleton.jsx";
import SelectDropdown from "../components/ui/SelectDropdown.jsx";

/*
 * Patient-facing doctor directory.
 * Read-only: no management controls are rendered or reachable.
 */

export default function FindDoctors() {
  const navigate = useNavigate();
  const t = useT();
  const { search: navbarSearch } = useOutletContext() || {};

  const [localSearch, setLocalSearch] = useState("");
  const [specialization, setSpecialization] = useState("All");
  const [departmentId, setDepartmentId] = useState("");

  const [doctors, setDoctors] = useState([]);
  const [specializations, setSpecializations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const term = useDebouncedValue(localSearch || navbarSearch || "", 350);

  useEffect(() => {
    departmentService
      .list()
      .then((data) => setDepartments(data.departments))
      .catch(() => setDepartments([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await doctorService.list({
        search: term,
        specialization: specialization === "All" ? "" : specialization,
        departmentId: departmentId || undefined,
      });

      setDoctors(data.doctors);
      setSpecializations(data.specializations);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [term, specialization, departmentId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">

      {/* ============ HEADER ============ */}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass p-5 sm:p-6"
      >
        <p className="text-sm text-slate-400">
          {t("nav.findDoctor", "Find a Doctor")}
        </p>
        <h1 className="text-2xl font-bold mt-1">
          {t("findDoctors.title", "Our Specialists")}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          {t(
            "findDoctors.subtitle",
            "Browse consultants by department, then book directly."
          )}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          <div className="relative sm:col-span-1">
            <FiSearch
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              type="text"
              value={localSearch}
              onChange={(event) => setLocalSearch(event.target.value)}
              placeholder={t("findDoctors.searchPlaceholder", "Search by name")}
              aria-label="Search doctors"
              className="input-field input-icon"
            />
          </div>

          <SelectDropdown
            value={departmentId}
            onChange={setDepartmentId}
            options={[
              {
                value: "",
                label: t("findDoctors.allDepartments", "All departments"),
              },
              ...departments.map((department) => ({
                value: String(department.id),
                label: department.name,
              })),
            ]}
            ariaLabel="Filter by department"
            className="w-full"
          />

          <SelectDropdown
            value={specialization}
            onChange={setSpecialization}
            options={[
              {
                value: "All",
                label: t("findDoctors.allSpecialisations", "All specialisations"),
              },
              ...specializations.map((item) => ({ value: item, label: item })),
            ]}
            ariaLabel="Filter by specialisation"
            className="w-full"
          />
        </div>
      </motion.div>

      {/* ============ RESULTS ============ */}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="glass-card space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-14 h-14 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="glass-card">
          <ErrorState error={error} onRetry={load} />
        </div>
      ) : doctors.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={FiUserCheck}
            title={t("findDoctors.empty.title", "No doctors found")}
            description={t(
              "findDoctors.empty.description",
              "Try a different department or clear your search."
            )}
          />
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-400 px-1">
            {t(
              doctors.length === 1
                ? "findDoctors.specialistAvailable"
                : "findDoctors.specialistsAvailable",
              doctors.length === 1
                ? "{count} specialist available"
                : "{count} specialists available"
            ).replace("{count}", doctors.length)}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {doctors.map((doctor, index) => (
              <motion.article
                key={doctor.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: Math.min(index * 0.04, 0.3) }}
                className="glass-card flex flex-col hover:shadow-lg hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 shrink-0 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white flex items-center justify-center font-bold">
                    {initials(doctor.name)}
                  </div>

                  <div className="min-w-0">
                    <h2 className="font-semibold truncate">{doctor.name}</h2>
                    <p className="text-xs text-slate-400 truncate">
                      {doctor.specialization}
                    </p>
                    <span
                      className={`badge mt-1.5 inline-block ${
                        doctor.availability === "Available"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      {doctor.availability}
                    </span>
                  </div>
                </div>

                {doctor.bio && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-5 mt-4 line-clamp-2">
                    {doctor.bio}
                  </p>
                )}

                <dl className="grid grid-cols-2 gap-3 mt-4 text-xs">
                  <Meta
                    icon={FiStar}
                    label={t("findDoctors.label.rating", "Rating")}
                    value={doctor.rating}
                  />
                  <Meta
                    icon={FiClock}
                    label={t("findDoctors.label.experience", "Experience")}
                    value={t("findDoctors.years", "{years} yrs").replace(
                      "{years}",
                      doctor.experienceYears
                    )}
                  />
                  <Meta
                    icon={FiAward}
                    label={t("label.department", "Department")}
                    value={doctor.department || "—"}
                  />
                  <Meta
                    icon={FiPhone}
                    label={t("findDoctors.label.contact", "Contact")}
                    value={doctor.phone || "—"}
                  />
                </dl>

                <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="text-[11px] text-slate-400">
                      {t("findDoctors.consultation", "Consultation")}
                    </p>
                    <p className="font-bold text-brand-600 dark:text-brand-400">
                      ₹{Number(doctor.consultationFee).toLocaleString("en-IN")}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate("/book-appointment")}
                    className="btn-primary text-xs inline-flex items-center gap-1.5"
                  >
                    <FiCalendar size={13} />
                    {t("findDoctors.book", "Book")}
                  </button>
                </div>
              </motion.article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Meta({ icon: Icon, label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-400 flex items-center gap-1">
        <Icon size={11} />
        {label}
      </dt>
      <dd className="font-medium mt-0.5 truncate">{value}</dd>
    </div>
  );
}

function initials(name) {
  return String(name || "")
    .replace(/^Dr\.?\s*/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
