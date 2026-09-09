import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FiMail, FiLock, FiEye, FiEyeOff, FiUser, FiArrowRight, FiShield } from "react-icons/fi";

import { useAuth } from "../hooks/useAuth.js";
import { useT } from "../context/LanguageContext.jsx";
import { authService } from "../services/authService.js";
import { homePathFor } from "../constants/roles.js";
import { Alert, PageLoader, Spinner } from "../components/ui/States.jsx";
import GoogleSignInButton, {
  googleSignInAvailable,
} from "../components/GoogleSignInButton.jsx";

/*
 * Pages only an administrator may open. This list is a UX shortcut
 * ONLY — it exists to send a freshly-logged-in patient straight to
 * their own dashboard instead of flashing an admin page for a frame
 * before ProtectedRoute (the actual authority) bounces them to
 * /access-denied. Getting an entry wrong here cannot grant access;
 * it can only cost that one extra bounce.
 */
/*
 * Pages a patient must never land on via the generic "send them back
 * where they came from" fallback below — staff-facing pages the
 * ProtectedRoute roles list admits nurses/receptionists/doctors to
 * as well as admins, but never a plain patient account. The name is
 * historical (it predates those other roles); it now means "not for
 * a patient", not literally "admin only".
 */
const ADMIN_ONLY_PATHS = [
  "/admin",
  "/admin/messages",
  "/patients",
  "/doctors",
  "/appointments",
  "/departments",
  "/pharmacy",
  "/laboratory",
  "/billing",
  "/emergency",
  "/reports",
  "/wards",
  "/discharge-summaries",
];

/* Mirrors the `roles={[...]}` on each ProtectedRoute in App.jsx — kept
   here too because sending someone to a page ProtectedRoute will just
   bounce them off is worse than never redirecting them there at all. */
const NURSE_PATHS = ["/wards", "/patients", "/appointments", "/emergency", "/laboratory", "/discharge-summaries"];
const RECEPTIONIST_PATHS = ["/appointments", "/patients", "/doctors", "/wards", "/billing", "/discharge-summaries"];

export default function Login() {
  const location = useLocation();
  const t = useT();

  /*
   * Arriving from signup or a password change hands over the email so
   * only the password has to be typed to verify the account.
   */
  const [form, setForm] = useState({
    email: location.state?.email || "",
    password: "",
  });

  /*
   * Off by default: the session then lives in a browser-session cookie
   * and closing the browser signs you out, so the app cannot reopen
   * straight into the dashboard.
   */
  const [remember, setRemember] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const {
    login,
    verifyTwoFactor,
    loginWithGoogle,
    logout,
    isAuthenticated,
    initialising,
    sessionMessage,
    clearSessionMessage,
  } = useAuth();

  const [googleLoading, setGoogleLoading] = useState(false);

  /* Set only when the server answers the password step with a
     challenge instead of a session — that switches this page from the
     credentials form to the code form. */
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState("");
  const [resending, setResending] = useState(false);

  const navigate = useNavigate();

  /*
   * Opening the sign-in page is an explicit intent to authenticate, so
   * any session that is still alive is ended first. Without this, a
   * restored cookie would bounce the visitor straight to a dashboard
   * and the form could never be reached.
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

  const requestedPath =
    typeof location.state?.from === "string" ? location.state.from : "";

  const notice = location.state?.notice || "";

  useEffect(() => () => clearSessionMessage(), [clearSessionMessage]);

  const resolveDestination = (role) => {
    const usable =
      requestedPath &&
      requestedPath !== "/login" &&
      requestedPath !== "/signup";

    if (role === "admin") return usable ? requestedPath : "/admin";

    if (role === "doctor") {
      return usable && requestedPath.startsWith("/doctor/")
        ? requestedPath
        : "/doctor/dashboard";
    }

    if (role === "nurse") {
      return usable && NURSE_PATHS.includes(requestedPath) ? requestedPath : homePathFor(role);
    }

    if (role === "receptionist") {
      return usable && RECEPTIONIST_PATHS.includes(requestedPath) ? requestedPath : homePathFor(role);
    }

    /* A normal user is never dropped onto an admin-only or doctor-only page. */
    if (usable && !ADMIN_ONLY_PATHS.includes(requestedPath) && !requestedPath.startsWith("/doctor/")) {
      return requestedPath;
    }

    return "/dashboard";
  };

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setError("");
  };

  const submit = async (event) => {
    event.preventDefault();

    setError("");
    setFieldErrors({});
    setLoading(true);

    try {
      const result = await login(form.email.trim(), form.password, remember);

      /* No session yet — the account has a second factor. */
      if (result.twoFactorRequired) {
        setChallenge(result);
        setCode("");
        return;
      }

      navigate(resolveDestination(result.user.role), { replace: true });
    } catch (caught) {
      setFieldErrors(caught?.errors || {});
      setError(caught?.message || "Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (event) => {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const user = await verifyTwoFactor(challenge.challenge, code.trim(), remember);
      navigate(resolveDestination(user.role), { replace: true });
    } catch (caught) {
      setError(caught?.message || "That code was not accepted.");

      /* An expired or burnt-out challenge cannot be retried — send the
         visitor back to the password step rather than leaving them
         typing into a box that can no longer succeed. */
      if (/start again/i.test(caught?.message || "")) {
        setChallenge(null);
        setCode("");
      }
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    setResending(true);
    setError("");

    try {
      const result = await authService.resendTwoFactor(
        form.email.trim(),
        form.password
      );
      setChallenge(result);
      setCode("");
    } catch (caught) {
      setError(caught?.message || "Could not send a new code.");
    } finally {
      setResending(false);
    }
  };

  const handleGoogle = async (credential) => {
    setError("");
    setFieldErrors({});
    setGoogleLoading(true);

    try {
      const user = await loginWithGoogle(credential, remember);
      navigate(resolveDestination(user.role), { replace: true });
    } catch (caught) {
      setError(caught?.message || "Google sign-in failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const inputClass = (field) =>
    `w-full h-11 rounded-xl border pl-11 pr-4 text-slate-800 outline-none transition focus:ring-2 focus:ring-brand-500 focus:border-brand-500 ${
      fieldErrors[field] ? "border-red-300 bg-red-50/50" : "border-slate-200"
    }`;

  if (initialising || preparing) {
    return <PageLoader label={t("login.preparing", "Preparing sign in...")} />;
  }

  /* ---------- second factor ---------- */

  if (challenge) {
    return (
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl ring-1 ring-slate-100 p-5 sm:p-7">
        <div className="flex flex-col items-center text-center mb-5">
          <span className="w-10 h-10 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-2">
            <FiShield size={20} />
          </span>

          <h2 className="text-xl font-bold text-slate-800">
            {t("login.twoFactor.title", "Check your email")}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {t("login.twoFactor.sentTo", "We sent a 6-digit code to")}{" "}
            <span className="font-semibold text-slate-700">{challenge.maskedEmail}</span>
          </p>
        </div>

        {error && (
          <Alert tone="error" className="mb-4">
            {error}
          </Alert>
        )}

        {challenge.emailed === false && !challenge.devCode && (
          <Alert tone="warning" className="mb-4">
            The code could not be emailed. Contact the hospital administrator.
          </Alert>
        )}

        {/* Only ever present in development with no mailer configured. */}
        {challenge.devCode && (
          <Alert tone="warning" className="mb-4">
            Development mode — your code is <b>{challenge.devCode}</b>
          </Alert>
        )}

        <form onSubmit={submitCode} className="space-y-4" noValidate>
          <div>
            <label htmlFor="login-otp" className="block text-sm font-medium text-slate-700 mb-1">
              {t("login.twoFactor.codeLabel", "Sign-in code")}
            </label>

            <input
              id="login-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/g, ""));
                setError("");
              }}
              placeholder="000000"
              autoFocus
              className="w-full h-14 rounded-xl border border-slate-200 text-center text-2xl tracking-[0.5em] font-bold text-slate-800 outline-none transition focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />

            <p className="text-xs text-slate-400 mt-2">
              {t(
                "login.twoFactor.expiry",
                "The code expires in {minutes} minutes."
              ).replace("{minutes}", challenge.expiresInMinutes)}
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || code.length < 6}
            className="btn-primary w-full h-11 inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? <Spinner size={15} /> : <FiArrowRight size={16} />}
            {loading
              ? t("login.twoFactor.verifying", "Verifying...")
              : t("login.twoFactor.verify", "Verify & Sign In")}
          </button>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => {
                setChallenge(null);
                setCode("");
                setError("");
              }}
              className="text-slate-500 hover:text-slate-700 transition"
            >
              {t("login.twoFactor.useDifferent", "Use a different account")}
            </button>

            <button
              type="button"
              onClick={resendCode}
              disabled={resending}
              className="text-brand-600 font-semibold hover:text-brand-700 transition disabled:opacity-60"
            >
              {resending
                ? t("login.twoFactor.sending", "Sending...")
                : t("login.twoFactor.resend", "Resend code")}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md bg-white rounded-3xl shadow-xl ring-1 ring-slate-100 p-5 sm:p-7">

      <div className="flex flex-col items-center text-center mb-4">
        <span className="w-10 h-10 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-2">
          <FiUser size={20} />
        </span>

        <h2 className="text-xl font-bold text-slate-800">
          {t("login.title", "Sign In")}
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          {t("login.subtitle", "Enter your credentials to access your account")}
        </p>
      </div>

      {sessionMessage && (
        <Alert tone="warning" className="mb-4">
          {sessionMessage}
        </Alert>
      )}

      {notice && (
        <Alert tone="success" className="mb-4">
          {notice}
        </Alert>
      )}

      <form onSubmit={submit} className="space-y-3" noValidate>

          {/* EMAIL */}
        <div>
          <label
            htmlFor="login-email"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            {t("login.emailLabel", "Email Address")}
          </label>

          <div className="relative">
            <FiMail
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              size={17}
            />

            <input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder={t("login.emailPlaceholder", "Enter your email address")}
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

        {/* PASSWORD */}
        <div>
          <label
            htmlFor="login-password"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            {t("login.passwordLabel", "Password")}
          </label>

          <div className="relative">
            <FiLock
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              size={17}
            />

            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder={t("login.passwordPlaceholder", "Enter your password")}
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

        <div className="flex items-start justify-between gap-3">
          <label className="flex items-start gap-3 cursor-pointer select-none min-w-0">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="mt-0.5 w-4 h-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />

            <span className="min-w-0">
              <span className="block text-sm text-slate-700">
                {t("login.rememberMe", "Keep me signed in on this device")}
              </span>
              <span className="block text-xs text-slate-400 mt-0.5">
                {t(
                  "login.rememberHint",
                  "You will be signed out when you close the browser."
                )}
              </span>
            </span>
          </label>

          <Link
            to="/forgot-password"
            className="shrink-0 text-sm font-semibold text-brand-600 hover:text-brand-700 whitespace-nowrap pt-0.5"
          >
            {t("login.forgotPassword", "Forgot Password?")}
          </Link>
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        <button
          type="submit"
          disabled={loading || googleLoading}
          className="w-full h-11 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition inline-flex items-center justify-center gap-2"
        >
          {loading ? <Spinner size={16} /> : <FiArrowRight size={17} />}
          {loading
            ? t("login.signingIn", "Signing in...")
            : t("action.signIn", "Sign In")}
        </button>

        {googleSignInAvailable && (
          <>
            <div className="flex items-center gap-3 py-1">
              <span className="flex-1 h-px bg-slate-200" />
              <span className="text-xs font-medium text-slate-400">
                {t("login.or", "OR")}
              </span>
              <span className="flex-1 h-px bg-slate-200" />
            </div>

            {googleLoading ? (
              <div className="w-full h-11 rounded-xl border border-slate-200 flex items-center justify-center gap-2 text-sm text-slate-500">
                <Spinner size={15} />
                {t("login.googleSigningIn", "Signing in with Google...")}
              </div>
            ) : (
              <GoogleSignInButton text="signin_with" onCredential={handleGoogle} />
            )}
          </>
        )}
      </form>

      <p className="text-center mt-4 text-sm text-slate-500">
        {t("login.noAccount", "Don't have an account?")}
        <Link
          to="/signup"
          state={{ from: location.state?.from, email: form.email }}
          className="text-brand-600 font-semibold ml-1 hover:text-brand-700"
        >
          {t("login.signUp", "Sign up")}
        </Link>
      </p>
    </div>
  );
}
