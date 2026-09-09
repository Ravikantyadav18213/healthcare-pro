import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiMail,
  FiShield,
  FiClock,
  FiCalendar,
  FiLock,
  FiLogIn,
  FiPhone,
  FiUser,
  FiSave,
  FiDroplet,
  FiMapPin,
  FiChevronDown,
  FiCheck,
} from "react-icons/fi";

import { useAuth } from "../hooks/useAuth.js";
import { useTheme } from "../hooks/useTheme.js";
import { useToast } from "../context/ToastContext.jsx";
import { patientService } from "../services/adminService.js";
import { authService } from "../services/authService.js";
import { useLanguage } from "../context/LanguageContext.jsx";
import { useBrowserNotifications } from "../hooks/useBrowserNotifications.js";
import { roleLabel } from "../constants/roles.js";
import { Alert, Spinner } from "../components/ui/States.jsx";
import { Skeleton } from "../components/ui/Skeleton.jsx";
import DatePicker from "../components/ui/DatePicker.jsx";
import SelectDropdown from "../components/ui/SelectDropdown.jsx";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function Profile() {
  const { user, isPatient, updateProfile, changePassword } = useAuth();
  const { dark, toggleTheme } = useTheme();
  const toast = useToast();
  const navigate = useNavigate();

  const { language, setLanguage, languages, t } = useLanguage();
  const desktop = useBrowserNotifications();

  /* Mirrors user.twoFactorEnabled, kept locally so the switch moves
     the moment it is clicked rather than after the refetch. */
  const [twoFactor, setTwoFactor] = useState(Boolean(user?.twoFactorEnabled));
  const [savingTwoFactor, setSavingTwoFactor] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState("");

  useEffect(() => {
    setTwoFactor(Boolean(user?.twoFactorEnabled));
  }, [user?.twoFactorEnabled]);

  const toggleTwoFactor = async () => {
    const next = !twoFactor;

    setSavingTwoFactor(true);
    setTwoFactorError("");
    setTwoFactor(next);

    try {
      await authService.setTwoFactor(next);
      toast.success(
        next ? "Two-factor sign-in is on." : "Two-factor sign-in is off."
      );
    } catch (caught) {
      /* Put the switch back where it was — the server said no. */
      setTwoFactor(!next);
      setTwoFactorError(caught.message || "Could not change that setting.");
    } finally {
      setSavingTwoFactor(false);
    }
  };

  /* ---- account form ---- */
  const [account, setAccount] = useState({
    name: "",
    phone: "",
    dateOfBirth: "",
    gender: "",
  });
  const [accountErrors, setAccountErrors] = useState({});
  const [accountError, setAccountError] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);

  /* ---- medical profile (patients only) ---- */
  const [medical, setMedical] = useState(null);
  const [medicalLoading, setMedicalLoading] = useState(isPatient);
  const [savingMedical, setSavingMedical] = useState(false);

  /* ---- password ---- */
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordError, setPasswordError] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (!user) return;

    setAccount({
      name: user.name || "",
      phone: user.phone || "",
      dateOfBirth: user.dateOfBirth || "",
      gender: user.gender || "",
    });
  }, [user]);

  const loadMedical = useCallback(async () => {
    /* Medical Profile is a patient concept. An admin or doctor
       reading this page should not fetch — let alone materialise —
       a patients row keyed to their own clinician/admin account. */
    if (!isPatient) return;

    setMedicalLoading(true);

    try {
      const data = await patientService.mine();
      setMedical(
        data.patient
          ? {
              phone: data.patient.phone || "",
              dateOfBirth: data.patient.dateOfBirth || "",
              gender: data.patient.gender || "",
              bloodGroup: data.patient.bloodGroup || "",
              address: data.patient.address || "",
              emergencyContact: data.patient.emergencyContact || "",
            }
          : null
      );
    } catch {
      setMedical(null);
    } finally {
      setMedicalLoading(false);
    }
  }, [isPatient]);

  useEffect(() => {
    loadMedical();
  }, [loadMedical]);

  const saveAccount = async (event) => {
    event.preventDefault();

    setSavingAccount(true);
    setAccountError("");
    setAccountErrors({});

    try {
      await updateProfile(account);
      toast.success("Profile updated.");
    } catch (caught) {
      setAccountErrors(caught?.errors || {});
      setAccountError(caught.message);
    } finally {
      setSavingAccount(false);
    }
  };

  const saveMedical = async (event) => {
    event.preventDefault();
    setSavingMedical(true);

    try {
      await patientService.updateMine(medical);
      toast.success("Medical profile updated.");
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setSavingMedical(false);
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();

    setPasswordError("");
    setPasswordErrors({});

    if (passwords.newPassword !== passwords.confirmPassword) {
      setPasswordErrors({ confirmPassword: "Passwords do not match." });
      return;
    }

    setSavingPassword(true);

    try {
      await changePassword(passwords.currentPassword, passwords.newPassword);
      toast.success("Password changed. Please sign in again.");
      navigate("/login", {
        replace: true,
        state: { notice: "Your password was changed. Please sign in again." },
      });
    } catch (caught) {
      setPasswordErrors(caught?.errors || {});
      setPasswordError(caught.message);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass p-5 sm:p-6 flex flex-wrap items-center gap-4"
      >
        <div className="w-16 h-16 shrink-0 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center text-2xl font-bold">
          {user?.name?.[0]?.toUpperCase() || "U"}
        </div>

        <div className="min-w-0">
          <h1 className="text-xl font-bold truncate">{user?.name}</h1>
          <p className="text-sm text-slate-400 truncate">{user?.email}</p>
          <span className="badge mt-2 inline-block bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            {roleLabel(user?.role)}
          </span>
        </div>
      </motion.div>

      {/* ============ ACCOUNT DETAILS ============ */}

      <section className="glass-card">
        <h2 className="font-semibold mb-1">{t("profile.accountDetails", "Account Details")}</h2>
        <p className="text-xs text-slate-400 mb-5">
          {t(
            "profile.accountDetailsNote",
            "Your role is assigned by the system and cannot be changed here."
          )}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <ReadOnly icon={FiMail} label={t("label.email", "Email")} value={user?.email} />
          <ReadOnly icon={FiShield} label={t("profile.role", "Role")} value={roleLabel(user?.role)} />
          <ReadOnly
            icon={FiLogIn}
            label={t("profile.accountStatus", "Account status")}
            value={
              user?.status === "inactive"
                ? t("profile.inactive", "Inactive")
                : t("profile.active", "Active")
            }
          />
          <ReadOnly
            icon={FiClock}
            label={t("profile.lastSignIn", "Last sign-in")}
            value={user?.lastLogin ? new Date(user.lastLogin).toLocaleString() : "—"}
          />
          <ReadOnly
            icon={FiCalendar}
            label={t("profile.registered", "Registered")}
            value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
          />
          <ReadOnly
            icon={FiLogIn}
            label={t("profile.totalSignIns", "Total sign-ins")}
            value={String(user?.loginCount ?? 0)}
          />
        </div>

        <form onSubmit={saveAccount} className="space-y-4" noValidate>
          {accountError && <Alert tone="error">{accountError}</Alert>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t("profile.fullName", "Full name")} required error={accountErrors.name}>
              <div className="relative">
                <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input
                  value={account.name}
                  onChange={(event) => setAccount({ ...account, name: event.target.value })}
                  className="input-field input-icon"
                />
              </div>
            </Field>

            <Field label={t("label.phone", "Phone")} error={accountErrors.phone}>
              <div className="relative">
                <FiPhone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input
                  value={account.phone}
                  onChange={(event) =>
                    setAccount({ ...account, phone: event.target.value.replace(/\D/g, "").slice(0, 10) })
                  }
                  maxLength={10}
                  inputMode="numeric"
                  className="input-field input-icon"
                />
              </div>
            </Field>

            <Field
              label={t("profile.dateOfBirth", "Date of birth")}
              error={accountErrors.dateOfBirth}
            >
              <DatePicker
                value={account.dateOfBirth}
                onChange={(iso) => setAccount({ ...account, dateOfBirth: iso })}
                max={new Date().toISOString().slice(0, 10)}
                placeholder={t("profile.selectDateOfBirth", "Select date of birth")}
                ariaLabel="Date of birth"
                className="input-field input-icon w-full"
              />
            </Field>

            <Field label={t("profile.gender", "Gender")}>
              <SelectDropdown
                value={account.gender}
                onChange={(value) => setAccount({ ...account, gender: value })}
                options={[
                  { value: "", label: t("profile.preferNotToSay", "Prefer not to say") },
                  { value: "Female", label: t("profile.female", "Female") },
                  { value: "Male", label: t("profile.male", "Male") },
                  { value: "Other", label: t("profile.otherGender", "Other") },
                ]}
                ariaLabel="Gender"
                className="w-full"
              />
            </Field>
          </div>

          <button
            type="submit"
            disabled={savingAccount}
            className="btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-60"
          >
            {savingAccount ? <Spinner size={14} /> : <FiSave size={15} />}
            {savingAccount
              ? t("action.saving", "Saving...")
              : t("profile.saveChanges", "Save Changes")}
          </button>
        </form>
      </section>

      {/* ============ MEDICAL PROFILE ============ */}

      {isPatient && (
        <section className="glass-card">
          <h2 className="font-semibold mb-1">{t("profile.medicalProfile", "Medical Profile")}</h2>
          <p className="text-xs text-slate-400 mb-5">
            {t(
              "profile.medicalProfileNote",
              "Shared with clinicians when you book an appointment."
            )}
          </p>

          {medicalLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-12 rounded-xl" />
              ))}
            </div>
          ) : !medical ? (
            <p className="text-sm text-slate-400">
              {t(
                "profile.noPatientProfile",
                "No patient profile is linked to your account yet."
              )}
            </p>
          ) : (
            <form onSubmit={saveMedical} className="space-y-4" noValidate>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label={t("profile.bloodGroup", "Blood group")}>
                  <div className="relative">
                    <FiDroplet className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" size={15} />
                    <SelectDropdown
                      value={medical.bloodGroup}
                      onChange={(value) => setMedical({ ...medical, bloodGroup: value })}
                      options={[
                        { value: "", label: t("profile.unknown", "Unknown") },
                        ...BLOOD_GROUPS.map((group) => ({ value: group, label: group })),
                      ]}
                      ariaLabel="Blood group"
                      className="input-icon w-full"
                    />
                  </div>
                </Field>

                <Field label={t("profile.emergencyContact", "Emergency contact")}>
                  <div className="relative">
                    <FiPhone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                    <input
                      value={medical.emergencyContact}
                      onChange={(event) =>
                        setMedical({
                          ...medical,
                          emergencyContact: event.target.value.replace(/\D/g, "").slice(0, 10),
                        })
                      }
                      maxLength={10}
                      inputMode="numeric"
                      placeholder="+91 90000 00000"
                      className="input-field input-icon"
                    />
                  </div>
                </Field>
              </div>

              <Field label={t("profile.address", "Address")}>
                <div className="relative">
                  <FiMapPin className="absolute left-3 top-3 text-slate-400" size={15} />
                  <textarea
                    rows={2}
                    value={medical.address}
                    onChange={(event) =>
                      setMedical({ ...medical, address: event.target.value })
                    }
                    className="input-field input-icon resize-none"
                  />
                </div>
              </Field>

              <button
                type="submit"
                disabled={savingMedical}
                className="btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-60"
              >
                {savingMedical ? <Spinner size={14} /> : <FiSave size={15} />}
                {savingMedical
                  ? t("action.saving", "Saving...")
                  : t("profile.saveMedicalProfile", "Save Medical Profile")}
              </button>
            </form>
          )}
        </section>
      )}

      {/* ============ PASSWORD ============ */}

      <section className="glass-card">
        <h2 className="font-semibold mb-1">{t("profile.changePassword", "Change Password")}</h2>
        <p className="text-xs text-slate-400 mb-5">
          {t(
            "profile.changePasswordNote",
            "Changing your password signs you out of every device."
          )}
        </p>

        <form onSubmit={savePassword} className="space-y-4" noValidate>
          {passwordError && <Alert tone="error">{passwordError}</Alert>}

          <Field
            label={t("profile.currentPassword", "Current password")}
            required
            error={passwordErrors.currentPassword}
          >
            <div className="relative">
              <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                type="password"
                autoComplete="current-password"
                value={passwords.currentPassword}
                onChange={(event) =>
                  setPasswords({ ...passwords, currentPassword: event.target.value })
                }
                className="input-field input-icon"
              />
            </div>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label={t("profile.newPassword", "New password")}
              required
              error={passwordErrors.newPassword}
              hint={t(
                "profile.passwordHint",
                "At least 8 characters with a letter and a number."
              )}
            >
              <input
                type="password"
                autoComplete="new-password"
                value={passwords.newPassword}
                onChange={(event) =>
                  setPasswords({ ...passwords, newPassword: event.target.value })
                }
                className="input-field"
              />
            </Field>

            <Field
              label={t("profile.confirmPassword", "Confirm new password")}
              required
              error={passwordErrors.confirmPassword}
            >
              <input
                type="password"
                autoComplete="new-password"
                value={passwords.confirmPassword}
                onChange={(event) =>
                  setPasswords({ ...passwords, confirmPassword: event.target.value })
                }
                className="input-field"
              />
            </Field>
          </div>

          <button
            type="submit"
            disabled={
              savingPassword ||
              !passwords.currentPassword ||
              !passwords.newPassword
            }
            className="btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {savingPassword ? <Spinner size={14} /> : <FiLock size={15} />}
            {savingPassword
              ? t("profile.updating", "Updating...")
              : t("profile.changePassword", "Change Password")}
          </button>
        </form>
      </section>

      {/* ============ PREFERENCES ============ */}

      <section className="glass-card space-y-4">
        <h2 className="font-semibold">{t("profile.preferences", "Preferences")}</h2>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-medium">{t("label.darkMode", "Dark mode")}</span>
          <button
            type="button"
            onClick={toggleTheme}
            role="switch"
            aria-checked={dark}
            aria-label="Toggle dark mode"
            className={`w-11 h-6 rounded-full transition-colors relative ${
              dark ? "bg-brand-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                dark ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
          <span className="text-sm font-medium">{t("label.language", "Language")}</span>

          {/* Real translation, not a cosmetic preference: picking a
              language re-renders the app and saves to the account. */}
          <SelectDropdown
            value={language}
            onChange={setLanguage}
            options={languages.map((item) => ({
              value: item.code,
              label: item.native === item.label ? item.label : `${item.native} · ${item.label}`,
            }))}
            ariaLabel="Interface language"
            className="w-full sm:w-52"
          />
        </div>

        {/* ---- desktop notifications ---- */}

        {desktop.supported && (
          <div className="flex flex-wrap items-start justify-between gap-3 pt-1">
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium">
                {t("profile.desktopNotifications", "Desktop notifications")}
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {desktop.blocked
                  ? t(
                      "profile.notificationsBlocked",
                      "Blocked by your browser. Allow notifications for this site in your browser settings first."
                    )
                  : desktop.enabled
                  ? t(
                      "profile.notificationsOn",
                      "You'll be alerted even when this tab is in the background."
                    )
                  : t(
                      "profile.notificationsOff",
                      "Get alerted about new messages and approvals when this tab isn't in front."
                    )}
              </p>
            </div>

            <button
              type="button"
              onClick={() => (desktop.enabled ? desktop.disable() : desktop.enable())}
              disabled={desktop.blocked}
              role="switch"
              aria-checked={desktop.enabled}
              aria-label="Toggle desktop notifications"
              className={`w-11 h-6 shrink-0 rounded-full transition-colors relative disabled:opacity-50 disabled:cursor-not-allowed ${
                desktop.enabled ? "bg-brand-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  desktop.enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        )}

        {/* ---- two-factor sign-in ---- */}

        <div className="flex flex-wrap items-start justify-between gap-3 pt-1">
          <div className="min-w-0 flex-1">
            <span className="text-sm font-medium">
              {t("label.twoFactor", "Two-factor sign-in")}
            </span>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {twoFactor
                ? t(
                    "profile.twoFactorOn",
                    "A one-time code is emailed to you every time you sign in."
                  )
                : t(
                    "profile.twoFactorOff",
                    "Add a second step: we email a code you must enter to sign in."
                  )}
            </p>
            {twoFactorError && (
              <p className="text-xs text-red-600 mt-1.5">{twoFactorError}</p>
            )}
          </div>

          <button
            type="button"
            onClick={toggleTwoFactor}
            disabled={savingTwoFactor}
            role="switch"
            aria-checked={twoFactor}
            aria-label="Toggle two-factor sign-in"
            className={`w-11 h-6 shrink-0 rounded-full transition-colors relative disabled:opacity-60 ${
              twoFactor ? "bg-brand-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                twoFactor ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-4 py-3 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
          <FiLock className="mt-0.5 shrink-0" />
          {t(
            "profile.passwordStorageNote",
            "Your password is stored only as a bcrypt hash. It is never displayed anywhere in this application."
          )}
        </div>
      </section>
    </div>
  );
}


function ReadOnly({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2.5 min-w-0">
      <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
        <Icon size={11} />
        {label}
      </p>
      <p className="text-sm font-medium mt-0.5 truncate">{value || "—"}</p>
    </div>
  );
}

function Field({ label, required, error, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-red-600 mt-1.5">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-400 mt-1.5">{hint}</p>
      ) : null}
    </div>
  );
}
