import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiArrowLeft,
  FiUser,
  FiClipboard,
  FiCalendar,
  FiFileText,
  FiActivity,
  FiMessageSquare,
  FiPlus,
  FiPhone,
  FiMail,
  FiMapPin,
  FiDroplet,
  FiClock,
} from "react-icons/fi";

import doctorPortalService from "../services/doctorPortalService.js";
import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";
import Modal from "../components/ui/Modal.jsx";
import { Spinner, EmptyState, ErrorState } from "../components/ui/States.jsx";
import { SkeletonText } from "../components/ui/Skeleton.jsx";
import { statusColor } from "../utils/format.js";
import DatePicker from "../components/ui/DatePicker.jsx";
import SelectDropdown from "../components/ui/SelectDropdown.jsx";

const APPT_STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  scheduled: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  confirmed: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  rescheduled: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  no_show: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

const TABS = [
  { key: "overview", labelKey: "doctorPatientDetails.tab.overview", label: "Overview", icon: FiUser },
  {
    key: "history",
    labelKey: "doctorPatientDetails.tab.history",
    label: "Medical History",
    icon: FiClipboard,
  },
  {
    key: "appointments",
    labelKey: "doctorPatientDetails.tab.appointments",
    label: "Appointments",
    icon: FiCalendar,
  },
  {
    key: "reports",
    labelKey: "doctorPatientDetails.tab.reports",
    label: "Reports",
    icon: FiFileText,
  },
  {
    key: "prescriptions",
    labelKey: "doctorPatientDetails.tab.prescriptions",
    label: "Prescriptions",
    icon: FiActivity,
  },
  { key: "notes", labelKey: "doctorPatientDetails.tab.notes", label: "Notes", icon: FiClipboard },
];

export default function DoctorPatientDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const t = useT();

  const [tab, setTab] = useState(location.state?.tab || "overview");

  const [patient, setPatient] = useState(null);
  const [history, setHistory] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [reports, setReports] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [noteOpen, setNoteOpen] = useState(false);
  const [rxOpen, setRxOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, h, a, r, rx] = await Promise.all([
        doctorPortalService.patient(id),
        doctorPortalService.patientHistory(id),
        doctorPortalService.patientAppointments(id),
        doctorPortalService.patientReports(id),
        doctorPortalService.patientPrescriptions(id),
      ]);
      setPatient(p.patient);
      setHistory(h.items);
      setAppointments(a.items);
      setReports(r.items);
      setPrescriptions(rx.items);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="glass-card">
          <SkeletonText lines={4} />
        </div>
        <div className="glass-card">
          <SkeletonText lines={6} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card">
        <ErrorState error={error} onRetry={load} />
        <button
          type="button"
          onClick={() => navigate("/doctor/patients")}
          className="btn-secondary text-sm mt-4 inline-flex items-center gap-2"
        >
          <FiArrowLeft size={14} />
          {t("doctorPatientDetails.backToPatients", "Back to patients")}
        </button>
      </div>
    );
  }

  if (!patient) return null;

  return (
    <div className="space-y-5">
      {/* ============ HEADER ============ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass p-5 sm:p-6"
      >
        <button
          type="button"
          onClick={() => navigate("/doctor/patients")}
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-brand-600 transition mb-4"
        >
          <FiArrowLeft size={15} />
          {t("doctorPatientDetails.backToMyPatients", "Back to My Patients")}
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-14 h-14 shrink-0 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white flex items-center justify-center text-lg font-bold">
            {patient.name.charAt(0).toUpperCase()}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold truncate">{patient.name}</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {t("label.patient", "Patient")} #{patient.id}
              {patient.age ? ` · ${patient.age} ${t("doctorPatientDetails.yrs", "yrs")}` : ""}
              {patient.gender ? ` · ${patient.gender}` : ""}
            </p>
          </div>

          <span className={`badge shrink-0 ${statusColor(patient.status)}`}>{patient.status}</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-5 -mb-px overflow-x-auto border-b border-slate-100 dark:border-slate-800">
          {TABS.map(({ key, labelKey, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold border-b-2 transition ${
                tab === key
                  ? "border-brand-500 text-brand-600 dark:text-brand-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <Icon size={14} />
              {t(labelKey, label)}
            </button>
          ))}

          <button
            type="button"
            onClick={() => navigate("/doctor/messages")}
            className="shrink-0 ml-auto flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold text-slate-500 hover:text-brand-600 transition"
          >
            <FiMessageSquare size={14} />
            {t("nav.messages", "Messages")}
          </button>
        </div>
      </motion.div>

      {/* ============ TAB CONTENT ============ */}
      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {tab === "overview" && <Overview patient={patient} />}
        {tab === "history" && (
          <HistoryTab
            patient={patient}
            history={history}
            onAdd={() => setNoteOpen(true)}
          />
        )}
        {tab === "appointments" && <AppointmentsTab appointments={appointments} />}
        {tab === "reports" && <ReportsTab reports={reports} />}
        {tab === "prescriptions" && (
          <PrescriptionsTab prescriptions={prescriptions} onAdd={() => setRxOpen(true)} />
        )}
        {tab === "notes" && (
          <NotesTab history={history} onAdd={() => setNoteOpen(true)} />
        )}
      </motion.div>

      <NoteModal
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        patientId={id}
        appointments={appointments}
        onCreated={(entry) => {
          setHistory((current) => [entry, ...current]);
          toast.success("Note saved.");
        }}
      />

      <PrescriptionModal
        open={rxOpen}
        onClose={() => setRxOpen(false)}
        patientId={id}
        onCreated={(rx) => {
          setPrescriptions((current) => [rx, ...current]);
          toast.success("Prescription saved.");
        }}
      />
    </div>
  );
}

/* ==================================================================
   OVERVIEW
================================================================== */

function Overview({ patient }) {
  const t = useT();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="glass-card">
        <h3 className="font-bold mb-4">
          {t("doctorPatientDetails.basicInformation", "Basic Information")}
        </h3>
        <dl className="space-y-3 text-sm">
          <Row
            icon={FiUser}
            label={t("doctorPatientDetails.fullName", "Full name")}
            value={patient.name}
          />
          <Row
            label={t("doctorPatientDetails.patientId", "Patient ID")}
            value={`#${patient.id}`}
          />
          <Row
            label={t("doctorPatientDetails.dateOfBirth", "Date of birth")}
            value={patient.dateOfBirth || "—"}
          />
          <Row label={t("doctorPatientDetails.age", "Age")} value={patient.age ?? "—"} />
          <Row
            label={t("doctorPatientDetails.gender", "Gender")}
            value={patient.gender || "—"}
          />
          <Row
            icon={FiDroplet}
            label={t("doctorPatientDetails.bloodGroup", "Blood group")}
            value={patient.bloodGroup || "—"}
          />
          <Row icon={FiPhone} label={t("label.phone", "Phone")} value={patient.phone || "—"} />
          <Row icon={FiMail} label={t("label.email", "Email")} value={patient.email || "—"} />
          <Row
            icon={FiMapPin}
            label={t("doctorPatientDetails.address", "Address")}
            value={patient.address || "—"}
          />
          <Row
            label={t("doctorPatientDetails.emergencyContact", "Emergency contact")}
            value={patient.emergencyContact || "—"}
          />
        </dl>
      </div>

      <div className="glass-card">
        <h3 className="font-bold mb-4">
          {t("doctorPatientDetails.clinicalSummary", "Clinical Summary")}
        </h3>
        <dl className="space-y-3 text-sm mb-5">
          <Row
            label={t("label.department", "Department")}
            value={patient.department || "—"}
          />
          <Row
            label={t("doctorPatientDetails.attendingDoctor", "Attending doctor")}
            value={patient.doctor || "—"}
          />
          <Row label={t("doctorPatientDetails.room", "Room")} value={patient.room || "—"} />
          <Row
            label={t("doctorPatientDetails.admittedOn", "Admitted on")}
            value={patient.admittedAt || "—"}
          />
        </dl>

        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
          {t("doctorPatientDetails.knownConditions", "Known conditions")}
        </p>
        {patient.medicalHistory.length === 0 ? (
          <p className="text-sm text-slate-400">
            {t("doctorPatientDetails.noConditions", "No conditions on file.")}
          </p>
        ) : (
          <ul className="text-sm space-y-1.5 list-disc list-inside text-slate-600 dark:text-slate-300">
            {patient.medicalHistory.map((entry, index) => (
              <li key={index}>{entry}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-400 flex items-center gap-1.5 shrink-0">
        {Icon && <Icon size={12} />}
        {label}
      </dt>
      <dd className="font-medium text-right text-slate-700 dark:text-slate-200 break-words">
        {value}
      </dd>
    </div>
  );
}

/* ==================================================================
   MEDICAL HISTORY / NOTES
================================================================== */

function HistoryTab({ history, onAdd }) {
  const t = useT();

  return (
    <div className="glass-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold">
          {t("doctorPatientDetails.tab.history", "Medical History")}
        </h3>
        <button
          type="button"
          onClick={onAdd}
          className="btn-primary text-xs inline-flex items-center gap-1.5"
        >
          <FiPlus size={13} />
          {t("doctorPatientDetails.addNote", "Add Note")}
        </button>
      </div>

      <Timeline entries={history} />
    </div>
  );
}

function NotesTab({ history, onAdd }) {
  const t = useT();

  return (
    <div className="glass-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold">{t("doctorPatientDetails.doctorNotes", "Doctor Notes")}</h3>
        <button
          type="button"
          onClick={onAdd}
          className="btn-primary text-xs inline-flex items-center gap-1.5"
        >
          <FiPlus size={13} />
          {t("doctorPatientDetails.addNote", "Add Note")}
        </button>
      </div>

      <Timeline entries={history} />
    </div>
  );
}

function Timeline({ entries }) {
  const t = useT();

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={FiClipboard}
        title={t("doctorPatientDetails.noNotes", "No notes yet")}
        description={t(
          "doctorPatientDetails.noNotesDesc",
          "Diagnosis, treatment and follow-up notes you add will appear here."
        )}
        compact
      />
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry, index) => (
        <motion.div
          key={entry.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: Math.min(index * 0.03, 0.2) }}
          className="rounded-2xl border border-slate-100 dark:border-slate-800 p-4"
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <FiClock size={11} />
              {formatDate(entry.recordedAt)}
            </p>
            {entry.followUpDate && (
              <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 !text-[10px]">
                {t("doctorPatientDetails.followUp", "Follow-up")}: {entry.followUpDate}
              </span>
            )}
          </div>

          {entry.diagnosis && (
            <p className="text-sm">
              <span className="font-semibold">
                {t("doctorPatientDetails.diagnosis", "Diagnosis")}:{" "}
              </span>
              {entry.diagnosis}
            </p>
          )}
          {entry.symptoms && (
            <p className="text-sm mt-1">
              <span className="font-semibold">
                {t("doctorPatientDetails.symptoms", "Symptoms")}:{" "}
              </span>
              {entry.symptoms}
            </p>
          )}
          {entry.treatment && (
            <p className="text-sm mt-1">
              <span className="font-semibold">
                {t("doctorPatientDetails.treatment", "Treatment")}:{" "}
              </span>
              {entry.treatment}
            </p>
          )}
          {entry.notes && (
            <p className="text-sm mt-1 text-slate-500 dark:text-slate-400">{entry.notes}</p>
          )}
        </motion.div>
      ))}
    </div>
  );
}

/* ==================================================================
   APPOINTMENTS
================================================================== */

function AppointmentsTab({ appointments }) {
  const t = useT();

  if (appointments.length === 0) {
    return (
      <div className="glass-card">
        <EmptyState
          icon={FiCalendar}
          title={t("doctorPatientDetails.noAppointments", "No appointments")}
          description={t(
            "doctorPatientDetails.noAppointmentsDesc",
            "This patient has no appointment history with you yet."
          )}
          compact
        />
      </div>
    );
  }

  return (
    <div className="glass-card space-y-3">
      {appointments.map((appt) => (
        <div
          key={appt.id}
          className="flex items-center gap-4 rounded-2xl border border-slate-100 dark:border-slate-800 p-3.5"
        >
          <div className="w-24 shrink-0">
            <p className="font-semibold text-sm">{appt.date}</p>
            <p className="text-xs text-slate-400">{appt.time}</p>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-600 dark:text-slate-300 truncate">
              {appt.reason || "—"}
            </p>
            {appt.decisionNote && (
              <p className="text-xs text-slate-400 mt-0.5">
                {t("doctorPatientDetails.note", "Note")}: {appt.decisionNote}
              </p>
            )}
          </div>
          <span
            className={`badge shrink-0 capitalize ${
              APPT_STATUS_STYLES[appt.status] || APPT_STATUS_STYLES.pending
            }`}
          >
            {appt.status.replace("_", " ")}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ==================================================================
   REPORTS
================================================================== */

function ReportsTab({ reports }) {
  const t = useT();

  if (reports.length === 0) {
    return (
      <div className="glass-card">
        <EmptyState
          icon={FiFileText}
          title={t("doctorPatientDetails.noReports", "No reports")}
          description={t(
            "doctorPatientDetails.noReportsDesc",
            "Lab, imaging and other reports for this patient will appear here."
          )}
          compact
        />
      </div>
    );
  }

  return (
    <div className="glass-card space-y-3">
      {reports.map((report) => (
        <div
          key={report.id}
          className="flex items-center gap-4 rounded-2xl border border-slate-100 dark:border-slate-800 p-3.5"
        >
          <div className="w-10 h-10 shrink-0 rounded-xl bg-brand-50 dark:bg-brand-950/40 text-brand-500 flex items-center justify-center">
            <FiFileText size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate">{report.title}</p>
            <p className="text-xs text-slate-400">
              {report.type} · {report.reportDate}
            </p>
            {report.result && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{report.result}</p>
            )}
          </div>
          <span className={`badge shrink-0 ${statusColor(report.status)}`}>{report.status}</span>
        </div>
      ))}
    </div>
  );
}

/* ==================================================================
   PRESCRIPTIONS
================================================================== */

function PrescriptionsTab({ prescriptions, onAdd }) {
  const t = useT();

  return (
    <div className="glass-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold">
          {t("doctorPatientDetails.tab.prescriptions", "Prescriptions")}
        </h3>
        <button
          type="button"
          onClick={onAdd}
          className="btn-primary text-xs inline-flex items-center gap-1.5"
        >
          <FiPlus size={13} />
          {t("doctorPatientDetails.newPrescription", "New Prescription")}
        </button>
      </div>

      {prescriptions.length === 0 ? (
        <EmptyState
          icon={FiActivity}
          title={t("doctorPatientDetails.noPrescriptions", "No prescriptions")}
          description={t(
            "doctorPatientDetails.noPrescriptionsDesc",
            "Medicines you prescribe for this patient will appear here."
          )}
          compact
        />
      ) : (
        <div className="space-y-3">
          {prescriptions.map((rx) => (
            <div
              key={rx.id}
              className="rounded-2xl border border-slate-100 dark:border-slate-800 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-sm">{rx.medicine}</p>
                <p className="text-xs text-slate-400">{formatDate(rx.createdAt)}</p>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {[rx.dosage, rx.frequency, rx.duration].filter(Boolean).join(" · ") || "—"}
              </p>
              {rx.instructions && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {rx.instructions}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ==================================================================
   MODALS
================================================================== */

function NoteModal({ open, onClose, patientId, appointments, onCreated }) {
  const t = useT();
  const [form, setForm] = useState({
    diagnosis: "",
    symptoms: "",
    treatment: "",
    notes: "",
    followUpDate: "",
    appointmentId: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm({
        diagnosis: "",
        symptoms: "",
        treatment: "",
        notes: "",
        followUpDate: "",
        appointmentId: "",
      });
      setError("");
    }
  }, [open]);

  const update = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const data = await doctorPortalService.addNote(patientId, {
        ...form,
        appointmentId: form.appointmentId || undefined,
      });
      onCreated(data.entry);
      onClose();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={t("doctorPatientDetails.addDoctorNote", "Add Doctor Note")}
      size="md"
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}

        <Field label={t("doctorPatientDetails.diagnosis", "Diagnosis")}>
          <input value={form.diagnosis} onChange={update("diagnosis")} className="input-field" />
        </Field>
        <Field label={t("doctorPatientDetails.symptoms", "Symptoms")}>
          <textarea
            rows={2}
            value={form.symptoms}
            onChange={update("symptoms")}
            className="input-field resize-none"
          />
        </Field>
        <Field
          label={t("doctorPatientDetails.treatmentPlan", "Treatment / Treatment plan")}
        >
          <textarea
            rows={2}
            value={form.treatment}
            onChange={update("treatment")}
            className="input-field resize-none"
          />
        </Field>
        <Field label={t("doctorPatientDetails.notes", "Notes")}>
          <textarea
            rows={2}
            value={form.notes}
            onChange={update("notes")}
            className="input-field resize-none"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t("doctorPatientDetails.followUpDate", "Follow-up date")}>
            <DatePicker
              value={form.followUpDate}
              onChange={(iso) => update("followUpDate")({ target: { value: iso } })}
              placeholder={t("doctorPatientDetails.selectDate", "Select date")}
              ariaLabel="Follow-up date"
              className="input-field input-icon w-full"
            />
          </Field>

          {appointments.length > 0 && (
            <Field label={t("doctorPatientDetails.relatedAppointment", "Related appointment")}>
              <SelectDropdown
                value={form.appointmentId}
                onChange={(value) => update("appointmentId")({ target: { value } })}
                options={[
                  { value: "", label: t("doctorPatientDetails.none", "None") },
                  ...appointments.map((appt) => ({
                    value: String(appt.id),
                    label: `${appt.date} ${appt.time}`,
                  })),
                ]}
                ariaLabel="Related appointment"
                className="w-full"
              />
            </Field>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary flex-1">
            {t("action.cancel", "Cancel")}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn-primary flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving && <Spinner size={14} />}
            {saving
              ? t("doctorPatientDetails.saving", "Saving...")
              : t("doctorPatientDetails.saveNote", "Save Note")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PrescriptionModal({ open, onClose, patientId, onCreated }) {
  const t = useT();
  const [form, setForm] = useState({
    medicine: "",
    dosage: "",
    frequency: "",
    duration: "",
    instructions: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm({ medicine: "", dosage: "", frequency: "", duration: "", instructions: "" });
      setError("");
    }
  }, [open]);

  const update = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const data = await doctorPortalService.addPrescription(patientId, form);
      onCreated(data.prescription);
      onClose();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={t("doctorPatientDetails.newPrescription", "New Prescription")}
      size="md"
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}

        <Field label={t("doctorPatientDetails.medicine", "Medicine")} required>
          <input
            value={form.medicine}
            onChange={update("medicine")}
            className="input-field"
            required
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t("doctorPatientDetails.dosage", "Dosage")}>
            <input
              value={form.dosage}
              onChange={update("dosage")}
              placeholder={t("doctorPatientDetails.dosagePlaceholder", "e.g. 500mg")}
              className="input-field"
            />
          </Field>
          <Field label={t("doctorPatientDetails.frequency", "Frequency")}>
            <input
              value={form.frequency}
              onChange={update("frequency")}
              placeholder={t("doctorPatientDetails.frequencyPlaceholder", "e.g. Twice daily")}
              className="input-field"
            />
          </Field>
        </div>

        <Field label={t("doctorPatientDetails.duration", "Duration")}>
          <input
            value={form.duration}
            onChange={update("duration")}
            placeholder={t("doctorPatientDetails.durationPlaceholder", "e.g. 7 days")}
            className="input-field"
          />
        </Field>

        <Field label={t("doctorPatientDetails.instructions", "Instructions")}>
          <textarea
            rows={2}
            value={form.instructions}
            onChange={update("instructions")}
            className="input-field resize-none"
          />
        </Field>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary flex-1">
            {t("action.cancel", "Cancel")}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn-primary flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving && <Spinner size={14} />}
            {saving
              ? t("doctorPatientDetails.saving", "Saving...")
              : t("doctorPatientDetails.savePrescription", "Save Prescription")}
          </button>
        </div>
      </form>
    </Modal>
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

function formatDate(value) {
  if (!value) return "—";
  const stamp = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
