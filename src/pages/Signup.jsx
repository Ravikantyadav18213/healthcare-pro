import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  FiUser,
  FiUserPlus,
  FiMail,
  FiLock,
  FiPhone,
  FiEye,
  FiEyeOff,
  FiCheckCircle,
} from "react-icons/fi";

import { useAuth } from "../hooks/useAuth.js";
import { useT } from "../context/LanguageContext.jsx";
import { Alert, PageLoader, Spinner } from "../components/ui/States.jsx";
import GoogleSignInButton, {
  googleSignInAvailable,
} from "../components/GoogleSignInButton.jsx";
import DatePicker from "../components/ui/DatePicker.jsx";
import SelectDropdown from "../components/ui/SelectDropdown.jsx";

const EMPTY = {
  name: "",
  email: "",
  phone: "",
  dateOfBirth: "",
  gender: "",
  password: "",
  confirmPassword: "",
};

/* Nobody signing up was born in the future. */
const todayISO = new Date().toISOString().slice(0, 10);

function passwordScore(value) {
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  return Math.min(score, 4);
}

const STRENGTH = [
  { key: "signup.strength.tooShort", label: "Too short", colour: "bg-red-500", width: "20%" },
  { key: "signup.strength.weak", label: "Weak", colour: "bg-red-500", width: "35%" },
  { key: "signup.strength.fair", label: "Fair", colour: "bg-amber-500", width: "55%" },
  { key: "signup.strength.good", label: "Good", colour: "bg-blue-500", width: "78%" },
  { key: "signup.strength.strong", label: "Strong", colour: "bg-emerald-500", width: "100%" },
];

export default function Signup() {
  const location = useLocation();
  const t = useT();

  /* An email typed on the sign-in card comes across with the switch. */
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    email: location.state?.email || "",
  }));
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const { signup, loginWithGoogle, logout, isAuthenticated, initialising } = useAuth();
  const navigate = useNavigate();

  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState("");

  /*
   * Same rule as the sign-in page: reaching Sign Up means the visitor
   * wants a fresh account, so any live session is ended first rather
   * than redirecting them into a dashboard.
   */
  const [preparing, setPreparing] = useState(true);
  const alreadyCleared = useRef(false);

  useEffect(() => {
    if (initialising || alreadyCleared.current) return;

    alreadyCleared.current = true;

    if (isAuthenticated) {
      logout().finally(() => setPreparing(false));
    } else {
      setPreparing(false);
    }
  }, [initialising, isAuthenticated, logout]);

  const strength = useMemo(
    () => STRENGTH[passwordScore(form.password)],
    [form.password]
  );

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setError("");
  };

  const submit = async (event) => {
    event.preventDefault();

    setError("");
    setSuccess("");
    setFieldErrors({});

    if (form.password !== form.confirmPassword) {
      setFieldErrors({ confirmPassword: "Passwords do not match." });
      return;
    }

    setLoading(true);

    try {
      /* The API always creates role = "user". There is no way to
         request the administrator role from this form. */
      const created = await signup({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined,
        password: form.password,
        confirmPassword: form.confirmPassword,
      });

      setSuccess("Account created. Turning to sign in...");

      /*
       * No session is created by registration, so the new patient
       * signs in once to verify the credentials they just chose. The
       * pause lets the page turn read as a page turn.
       */
      setTimeout(() => {
        navigate("/login", {
          replace: true,
          state: {
            notice: "Account created successfully. Please sign in to continue.",
            email: created?.email || form.email.trim(),
            from: location.state?.from,
          },
        });
      }, 900);
    } catch (caught) {
      setFieldErrors(caught?.errors || {});
      setError(caught?.message || "We could not create your account.");
    } finally {
      setLoading(false);
    }
  };

  /*
   * Unlike the form above, this creates a live session right away —
   * Google has already verified the email, so there is nothing left
   * to confirm by sending the person to sign in a second time.
   */
  const handleGoogle = async (credential) => {
    setGoogleError("");
    setGoogleLoading(true);

    try {
      const user = await loginWithGoogle(credential);
      const destination =
        user.role === "admin"
          ? "/admin"
          : user.role === "doctor"
          ? "/doctor/dashboard"
          : "/dashboard";

      navigate(destination, { replace: true });
    } catch (caught) {
      setGoogleError(caught?.message || "Google sign-up failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const inputClass = (field) =>
    `w-full h-11 rounded-xl border pl-11 pr-4 text-slate-800 outline-none transition focus:ring-2 focus:ring-brand-500 focus:border-brand-500 ${
      fieldErrors[field] ? "border-red-300 bg-red-50/50" : "border-slate-200"
    }`;

  if (initialising || preparing) {
    return <PageLoader label={t("signup.preparing", "Preparing registration...")} />;
  }

  return (
    <div className="w-full max-w-xl bg-white rounded-3xl shadow-xl ring-1 ring-slate-100 p-5 sm:p-7">

      <div className="flex flex-col items-center text-center mb-4">
        <span className="w-10 h-10 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-2">
          <FiUserPlus size={20} />
        </span>

        <h2 className="text-xl font-bold text-slate-800">
          {t("signup.title", "Sign Up")}
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          {t("signup.subtitle", "Create your account to get started")}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3" noValidate>

        {/* NAME */}
        <div>
          <label htmlFor="su-name" className="block text-sm font-medium text-slate-700 mb-1">
            {t("signup.nameLabel", "Full Name")}
          </label>

          <div className="relative">
            <FiUser className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input
              id="su-name"
              type="text"
              autoComplete="name"
              placeholder={t("signup.namePlaceholder", "Enter your full name")}
              value={form.name}
              onChange={update("name")}
              className={inputClass("name")}
              required
            />
          </div>

          {fieldErrors.name && (
            <p className="text-xs text-red-600 mt-1.5">{fieldErrors.name}</p>
          )}
        </div>

        {/* EMAIL */}
        <div>
          <label htmlFor="su-email" className="block text-sm font-medium text-slate-700 mb-1">
            {t("signup.emailLabel", "Email Address")}
          </label>

          <div className="relative">
            <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input
              id="su-email"
              type="email"
              autoComplete="email"
              placeholder={t("signup.emailPlaceholder", "Enter your email address")}
              value={form.email}
              onChange={update("email")}
              className={inputClass("email")}
              required
            />
          </div>

          {fieldErrors.email && (
            <p className="text-xs text-red-600 mt-1.5">{fieldErrors.email}</p>
          )}
        </div>

        {/* PHONE + DATE OF BIRTH */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="su-phone" className="block text-sm font-medium text-slate-700 mb-1">
              {t("signup.phoneLabel", "Phone Number")}
            </label>

            <div className="relative">
              <FiPhone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                id="su-phone"
                type="tel"
                autoComplete="tel"
                placeholder="+91 90000 00000"
                value={form.phone}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, "").slice(0, 10);
                  setForm((current) => ({ ...current, phone: digits }));
                  setFieldErrors((current) => ({ ...current, phone: undefined }));
                  setError("");
                }}
                maxLength={10}
                inputMode="numeric"
                className={inputClass("phone")}
                required
              />
            </div>

            {fieldErrors.phone && (
              <p className="text-xs text-red-600 mt-1.5">{fieldErrors.phone}</p>
            )}
          </div>

          <div>
            <label htmlFor="su-dob" className="block text-sm font-medium text-slate-700 mb-1">
              {t("signup.dobLabel", "Date of Birth")}
              <span className="text-slate-400 font-normal"> {t("signup.optional", "(optional)")}</span>
            </label>

            <DatePicker
              id="su-dob"
              value={form.dateOfBirth}
              onChange={(iso) => update("dateOfBirth")({ target: { value: iso } })}
              max={todayISO}
              placeholder={t("signup.dobPlaceholder", "Select date of birth")}
              ariaLabel="Date of birth"
              className={inputClass("dateOfBirth")}
            />

            {fieldErrors.dateOfBirth && (
              <p className="text-xs text-red-600 mt-1.5">{fieldErrors.dateOfBirth}</p>
            )}
          </div>
        </div>

        {/* GENDER */}
        <div>
          <label htmlFor="su-gender" className="block text-sm font-medium text-slate-700 mb-1">
            {t("signup.genderLabel", "Gender")}
            <span className="text-slate-400 font-normal"> {t("signup.optional", "(optional)")}</span>
          </label>

          <SelectDropdown
            id="su-gender"
            value={form.gender}
            onChange={(value) => update("gender")({ target: { value } })}
            options={[
              { value: "", label: t("signup.genderPreferNot", "Prefer not to say") },
              { value: "Female", label: t("signup.genderFemale", "Female") },
              { value: "Male", label: t("signup.genderMale", "Male") },
              { value: "Other", label: t("signup.genderOther", "Other") },
            ]}
            ariaLabel="Gender"
            className="w-full h-11"
          />
        </div>

        {/* PASSWORD + CONFIRM */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="su-password" className="block text-sm font-medium text-slate-700 mb-1">
              {t("signup.passwordLabel", "Password")}
            </label>

            <div className="relative">
              <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                id="su-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder={t("signup.passwordPlaceholder", "Create password")}
                value={form.password}
                onChange={update("password")}
                className={`${inputClass("password")} pr-12`}
                required
              />

              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 transition"
              >
                {showPassword ? <FiEyeOff size={17} /> : <FiEye size={17} />}
              </button>
            </div>

            {fieldErrors.password && (
              <p className="text-xs text-red-600 mt-1.5">{fieldErrors.password}</p>
            )}
          </div>

          <div>
            <label htmlFor="su-confirm" className="block text-sm font-medium text-slate-700 mb-1">
              {t("signup.confirmLabel", "Confirm Password")}
            </label>

            <div className="relative">
              <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                id="su-confirm"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                placeholder={t("signup.confirmPlaceholder", "Confirm password")}
                value={form.confirmPassword}
                onChange={update("confirmPassword")}
                className={`${inputClass("confirmPassword")} pr-12`}
                required
              />

              <button
                type="button"
                onClick={() => setShowConfirm((current) => !current)}
                aria-label={showConfirm ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 transition"
              >
                {showConfirm ? <FiEyeOff size={17} /> : <FiEye size={17} />}
              </button>
            </div>

            {fieldErrors.confirmPassword && (
              <p className="text-xs text-red-600 mt-1.5">
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>
        </div>

        {/* STRENGTH */}
        {form.password && (
          <div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${strength.colour}`}
                style={{ width: strength.width }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              {t("signup.strengthPrefix", "Password strength:")}{" "}
              {t(strength.key, strength.label)}
            </p>
          </div>
        )}

        {error && <Alert tone="error">{error}</Alert>}

        {success && (
          <Alert tone="success">
            <span className="inline-flex items-center gap-2">
              <FiCheckCircle size={15} />
              {success}
            </span>
          </Alert>
        )}

        <button
          type="submit"
          disabled={loading || Boolean(success)}
          className="w-full h-11 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition inline-flex items-center justify-center gap-2"
        >
          {(loading || success) && <Spinner size={16} />}
          {success
            ? t("signup.turningToSignIn", "Turning to sign in...")
            : loading
            ? t("signup.creating", "Creating account...")
            : t("signup.createAccount", "Create Account")}
        </button>

        <p className="text-[11px] text-slate-400 text-center leading-5">
          {t("signup.termsPrefix", "By creating an account you agree to our")}{" "}
          <Link to="/terms" className="text-brand-600 hover:underline">
            {t("signup.termsLink", "Terms")}
          </Link>{" "}
          {t("signup.termsAnd", "and")}{" "}
          <Link to="/privacy" className="text-brand-600 hover:underline">
            {t("signup.privacyLink", "Privacy Policy")}
          </Link>
          {t("signup.termsSuffix", ".")}
        </p>

        {googleSignInAvailable && !success && (
          <>
            <div className="flex items-center gap-3 py-1">
              <span className="flex-1 h-px bg-slate-200" />
              <span className="text-xs font-medium text-slate-400">
                {t("signup.or", "OR")}
              </span>
              <span className="flex-1 h-px bg-slate-200" />
            </div>

            {googleError && <Alert tone="error">{googleError}</Alert>}

            {googleLoading ? (
              <div className="w-full h-11 rounded-xl border border-slate-200 flex items-center justify-center gap-2 text-sm text-slate-500">
                <Spinner size={15} />
                {t("signup.googleSigningUp", "Signing up with Google...")}
              </div>
            ) : (
              <GoogleSignInButton text="signup_with" onCredential={handleGoogle} />
            )}
          </>
        )}
      </form>

      <p className="text-center mt-4 text-sm text-slate-500">
        {t("signup.haveAccount", "Already have an account?")}
        <Link
          to="/login"
          state={{ ...location.state, email: form.email }}
          className="text-brand-600 font-semibold ml-1 hover:text-brand-700"
        >
          {t("signup.signIn", "Sign in")}
        </Link>
      </p>
    </div>
  );
}
