import React, { useEffect, useState } from "react";
import { FiSend } from "react-icons/fi";

import Modal from "./ui/Modal.jsx";
import SelectDropdown from "./ui/SelectDropdown.jsx";
import { Spinner, Alert } from "./ui/States.jsx";
import doctorService from "../services/doctorService.js";
import appointmentService from "../services/appointmentService.js";
import chatService from "../services/chatService.js";

export default function DoctorChatRequestModal({ open, onClose, onRequested }) {
  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);

  const [doctorId, setDoctorId] = useState("");
  const [appointmentId, setAppointmentId] = useState("");
  const [reason, setReason] = useState("");
  const [initialMessage, setInitialMessage] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;

    setDoctorId("");
    setAppointmentId("");
    setReason("");
    setInitialMessage("");
    setError(null);

    setLoadingDoctors(true);
    Promise.all([
      doctorService.list({}),
      appointmentService.mine({ limit: 50 }).catch(() => ({ items: [] })),
    ])
      .then(([doctorData, apptData]) => {
        setDoctors(doctorData.doctors || []);
        setAppointments(apptData.items || []);
      })
      .catch(() => setDoctors([]))
      .finally(() => setLoadingDoctors(false));
  }, [open]);

  const submit = async (event) => {
    event.preventDefault();
    if (!doctorId || reason.trim().length < 3) {
      setError({ message: "Choose a doctor and describe your reason for contacting them." });
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const data = await chatService.requestDoctorChat({
        doctorId: Number(doctorId),
        appointmentId: appointmentId ? Number(appointmentId) : undefined,
        reason: reason.trim(),
        initialMessage: initialMessage.trim() || undefined,
      });

      onRequested?.(data.request);
      onClose();
    } catch (caught) {
      setError(caught);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Request Doctor Chat" size="md">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Your message will not be delivered until the administrator approves this request.
        </p>

        <Alert tone="error">{error?.message}</Alert>

        <div>
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Doctor
          </label>
          <SelectDropdown
            value={doctorId}
            onChange={setDoctorId}
            disabled={loadingDoctors}
            options={[
              {
                value: "",
                label: loadingDoctors ? "Loading doctors..." : "Select a doctor",
              },
              ...doctors.map((doctor) => ({
                value: String(doctor.id),
                label: `${doctor.name} — ${doctor.specialization}`,
              })),
            ]}
            ariaLabel="Doctor"
            className="w-full mt-1"
          />
        </div>

        {appointments.length > 0 && (
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Related appointment (optional)
            </label>
            <SelectDropdown
              value={appointmentId}
              onChange={setAppointmentId}
              options={[
                { value: "", label: "No specific appointment" },
                ...appointments.map((appt) => ({
                  value: String(appt.id),
                  label: `${appt.doctorName} — ${appt.date} ${appt.time}`,
                })),
              ]}
              ariaLabel="Related appointment"
              className="w-full mt-1"
            />
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Reason for contacting the doctor
          </label>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            placeholder="Briefly explain why you need to speak with this doctor..."
            className="input-field mt-1 resize-none"
            required
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Initial message (optional)
          </label>
          <textarea
            value={initialMessage}
            onChange={(event) => setInitialMessage(event.target.value)}
            rows={2}
            placeholder="This will be sent automatically once approved..."
            className="input-field mt-1 resize-none"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="btn-secondary flex-1 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {submitting ? <Spinner size={14} /> : <FiSend size={14} />}
            {submitting ? "Sending..." : "Send Request"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
