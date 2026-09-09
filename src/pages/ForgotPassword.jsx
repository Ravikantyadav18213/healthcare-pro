import React, { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FiMail,
  FiArrowRight,
  FiCheckCircle,
  FiArrowLeft,
  FiLock,
  FiEye,
  FiEyeOff,
  FiShield,
} from "react-icons/fi";

import AuthLayout from "../components/AuthLayout.jsx";
import { useT } from "../context/LanguageContext.jsx";
import { authService } from "../services/authService.js";
import { Alert, Spinner } from "../components/ui/States.jsx";

const OTP_LENGTH = 6;

/*
 * Three steps on one screen, no URL token:
 *   1. email      -> request a 6-digit code, emailed to that address
 *   2. otp        -> verify the code before anything about the
 *                    password is ever shown
 *   3. newPassword -> only reachable once step 2 has actually
 *                    verified against the server
 *
 * The code is emailed to the address entered in step 1. If the
 * server cannot send it (no MAIL_USER/MAIL_PASS, or SMTP refused the
 * login) a development server hands the code back as `devOtp` with
 * the reason in `mailError`, and both are shown in step 2 so the
 * cause is visible instead of the email just never arriving.
 * Production never returns either field.
 */
export default function ForgotPassword() {
  const navigate = useNavigate();
  const t = useT();
  const otpRefs = useRef([]);

  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [devOtp, setDevOtp] = useState(null);
  const [mailError, setMailError] = useState(null);

  const [otpDigits, setOtpDigits] = useState(Array(OTP_LENGTH).fill(""));
  const otp = otpDigits.join("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const inputClass = (hasError) =>
    `w-full h-11 rounded-xl border pl-11 pr-4 text-slate-800 outline-none transition focus:ring-2 focus:ring-brand-500 focus:border-brand-500 ${
      hasError ? "border-red-300 bg-red-50/50" : "border-slate-200"
    }`;

  const submitEmail = async (event) => {
    event.preventDefault();

    setError("");
    setFieldError("");
    setLoading(true);

    try {
      const data = await authService.forgotPassword(email.trim());
      setDevOtp(data?.devOtp || null);
      setMailError(data?.mailError || null);
      setStep("otp");
      setTimeout(() => otpRefs.current[0]?.focus(), 0);
    } catch (caught) {
      setFieldError(caught?.errors?.email || "");
      setError(caught?.message || "Could not send a reset code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /* Takes more than one digit at a time on purpose: SMS/one-time-code
     autofill drops the whole code into a single box. */
  const setOtpDigit = (index, raw) => {
    const digits = raw.replace(/\D/g, "");

    setOtpDigits((current) => {
      const next = [...current];
      if (!digits) {
        next[index] = "";
        return next;
      }
      for (let i = 0; i < digits.length && index + i < OTP_LENGTH; i += 1) {
        next[index + i] = digits[i];
      }
      return next;
    });

    setError("");

    if (digits) {
      otpRefs.current[Math.min(index + digits.length, OTP_LENGTH - 1)]?.focus();
    }
  };

  const handleOtpKeyDown = (index, event) => {
    if (event.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (event) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    event.preventDefault();
    setOtpDigits((current) => {
      const next = [...current];
      for (let i = 0; i < OTP_LENGTH; i += 1) next[i] = pasted[i] || "";
      return next;
    });
    otpRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  };

  const submitOtp = async (event) => {
    event.preventDefault();

    if (otp.length !== OTP_LENGTH) {
      setError("Enter the full 6-digit code.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      await authService.verifyResetOtp(email.trim(), otp);
      setStep("password");
    } catch (caught) {
      setError(caught?.message || "That code is invalid or has expired.");
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    setError("");
    setLoading(true);

    try {
      const data = await authService.forgotPassword(email.trim());
      setDevOtp(data?.devOtp || null);
      setMailError(data?.mailError || null);
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      otpRefs.current[0]?.focus();
    } catch (caught) {
      setError(caught?.message || "Could not resend the code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const submitPassword = async (event) => {
    event.preventDefault();

    setError("");
    setFieldErrors({});

    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: "Passwords do not match." });
      return;
    }

    setLoading(true);

    try {
      await authService.resetPassword(email.trim(), otp, password);
      setSuccess(true);

      setTimeout(() => {
        navigate("/login", {
          replace: true,
          state: { notice: "Password reset. Please sign in with your new password." },
        });
      }, 1200);
    } catch (caught) {
      setFieldErrors(caught?.errors || {});
      setError(caught?.message || "That code is invalid or has expired.");
    } finally {
      setLoading(false);
    }
  };

  const heading = {
    email: t("forgotPassword.heading.email", "Forgot Password?"),
    otp: t("forgotPassword.heading.otp", "Enter Verification Code"),
    password: t("forgotPassword.heading.password", "Set a New Password"),
  }[step];

  const subheading = {
    email: t(
      "forgotPassword.sub.email",
      "No worries — enter your email and we'll send you a 6-digit code."
    ),
    otp: t(
      "forgotPassword.sub.otp",
      "We sent a 6-digit code to {email}. Enter it below."
    ).replace("{email}", email || t("forgotPassword.yourEmail", "your email")),
    password: t(
      "forgotPassword.sub.password",
      "Choose a strong password to secure your account again."
    ),
  }[step];

  return (
    <AuthLayout heading={heading} subheading={subheading}>
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl ring-1 ring-slate-100 p-5 sm:p-7">
        <div className="flex flex-col items-center text-center mb-4">
          <span className="w-10 h-10 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-2">
            {step === "email" && <FiMail size={20} />}
            {step === "otp" && <FiShield size={20} />}
            {step === "password" && <FiLock size={20} />}
          </span>

          <h2 className="text-xl font-bold text-slate-800">
            {t("forgotPassword.cardTitle", "Reset Password")}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {step === "email" &&
              t(
                "forgotPassword.step.emailCaption",
                "Enter the email linked to your account"
              )}
            {step === "otp" &&
              t("forgotPassword.step.otpCaption", "Check your inbox for the code")}
            {step === "password" &&
              t(
                "forgotPassword.step.passwordCaption",
                "Enter your new password below"
              )}
          </p>
        </div>

        {success ? (
          <Alert tone="success">
            <span className="inline-flex items-center gap-2">
              <FiCheckCircle size={15} />
              {t(
                "forgotPassword.successMessage",
                "Password reset. Taking you to sign in..."
              )}
            </span>
          </Alert>
        ) : step === "email" ? (
          <form onSubmit={submitEmail} className="space-y-3" noValidate>
            <div>
              <label htmlFor="fp-email" className="block text-sm font-medium text-slate-700 mb-1">
                {t("forgotPassword.emailLabel", "Email Address")}
              </label>

              <div className="relative">
                <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  id="fp-email"
                  type="email"
                  autoComplete="email"
                  placeholder={t(
                    "forgotPassword.emailPlaceholder",
                    "Enter your email address"
                  )}
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setFieldError("");
                    setError("");
                  }}
                  className={inputClass(Boolean(fieldError))}
                  required
                  autoFocus
                />
              </div>

              {fieldError && <p className="text-xs text-red-600 mt-1.5">{fieldError}</p>}
            </div>

            {error && <Alert tone="error">{error}</Alert>}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition inline-flex items-center justify-center gap-2"
            >
              {loading ? <Spinner size={16} /> : <FiArrowRight size={17} />}
              {loading
                ? t("forgotPassword.sending", "Sending...")
                : t("forgotPassword.sendCode", "Send Code")}
            </button>

            <Link
              to="/login"
              className="flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-brand-600 transition pt-1"
            >
              <FiArrowLeft size={15} />
              {t("forgotPassword.backToSignIn", "Back to Sign In")}
            </Link>
          </form>
        ) : step === "otp" ? (
          <form onSubmit={submitOtp} className="space-y-3" noValidate>
            {devOtp ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 space-y-1">
                <p className="font-semibold">
                  The code could not be emailed — showing it here instead
                </p>
                {mailError && <p className="text-amber-600">{mailError}</p>}
                <p>
                  Code:{" "}
                  <span className="font-mono font-bold tracking-widest text-sm">{devOtp}</span>
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                <p>
                  {t(
                    "forgotPassword.otp.emailedTo",
                    "A 6-digit code has been emailed to"
                  )}{" "}
                  <span className="font-semibold">{email}</span>.{" "}
                  {t(
                    "forgotPassword.otp.expiryHint",
                    "It expires in 10 minutes — check your spam folder if it does not arrive."
                  )}
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 text-center">
                {t("forgotPassword.otpLabel", "6-Digit Code")}
              </label>

              <div className="flex justify-center gap-1.5 sm:gap-2" onPaste={handleOtpPaste}>
                {otpDigits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(element) => (otpRefs.current[index] = element)}
                    type="text"
                    inputMode="numeric"
                    /* No maxLength: it would truncate an autofilled code
                       to one character before setOtpDigit can spread it. */
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    value={digit}
                    onChange={(event) => setOtpDigit(index, event.target.value)}
                    onKeyDown={(event) => handleOtpKeyDown(index, event)}
                    /*
                     * Selecting the existing digit whenever the box
                     * gains focus (by tab, click, or re-click) means a
                     * keystroke always REPLACES it rather than being
                     * appended next to it — without this, editing an
                     * already-filled box produced a 2-character value
                     * that setOtpDigit's autofill-spreading logic
                     * would scatter into the following box instead of
                     * just updating this one.
                     */
                    onFocus={(event) => event.target.select()}
                    onClick={(event) => event.target.select()}
                    className="w-9 h-10 sm:w-11 sm:h-12 text-center text-lg font-bold rounded-xl border border-slate-200 text-slate-800 outline-none transition focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    autoFocus={index === 0}
                  />
                ))}
              </div>
            </div>

            {error && <Alert tone="error">{error}</Alert>}

            <button
              type="submit"
              disabled={loading || otp.length !== OTP_LENGTH}
              className="w-full h-11 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition inline-flex items-center justify-center gap-2"
            >
              {loading ? <Spinner size={16} /> : <FiArrowRight size={17} />}
              {loading
                ? t("forgotPassword.verifying", "Verifying...")
                : t("forgotPassword.verifyCode", "Verify Code")}
            </button>

            <div className="flex items-center justify-between pt-1 text-sm">
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setOtpDigits(Array(OTP_LENGTH).fill(""));
                  setError("");
                }}
                className="flex items-center gap-1.5 text-slate-500 hover:text-brand-600 transition"
              >
                <FiArrowLeft size={15} />
                {t("forgotPassword.changeEmail", "Change email")}
              </button>

              <button
                type="button"
                onClick={resendOtp}
                disabled={loading}
                className="font-semibold text-brand-600 hover:text-brand-700 transition disabled:opacity-60"
              >
                {t("forgotPassword.resendCode", "Resend code")}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={submitPassword} className="space-y-3" noValidate>
            <div>
              <label htmlFor="rp-password" className="block text-sm font-medium text-slate-700 mb-1">
                {t("forgotPassword.newPasswordLabel", "New Password")}
              </label>

              <div className="relative">
                <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  id="rp-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder={t(
                    "forgotPassword.newPasswordPlaceholder",
                    "At least 8 characters"
                  )}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setFieldErrors((current) => ({ ...current, newPassword: undefined }));
                  }}
                  className={`${inputClass(Boolean(fieldErrors.newPassword))} pr-12`}
                  required
                  autoFocus
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

              {fieldErrors.newPassword && (
                <p className="text-xs text-red-600 mt-1.5">{fieldErrors.newPassword}</p>
              )}
            </div>

            <div>
              <label htmlFor="rp-confirm" className="block text-sm font-medium text-slate-700 mb-1">
                {t("forgotPassword.confirmLabel", "Confirm New Password")}
              </label>

              <div className="relative">
                <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  id="rp-confirm"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder={t(
                    "forgotPassword.confirmPlaceholder",
                    "Re-enter your new password"
                  )}
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    setFieldErrors((current) => ({ ...current, confirmPassword: undefined }));
                  }}
                  className={`${inputClass(Boolean(fieldErrors.confirmPassword))} pr-12`}
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
                <p className="text-xs text-red-600 mt-1.5">{fieldErrors.confirmPassword}</p>
              )}
            </div>

            {error && <Alert tone="error">{error}</Alert>}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition inline-flex items-center justify-center gap-2"
            >
              {loading && <Spinner size={16} />}
              {loading
                ? t("forgotPassword.resetting", "Resetting...")
                : t("forgotPassword.resetPassword", "Reset Password")}
            </button>

            <Link
              to="/login"
              className="flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-brand-600 transition pt-1"
            >
              <FiArrowLeft size={15} />
              {t("forgotPassword.backToSignIn", "Back to Sign In")}
            </Link>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
