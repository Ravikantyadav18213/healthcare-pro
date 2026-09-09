import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiLayers,
  FiUserCheck,
  FiCalendar,
  FiClock,
  FiFileText,
  FiCheck,
  FiChevronLeft,
  FiChevronRight,
  FiStar,
  FiSearch,
  FiAlertCircle,
} from "react-icons/fi";

import doctorService from "../services/doctorService.js";
import appointmentService from "../services/appointmentService.js";
import { departmentService } from "../services/adminService.js";
import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";
import { Alert, EmptyState, ErrorState, Spinner } from "../components/ui/States.jsx";
import { Skeleton, SkeletonList } from "../components/ui/Skeleton.jsx";

const STEPS = [
  { id: 1, labelKey: "label.department", label: "Department", icon: FiLayers },
  { id: 2, labelKey: "label.doctor", label: "Doctor", icon: FiUserCheck },
  { id: 3, labelKey: "label.date", label: "Date", icon: FiCalendar },
  { id: 4, labelKey: "label.time", label: "Time", icon: FiClock },
  { id: 5, labelKey: "bookAppointment.step.details", label: "Details", icon: FiFileText },
  { id: 6, labelKey: "bookAppointment.step.confirm", label: "Confirm", icon: FiCheck },
];

/** Next 21 selectable days, rendered as a horizontal date strip. */
function useDateOptions() {
  return useMemo(() => {
    const options = [];
    const now = new Date();

    for (let i = 0; i < 21; i += 1) {
      const date = new Date(now);
      date.setDate(now.getDate() + i);

      const offset = date.getTimezoneOffset() * 60000;
      const iso = new Date(date.getTime() - offset).toISOString().slice(0, 10);

      options.push({
        iso,
        weekday: date.toLocaleDateString("en-IN", { weekday: "short" }),
        day: date.getDate(),
        month: date.toLocaleDateString("en-IN", { month: "short" }),
        isToday: i === 0,
      });
    }

    return options;
  }, []);
}

export default function BookAppointment() {
  const navigate = useNavigate();
  const toast = useToast();
  const t = useT();
  const dateOptions = useDateOptions();

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);

  const [departments, setDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [slotData, setSlotData] = useState(null);

  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [loadError, setLoadError] = useState(null);
  const [formError, setFormError] = useState("");

  const [doctorSearch, setDoctorSearch] = useState("");

  const [selection, setSelection] = useState({
    department: null,
    doctor: null,
    date: "",
    time: "",
    reason: "",
    notes: "",
  });

  const [confirmed, setConfirmed] = useState(null);

  /* ---------------- departments ---------------- */

  const loadDepartments = useCallback(async () => {
    setLoadingDepartments(true);
    setLoadError(null);

    try {
      const data = await departmentService.list();
      setDepartments(data.departments);
    } catch (error) {
      setLoadError(error);
    } finally {
      setLoadingDepartments(false);
    }
  }, []);

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  /* ---------------- doctors for the chosen department ---------------- */

  const loadDoctors = useCallback(async (departmentId) => {
    setLoadingDoctors(true);
    setFormError("");

    try {
      const data = await doctorService.list({ departmentId });
      setDoctors(data.doctors);
    } catch (error) {
      setFormError(error.message);
      setDoctors([]);
    } finally {
      setLoadingDoctors(false);
    }
  }, []);

  /* ---------------- real availability ---------------- */

  const loadSlots = useCallback(async (doctorId, date) => {
    setLoadingSlots(true);
    setFormError("");

    try {
      const data = await doctorService.availability(doctorId, date);
      setSlotData(data);
    } catch (error) {
      setFormError(error.message);
      setSlotData({ slots: [], reason: error.message });
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  /* ---------------- navigation ---------------- */

  const goTo = (next) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
    setFormError("");
  };

  const pickDepartment = (department) => {
    setSelection((current) => ({
      ...current,
      department,
      doctor: null,
      time: "",
    }));
    setDoctorSearch("");
    loadDoctors(department.id);
    goTo(2);
  };

  const pickDoctor = (doctor) => {
    setSelection((current) => ({ ...current, doctor, time: "" }));
    if (selection.date) loadSlots(doctor.id, selection.date);
    goTo(3);
  };

  const pickDate = (iso) => {
    setSelection((current) => ({ ...current, date: iso, time: "" }));
    loadSlots(selection.doctor.id, iso);
    goTo(4);
  };

  const pickTime = (time) => {
    setSelection((current) => ({ ...current, time }));
    goTo(5);
  };

  const filteredDoctors = useMemo(() => {
    const term = doctorSearch.trim().toLowerCase();
    if (!term) return doctors;

    return doctors.filter(
      (doctor) =>
        doctor.name.toLowerCase().includes(term) ||
        doctor.specialization.toLowerCase().includes(term)
    );
  }, [doctors, doctorSearch]);

  /* ---------------- submit ---------------- */

  const submit = async () => {
    setSubmitting(true);
    setFormError("");

    try {
      const data = await appointmentService.book({
        doctorId: selection.doctor.id,
        departmentId: selection.department.id,
        date: selection.date,
        time: selection.time,
        reason: selection.reason.trim(),
        notes: selection.notes.trim() || undefined,
      });

      setConfirmed(data.appointment);
      toast.success("Request sent — the hospital will review it shortly.");
      goTo(6);
    } catch (error) {
      setFormError(
        error?.errors
          ? Object.values(error.errors)[0]
          : error.message || "We could not book that appointment."
      );

      /* A taken slot means the list on screen is stale. */
      if (error.status === 409) {
        await loadSlots(selection.doctor.id, selection.date);
        setSelection((current) => ({ ...current, time: "" }));
        goTo(4);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setSelection({
      department: null,
      doctor: null,
      date: "",
      time: "",
      reason: "",
      notes: "",
    });
    setConfirmed(null);
    setDoctors([]);
    setSlotData(null);
    goTo(1);
  };

  if (loadError) {
    return (
      <div className="glass-card">
        <ErrorState error={loadError} onRetry={loadDepartments} />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-5xl mx-auto">

      {/* ============ HEADER ============ */}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass p-5 sm:p-6"
      >
        <p className="text-sm text-slate-400">
          {t("nav.appointments", "Appointments")}
        </p>
        <h1 className="text-2xl font-bold mt-1">
          {t("bookAppointment.title", "Book an Appointment")}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          {t(
            "bookAppointment.subtitle",
            "Pick a department, choose a specialist, and confirm a real available time slot."
          )}
        </p>
      </motion.div>

      {/* ============ STEPPER ============ */}

      <div className="glass-card overflow-x-auto [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)]">
        <ol className="flex items-center min-w-[560px] gap-1">
          {STEPS.map((item, index) => {
            const Icon = item.icon;
            const done = step > item.id || Boolean(confirmed && item.id === 6);
            const active = step === item.id;

            return (
              <li key={item.id} className="flex items-center flex-1 last:flex-none">
                <button
                  type="button"
                  disabled={item.id > step}
                  onClick={() => item.id < step && goTo(item.id)}
                  className={`flex items-center gap-2 shrink-0 rounded-xl px-2 py-1 transition ${
                    item.id < step ? "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" : "cursor-default"
                  }`}
                >
                  <span
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                      done
                        ? "bg-emerald-500 text-white"
                        : active
                        ? "bg-brand-600 text-white shadow-md"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                    }`}
                  >
                    {done ? <FiCheck size={16} /> : <Icon size={16} />}
                  </span>

                  <span
                    className={`text-xs font-medium hidden sm:block ${
                      active
                        ? "text-brand-600 dark:text-brand-400"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {t(item.labelKey, item.label)}
                  </span>
                </button>

                {index < STEPS.length - 1 && (
                  <span
                    className={`flex-1 h-0.5 mx-2 rounded ${
                      step > item.id
                        ? "bg-emerald-500"
                        : "bg-slate-200 dark:bg-slate-800"
                    }`}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {/* ============ PANEL ============ */}

      <div className="glass-card min-h-[340px]">
        {formError && (
          <Alert tone="error" className="mb-5">
            {formError}
          </Alert>
        )}

        {/*
          The panel is keyed by step, so React remounts it on every change
          and the enter animation replays. Deliberately not wrapped in
          AnimatePresence: an exit animation here only delays the next step.
        */}
        <motion.div
          key={`step-${step}`}
          initial={{ opacity: 0, x: direction > 0 ? 32 : -32 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
        >

          {/* -------- STEP 1: DEPARTMENT -------- */}
          {step === 1 && (
            <div>
              <StepHeading
                title={t(
                  "bookAppointment.department.title",
                  "Which department do you need?"
                )}
                subtitle={t(
                  "bookAppointment.department.subtitle",
                  "Choose the speciality that best matches your concern."
                )}
              />

              {loadingDepartments ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-24 rounded-2xl" />
                  ))}
                </div>
              ) : departments.length === 0 ? (
                <EmptyState
                  icon={FiLayers}
                  title={t(
                    "bookAppointment.department.emptyTitle",
                    "No departments available"
                  )}
                  description={t(
                    "bookAppointment.department.emptyDescription",
                    "The hospital has not published any departments yet."
                  )}
                  compact
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {departments.map((department, index) => (
                    <motion.button
                      key={department.id}
                      type="button"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03, duration: 0.22 }}
                      onClick={() => pickDepartment(department)}
                      className="text-left rounded-2xl border border-slate-200 dark:border-slate-800 p-4 hover:border-brand-400 hover:shadow-md hover:-translate-y-0.5 transition-all bg-white dark:bg-slate-900/60"
                    >
                      <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 flex items-center justify-center mb-3">
                        <FiLayers size={18} />
                      </div>

                      <p className="font-semibold text-sm">{department.name}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {t(
                          department.doctors === 1
                            ? "bookAppointment.department.specialistAvailable"
                            : "bookAppointment.department.specialistsAvailable",
                          department.doctors === 1
                            ? "{count} specialist available"
                            : "{count} specialists available"
                        ).replace("{count}", department.doctors)}
                      </p>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* -------- STEP 2: DOCTOR -------- */}
          {step === 2 && (
            <div>
              <StepHeading
                title={t(
                  "bookAppointment.doctor.title",
                  "Choose a specialist in {department}"
                ).replace("{department}", selection.department?.name || "")}
                subtitle={t(
                  "bookAppointment.doctor.subtitle",
                  "Consultation fees and experience are shown for each doctor."
                )}
              />

              <div className="relative mb-4">
                <FiSearch
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <input
                  type="text"
                  value={doctorSearch}
                  onChange={(event) => setDoctorSearch(event.target.value)}
                  placeholder={t(
                    "bookAppointment.doctor.searchPlaceholder",
                    "Search by name or specialisation"
                  )}
                  aria-label="Search doctors"
                  className="input-field input-icon"
                />
              </div>

              {loadingDoctors ? (
                <SkeletonList count={3} />
              ) : filteredDoctors.length === 0 ? (
                <EmptyState
                  icon={FiUserCheck}
                  title={t("bookAppointment.doctor.emptyTitle", "No doctors found")}
                  description={t(
                    "bookAppointment.doctor.emptyDescription",
                    "No specialists match this department or search right now."
                  )}
                  action={() => goTo(1)}
                  actionLabel={t(
                    "bookAppointment.doctor.chooseAnotherDepartment",
                    "Choose another department"
                  )}
                  compact
                />
              ) : (
                <div className="space-y-3">
                  {filteredDoctors.map((doctor, index) => (
                    <motion.button
                      key={doctor.id}
                      type="button"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.04, duration: 0.22 }}
                      onClick={() => pickDoctor(doctor)}
                      className="w-full text-left flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 hover:border-brand-400 hover:shadow-md transition-all bg-white dark:bg-slate-900/60"
                    >
                      <div className="w-12 h-12 shrink-0 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white flex items-center justify-center font-bold">
                        {initials(doctor.name)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{doctor.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {doctor.specialization}
                          {doctor.qualification ? ` · ${doctor.qualification}` : ""}
                        </p>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-2">
                          <span className="inline-flex items-center gap-1">
                            <FiStar className="text-amber-400" size={12} />
                            {doctor.rating}
                          </span>
                          <span>
                            {t(
                              "bookAppointment.doctor.yearsExperience",
                              "{years} yrs experience"
                            ).replace("{years}", doctor.experienceYears)}
                          </span>
                          <span
                            className={`badge ${
                              doctor.availability === "Available"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            }`}
                          >
                            {doctor.availability}
                          </span>
                        </div>
                      </div>

                      <div className="text-left sm:text-right shrink-0">
                        <p className="text-xs text-slate-400">
                          {t("bookAppointment.doctor.consultation", "Consultation")}
                        </p>
                        <p className="font-bold text-brand-600 dark:text-brand-400">
                          ₹{Number(doctor.consultationFee).toLocaleString("en-IN")}
                        </p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* -------- STEP 3: DATE -------- */}
          {step === 3 && (
            <div>
              <StepHeading
                title={t("bookAppointment.date.title", "Pick a date")}
                subtitle={t(
                  "bookAppointment.date.subtitle",
                  "Availability is checked live against {doctor}'s clinic schedule."
                ).replace("{doctor}", selection.doctor?.name || "")}
              />

              <div className="flex overflow-x-auto pb-1 gap-2 sm:grid sm:grid-cols-5 sm:overflow-visible sm:pb-0 lg:grid-cols-7">
                {dateOptions.map((option, index) => {
                  const active = selection.date === option.iso;

                  return (
                    <motion.button
                      key={option.iso}
                      type="button"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.012, duration: 0.18 }}
                      onClick={() => pickDate(option.iso)}
                      className={`shrink-0 w-16 sm:w-auto rounded-xl border px-2 py-3 text-center transition-all ${
                        active
                          ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40 shadow-sm"
                          : "border-slate-200 dark:border-slate-800 hover:border-brand-300 hover:-translate-y-0.5"
                      }`}
                    >
                      <p className="text-[11px] text-slate-400">{option.weekday}</p>
                      <p className="text-lg font-bold leading-tight mt-0.5">
                        {option.day}
                      </p>
                      <p className="text-[11px] text-slate-400">{option.month}</p>
                      {option.isToday && (
                        <p className="text-[10px] font-semibold text-brand-600 dark:text-brand-400 mt-1">
                          {t("bookAppointment.date.today", "Today")}
                        </p>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          )}

          {/* -------- STEP 4: TIME -------- */}
          {step === 4 && (
            <div>
              <StepHeading
                title={t("bookAppointment.time.title", "Choose a time slot")}
                subtitle={t("bookAppointment.time.subtitle", "{date} with {doctor}")
                  .replace("{date}", formatLongDate(selection.date))
                  .replace("{doctor}", selection.doctor?.name || "")}
              />

              {loadingSlots ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                  {Array.from({ length: 12 }).map((_, index) => (
                    <Skeleton key={index} className="h-11 rounded-xl" />
                  ))}
                </div>
              ) : !slotData?.slots?.length ? (
                <EmptyState
                  icon={FiAlertCircle}
                  title={t("bookAppointment.time.emptyTitle", "No slots available")}
                  description={
                    slotData?.reason ||
                    t(
                      "bookAppointment.time.emptyDescription",
                      "There are no free appointment times on this date."
                    )
                  }
                  action={() => goTo(3)}
                  actionLabel={t(
                    "bookAppointment.time.pickAnotherDate",
                    "Pick another date"
                  )}
                  compact
                />
              ) : (
                <>
                  <p className="text-xs text-slate-400 mb-3">
                    {t(
                      slotData.slots.length === 1
                        ? "bookAppointment.time.slotFree"
                        : "bookAppointment.time.slotsFree",
                      slotData.slots.length === 1
                        ? "{count} slot free"
                        : "{count} slots free"
                    ).replace("{count}", slotData.slots.length)}
                    {" · "}
                    {t(
                      "bookAppointment.time.minuteConsultations",
                      "{minutes} minute consultations"
                    ).replace("{minutes}", slotData.slotMinutes)}
                  </p>

                  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                    {slotData.slots.map((slot, index) => (
                      <motion.button
                        key={slot}
                        type="button"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.015, duration: 0.18 }}
                        onClick={() => pickTime(slot)}
                        className={`rounded-xl border py-2.5 text-sm font-medium transition-all ${
                          selection.time === slot
                            ? "border-brand-500 bg-brand-600 text-white shadow-md"
                            : "border-slate-200 dark:border-slate-800 hover:border-brand-400 hover:-translate-y-0.5"
                        }`}
                      >
                        {slot}
                      </motion.button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* -------- STEP 5: DETAILS -------- */}
          {step === 5 && (
            <div>
              <StepHeading
                title={t(
                  "bookAppointment.details.title",
                  "Tell the doctor why you are visiting"
                )}
                subtitle={t(
                  "bookAppointment.details.subtitle",
                  "A short description helps the clinic prepare for your consultation."
                )}
              />

              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="reason"
                    className="block text-sm font-medium mb-1.5"
                  >
                    {t("bookAppointment.details.reasonLabel", "Reason for visit")}{" "}
                    <span className="text-red-500">*</span>
                  </label>

                  <textarea
                    id="reason"
                    rows={3}
                    value={selection.reason}
                    onChange={(event) =>
                      setSelection((current) => ({
                        ...current,
                        reason: event.target.value,
                      }))
                    }
                    placeholder={t(
                      "bookAppointment.details.reasonPlaceholder",
                      "e.g. Recurring chest discomfort during exercise for the past two weeks"
                    )}
                    className="input-field resize-none"
                    maxLength={500}
                  />

                  <p className="text-xs text-slate-400 mt-1.5">
                    {selection.reason.trim().length < 3
                      ? t("bookAppointment.details.minCharacters", "At least 3 characters.")
                      : t(
                          "bookAppointment.details.characterCount",
                          "{count}/500 characters"
                        ).replace("{count}", selection.reason.length)}
                  </p>
                </div>

                <div>
                  <label htmlFor="notes" className="block text-sm font-medium mb-1.5">
                    {t("bookAppointment.details.notesLabel", "Additional notes")}{" "}
                    <span className="text-slate-400 font-normal">
                      {t("bookAppointment.details.optional", "(optional)")}
                    </span>
                  </label>

                  <textarea
                    id="notes"
                    rows={2}
                    value={selection.notes}
                    onChange={(event) =>
                      setSelection((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                    placeholder={t(
                      "bookAppointment.details.notesPlaceholder",
                      "Current medication, allergies, or anything else the doctor should know"
                    )}
                    className="input-field resize-none"
                    maxLength={500}
                  />
                </div>

                <SummaryCard selection={selection} />

                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting || selection.reason.trim().length < 3}
                  className="btn-primary w-full inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting && <Spinner size={16} />}
                  {submitting
                    ? t("bookAppointment.details.sending", "Sending your request...")
                    : t(
                        "bookAppointment.details.submit",
                        "Send Request for Approval"
                      )}
                </button>

                <p className="text-xs text-slate-400 text-center">
                  {t(
                    "bookAppointment.details.reviewNote",
                    "The hospital reviews every request before it is confirmed."
                  )}
                </p>
              </div>
            </div>
          )}

          {/* -------- STEP 6: CONFIRMATION -------- */}
          {step === 6 && confirmed && (
            <div className="text-center py-6">
              <motion.div
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 240, damping: 16 }}
                className="w-20 h-20 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-5"
              >
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.18, type: "spring", stiffness: 300 }}
                >
                  <FiCheck size={38} />
                </motion.span>
              </motion.div>

              <h2 className="text-2xl font-bold">
                {t("bookAppointment.confirm.title", "Request sent for approval")}
              </h2>

              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto">
                {t(
                  "bookAppointment.confirm.description",
                  "Your request is saved and now waiting for the hospital to approve it. You will get a notification as soon as they decide, and you can track it under My Appointments."
                )}
              </p>

              <span className="badge mt-4 inline-flex items-center gap-1.5 bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                <FiClock size={12} />
                {t("bookAppointment.confirm.pending", "Pending approval")}
              </span>

              <div className="max-w-md mx-auto mt-6 text-left rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                <Row
                  label={t("bookAppointment.confirm.reference", "Reference")}
                  value={`APT-${confirmed.id}`}
                />
                <Row label={t("label.doctor", "Doctor")} value={confirmed.doctorName} />
                <Row
                  label={t("label.department", "Department")}
                  value={confirmed.department}
                />
                <Row
                  label={t("label.date", "Date")}
                  value={formatLongDate(confirmed.date)}
                />
                <Row label={t("label.time", "Time")} value={confirmed.time} />
                <Row
                  label={t("bookAppointment.confirm.consultationFee", "Consultation fee")}
                  value={`₹${Number(confirmed.consultationFee || 0).toLocaleString("en-IN")}`}
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center mt-7">
                <button
                  type="button"
                  onClick={() => navigate("/my-appointments")}
                  className="btn-primary text-sm"
                >
                  {t("bookAppointment.confirm.viewAppointments", "View My Appointments")}
                </button>

                <button type="button" onClick={reset} className="btn-secondary text-sm">
                  {t("bookAppointment.confirm.bookAnother", "Book Another")}
                </button>
              </div>
            </div>
          )}

        </motion.div>
      </div>

      {/* ============ NAVIGATION ============ */}

      {step > 1 && step < 6 && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => goTo(step - 1)}
            className="btn-secondary text-sm inline-flex items-center gap-2"
          >
            <FiChevronLeft size={16} />
            {t("bookAppointment.back", "Back")}
          </button>

          {step < 5 && (
            <button
              type="button"
              disabled={
                (step === 2 && !selection.doctor) ||
                (step === 3 && !selection.date) ||
                (step === 4 && !selection.time)
              }
              onClick={() => goTo(step + 1)}
              className="btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("bookAppointment.continue", "Continue")}
              <FiChevronRight size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */

function StepHeading({ title, subtitle }) {
  return (
    <div className="mb-5">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
    </div>
  );
}

function SummaryCard({ selection }) {
  const t = useT();

  return (
    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4 space-y-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {t("bookAppointment.details.summary", "Booking summary")}
      </p>

      <SummaryRow icon={FiLayers} label={selection.department?.name} />
      <SummaryRow icon={FiUserCheck} label={selection.doctor?.name} />
      <SummaryRow icon={FiCalendar} label={formatLongDate(selection.date)} />
      <SummaryRow icon={FiClock} label={selection.time} />
    </div>
  );
}

function SummaryRow({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <Icon size={14} className="text-brand-600 dark:text-brand-400 shrink-0" />
      <span className="font-medium">{label || "—"}</span>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-right">{value || "—"}</span>
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

function formatLongDate(value) {
  if (!value) return "";

  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return value;
  }
}
