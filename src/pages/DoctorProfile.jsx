import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiMail,
  FiPhone,
  FiBriefcase,
  FiAward,
  FiClock,
  FiSave,
  FiLock,
} from "react-icons/fi";

import doctorPortalService from "../services/doctorPortalService.js";
import authService from "../services/authService.js";
import { useAuth } from "../hooks/useAuth.js";
import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";
import { Alert, Spinner } from "../components/ui/States.jsx";
import { Skeleton } from "../components/ui/Skeleton.jsx";
import SelectDropdown from "../components/ui/SelectDropdown.jsx";
import WeeklyHours from "../components/WeeklyHours.jsx";

const AVAILABILITY_OPTIONS = [
  { value: "Available", key: "doctorProfile.availability.available" },
  { value: "In Surgery", key: "doctorProfile.availability.inSurgery" },
  { value: "On Leave", key: "doctorProfile.availability.onLeave" },
  { value: "Unavailable", key: "doctorProfile.availability.unavailable" },
];

export default function DoctorProfile() {
  const { logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const t = useT();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({ phone: "", bio: "", availability: "Available" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordError, setPasswordError] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    doctorPortalService
      .profile()
      .then((data) => {
        setProfile(data.doctor);
        setForm({
          phone: data.doctor.phone || "",
          bio: data.doctor.bio || "",
          availability: data.doctor.availability,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const update = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const data = await doctorPortalService.updateProfile(form);
      setProfile(data.doctor);
      toast.success("Profile updated.");
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  };

  const updatePassword = (field) => (event) => {
    setPasswords((current) => ({ ...current, [field]: event.target.value }));
    setPasswordErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submitPassword = async (event) => {
    event.preventDefault();

    if (passwords.newPassword !== passwords.confirmPassword) {
      setPasswordErrors({ confirmPassword: "Passwords do not match." });
      return;
    }

    setSavingPassword(true);
    setPasswordError("");

    try {
      await authService.changePassword(passwords.currentPassword, passwords.newPassword);
      toast.success("Password updated. Please sign in again.");
      await logout();
      navigate("/login", { replace: true });
    } catch (caught) {
      setPasswordErrors(caught?.errors || {});
      setPasswordError(caught?.message || "Could not update password.");
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="glass-card space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass p-5 sm:p-6 flex items-center gap-4"
      >
        <div className="w-16 h-16 shrink-0 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white flex items-center justify-center text-xl font-bold">
          {profile.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold truncate">{profile.name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {profile.specialization} {profile.department ? `· ${profile.department}` : ""}
          </p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ---- read-only details ---- */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="glass-card"
        >
          <h2 className="font-bold mb-4">
            {t("doctorProfile.professionalDetails", "Professional Details")}
          </h2>
          <dl className="space-y-3 text-sm">
            <Row icon={FiMail} label={t("label.email", "Email")} value={profile.email} />
            <Row
              icon={FiAward}
              label={t("doctorProfile.qualification", "Qualification")}
              value={profile.qualification || "—"}
            />
            <Row
              icon={FiBriefcase}
              label={t("doctorProfile.experience", "Experience")}
              value={`${profile.experienceYears} ${t("doctorProfile.years", "years")}`}
            />
            <Row
              icon={FiClock}
              label={t("doctorProfile.consultationFee", "Consultation fee")}
              value={`₹${Number(profile.consultationFee).toLocaleString("en-IN")}`}
            />
          </dl>
          <p className="text-[11px] text-slate-400 mt-4">
            {t(
              "doctorProfile.managedByAdmin",
              "Specialization, department, and fee are managed by the administrator."
            )}
          </p>
        </motion.div>

        {/* ---- editable fields ---- */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="glass-card"
        >
          <h2 className="font-bold mb-4">{t("doctorProfile.updateProfile", "Update Profile")}</h2>

          <form onSubmit={submit} className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}

            <div>
              <label className="block text-sm font-medium mb-1.5 flex items-center gap-1.5">
                <FiPhone size={13} />
                {t("label.phone", "Phone")}
              </label>
              <input
                value={form.phone}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    phone: event.target.value.replace(/\D/g, "").slice(0, 10),
                  }))
                }
                maxLength={10}
                inputMode="numeric"
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                {t("doctorProfile.availabilityLabel", "Availability")}
              </label>
              <SelectDropdown
                value={form.availability}
                onChange={(value) => update("availability")({ target: { value } })}
                options={AVAILABILITY_OPTIONS.map(({ value, key }) => ({
                  value,
                  label: t(key, value),
                }))}
                ariaLabel="Availability"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                {t("doctorProfile.bio", "Bio")}
              </label>
              <textarea
                rows={3}
                value={form.bio}
                onChange={update("bio")}
                className="input-field resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-60"
            >
              {saving ? <Spinner size={14} /> : <FiSave size={14} />}
              {saving
                ? t("doctorProfile.saving", "Saving...")
                : t("profile.saveChanges", "Save Changes")}
            </button>
          </form>
        </motion.div>
      </div>

      {/* ---- weekly clinic hours ---- */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.12 }}
        className="glass-card"
      >
        <h2 className="font-bold mb-1 flex items-center gap-2">
          <FiClock size={16} className="text-slate-400" />
          {t("doctorProfile.weeklyClinicHours", "Weekly Clinic Hours")}
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          {t(
            "doctorProfile.clinicHoursDesc",
            "The timetable your appointment slots are generated from."
          )}
        </p>

        <WeeklyHours />
      </motion.div>

      {/* ---- password ---- */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="glass-card"
      >
        <h2 className="font-bold mb-4 flex items-center gap-2">
          <FiLock size={16} />
          {t("profile.changePassword", "Change Password")}
        </h2>

        <form onSubmit={submitPassword} className="space-y-4 max-w-md">
          {passwordError && <Alert tone="error">{passwordError}</Alert>}

          <div>
            <label className="block text-sm font-medium mb-1.5">
              {t("doctorProfile.currentPassword", "Current password")}
            </label>
            <input
              type="password"
              value={passwords.currentPassword}
              onChange={updatePassword("currentPassword")}
              className="input-field"
              required
            />
            {passwordErrors.currentPassword && (
              <p className="text-xs text-red-600 mt-1.5">{passwordErrors.currentPassword}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              {t("doctorProfile.newPassword", "New password")}
            </label>
            <input
              type="password"
              value={passwords.newPassword}
              onChange={updatePassword("newPassword")}
              className="input-field"
              required
            />
            {passwordErrors.newPassword && (
              <p className="text-xs text-red-600 mt-1.5">{passwordErrors.newPassword}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              {t("doctorProfile.confirmNewPassword", "Confirm new password")}
            </label>
            <input
              type="password"
              value={passwords.confirmPassword}
              onChange={updatePassword("confirmPassword")}
              className="input-field"
              required
            />
            {passwordErrors.confirmPassword && (
              <p className="text-xs text-red-600 mt-1.5">{passwordErrors.confirmPassword}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={savingPassword}
            className="btn-secondary text-sm inline-flex items-center gap-2 disabled:opacity-60"
          >
            {savingPassword && <Spinner size={14} />}
            {savingPassword
              ? t("doctorProfile.updating", "Updating...")
              : t("doctorProfile.updatePassword", "Update Password")}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-400 flex items-center gap-1.5">
        <Icon size={12} />
        {label}
      </dt>
      <dd className="font-medium text-right text-slate-700 dark:text-slate-200">{value}</dd>
    </div>
  );
}
