import { OAuth2Client } from "google-auth-library";

import db from "../db.js";
import { config } from "../config/env.js";
import ApiError from "../utils/ApiError.js";
import audit from "../utils/audit.js";
import notify from "../utils/notify.js";
import { sendMail, otpEmail, mailerConfigured } from "../utils/mailer.js";
import asyncHandler from "../utils/asyncHandler.js";
import { validate, rules } from "../validators/index.js";
import { resetRateLimit } from "../middleware/rateLimit.js";

/* Built even with no client id configured — it is only ever asked to
   verify a token once googleAuth has already checked config.googleClientId. */
const googleClient = new OAuth2Client(config.googleClientId || undefined);

import * as authService from "../services/authService.js";
import * as twoFactor from "../services/twoFactorService.js";
import {
  signAccessToken,
  issueRefreshToken,
  consumeRefreshToken,
  revokeRefreshToken,
  revokeAllSessions,
  revokeAccessToken,
  setAuthCookies,
  clearAuthCookies,
  readRefreshToken,
  readAccessToken,
} from "../services/tokenService.js";

/* Includes the access token in the body only in explicit token mode. */
function authPayload(user, accessToken) {
  const body = { success: true, user };
  if (config.authMode === "token") body.accessToken = accessToken;
  return body;
}

/*
 * An administrator session is never kept for the full patient window,
 * even with "keep me signed in" — admin access is far more sensitive,
 * so it is capped at a single day.
 */
const ADMIN_MAX_REMEMBER_DAYS = 1;

function establishSession(req, res, user, persistent = false) {
  const accessToken = signAccessToken({
    id: user.id,
    email: user.email,
    role: user.role,
  });

  const keep = Boolean(persistent);

  /* Administrators get a shorter persistence window than patients. */
  const days = keep
    ? user.role === "admin"
      ? Math.min(ADMIN_MAX_REMEMBER_DAYS, config.refreshTokenDays)
      : config.refreshTokenDays
    : 1;

  const refreshToken = issueRefreshToken(user.id, req, keep, days);

  setAuthCookies(res, {
    accessToken,
    refreshToken,
    persistent: keep,
    maxAgeMs: days * 24 * 60 * 60 * 1000,
  });

  return accessToken;
}

/** True when the client asked to stay signed in after the browser closes. */
function wantsPersistentSession(body) {
  return body?.remember === true || body?.remember === "true";
}

/* "meera.nair@hospital.io" -> "m•••••••r@hospital.io". Enough for the
   owner to recognise which inbox to open, not enough to hand a full
   address to whoever holds the password. */
function maskEmail(email) {
  const [name = "", domain = ""] = String(email || "").split("@");

  if (!domain) return "your email";

  const visible =
    name.length <= 2 ? name.slice(0, 1) : `${name[0]}${"•".repeat(Math.min(name.length - 2, 7))}${name.at(-1)}`;

  return `${visible}@${domain}`;
}

/* ==================================================================
   REGISTER
================================================================== */

export const register = asyncHandler(async (req, res) => {
  const { name, email, phone, password, confirmPassword, dateOfBirth, gender } =
    req.body || {};

  validate(req.body || {}, {
    name: rules.string({ min: 2, max: 80, label: "Full name" }),
    email: rules.email,
    phone: rules.phone({ required: true }),
    password: rules.password,
    dateOfBirth: rules.date({ required: false, label: "Date of birth" }),
  });

  if (password !== confirmPassword) {
    throw ApiError.validation({ confirmPassword: "Passwords do not match." });
  }

  if (String(email).trim().toLowerCase() === config.adminEmail) {
    audit(req, "register_failed", {
      actorEmail: String(email).trim().toLowerCase(),
      details: "Attempt to register using the reserved administrator email.",
    });

    throw ApiError.conflict("This email address is reserved.");
  }

  /* Role is never read from the request. Signup always creates a user. */
  const user = authService.register({
    name,
    email,
    phone,
    password,
    dateOfBirth,
    gender,
  });

  audit(req, "register", {
    userId: user.id,
    actorEmail: user.email,
    actorRole: "user",
    entity: "user",
    entityId: user.id,
    details: `New account created for ${user.email}`,
  });

  notify(user.id, {
    title: "Welcome to HealthCare Pro",
    message:
      "Your account is ready. Book your first appointment from the dashboard.",
    type: "success",
    link: "/book-appointment",
  });

  /*
   * Registration deliberately does NOT start a session. The new user is
   * sent to the sign-in form so their credentials are verified once
   * before they reach the portal.
   */
  res.status(201).json({
    success: true,
    user,
    message: "Account created. Please sign in to continue.",
  });
});

/* ==================================================================
   LOGIN
================================================================== */

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};

  validate(req.body || {}, {
    email: rules.email,
    password: rules.string({ min: 1, label: "Password" }),
  });

  let user;

  try {
    user = authService.login({ email, password });
  } catch (error) {
    audit(req, "login_failed", {
      actorEmail: String(email).trim().toLowerCase(),
      details: error.message,
    });
    throw error;
  }

  resetRateLimit(req, "login");

  /*
   * With a second factor on, a correct password is only half the
   * proof — no session is established here. The browser gets an
   * opaque challenge to redeem at /auth/verify-2fa instead.
   */
  if (config.twoFactorEnabled && twoFactor.isEnabled(user.id)) {
    const challenge = await twoFactor.beginChallenge(user);

    audit(req, "login_2fa_challenged", {
      userId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      entity: "user",
      entityId: user.id,
    });

    return res.json({
      success: true,
      twoFactorRequired: true,
      challenge: challenge.challenge,
      expiresInMinutes: challenge.expiresInMinutes,
      emailed: challenge.emailed,
      maskedEmail: maskEmail(user.email),
      ...(challenge.devCode ? { devCode: challenge.devCode } : {}),
    });
  }

  const accessToken = establishSession(
    req,
    res,
    user,
    wantsPersistentSession(req.body)
  );

  const loginAction =
    user.role === "admin" ? "admin_login" : user.role === "doctor" ? "doctor_login" : "login";

  audit(req, loginAction, {
    userId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    entity: "user",
    entityId: user.id,
    details: `${user.name} signed in.`,
  });

  res.json(authPayload(user, accessToken));
});

/* ==================================================================
   GOOGLE SIGN-IN

   The browser sends the ID token Google's own "Sign in with Google"
   button produced (a signed JWT) — never a password, never anything
   this server has to trust blindly. verifyIdToken checks the
   signature against Google's public keys AND that the token was
   issued for this exact app (the audience check), so a token minted
   for some other site cannot be replayed here.
================================================================== */

export const googleAuth = asyncHandler(async (req, res) => {
  if (!config.googleClientId) {
    throw ApiError.badRequest(
      "Google sign-in is not configured on this server."
    );
  }

  const { credential } = req.body || {};

  if (!credential || typeof credential !== "string") {
    throw ApiError.badRequest("Missing Google credential.");
  }

  let payload;

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: config.googleClientId,
    });
    payload = ticket.getPayload();
  } catch {
    throw ApiError.unauthorized("Could not verify that Google sign-in.");
  }

  if (!payload?.email) {
    throw ApiError.unauthorized("Your Google account has no email address.");
  }

  /*
   * /register refuses to let anyone claim the reserved administrator
   * address; the Google path must refuse it too. Without this, if
   * ADMIN_EMAIL happens to be a real Google account, signing in to
   * that Google account would hand out a full administrator session
   * without ever knowing ADMIN_PASSWORD — and, for a brand-new
   * address, loginOrRegisterWithGoogle would create the account.
   */
  if (String(payload.email).trim().toLowerCase() === config.adminEmail) {
    audit(req, "login_failed", {
      actorEmail: String(payload.email).trim().toLowerCase(),
      details: "Google sign-in attempted against the reserved administrator email.",
    });

    throw ApiError.forbidden(
      "This account must sign in with its password, not with Google."
    );
  }

  const { user, created } = authService.loginOrRegisterWithGoogle({
    email: payload.email,
    name: payload.name,
    emailVerified: payload.email_verified === true,
  });

  resetRateLimit(req, "login");

  const accessToken = establishSession(
    req,
    res,
    user,
    wantsPersistentSession(req.body)
  );

  audit(req, created ? "register" : "login", {
    userId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    entity: "user",
    entityId: user.id,
    details: created
      ? `New account created for ${user.email} via Google sign-in.`
      : `${user.name} signed in with Google.`,
  });

  if (created) {
    notify(user.id, {
      title: "Welcome to HealthCare Pro",
      message:
        "Your account is ready. Book your first appointment from the dashboard.",
      type: "success",
      link: "/book-appointment",
    });
  }

  res.json(authPayload(user, accessToken));
});

/* ==================================================================
   SESSION
================================================================== */

export const me = asyncHandler(async (req, res) => {
  const user = authService.getUser(req.user.id);
  res.json({ success: true, user });
});

export const refresh = asyncHandler(async (req, res) => {
  const presented = readRefreshToken(req);
  const session = consumeRefreshToken(presented);

  if (!session) {
    clearAuthCookies(res);
    throw ApiError.unauthorized("Your session has expired. Please sign in again.");
  }

  const row = db
    .prepare(`SELECT id, name, email, role, status FROM users WHERE id = ?`)
    .get(session.user_id);

  if (!row || row.status !== "active") {
    clearAuthCookies(res);
    throw ApiError.unauthorized("This account is no longer active.");
  }

  const user = authService.getUser(row.id);

  /* Rotating the token must not silently upgrade a browser-session
     login into a persistent one, so the original choice is reused. */
  const accessToken = establishSession(
    req,
    res,
    user,
    session.persistent === 1
  );

  res.json(authPayload(user, accessToken));
});

export const logout = asyncHandler(async (req, res) => {
  const presented = readRefreshToken(req);
  if (presented) revokeRefreshToken(presented);

  /* Clearing the cookie only stops THIS browser from sending the
     access token again; the token itself stays valid until it
     expires. Revoking it by id makes the sign-out immediate even if
     a copy was captured elsewhere. */
  revokeAccessToken(readAccessToken(req));

  if (req.user) {
    audit(req, "logout", {
      userId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      details: `${req.user.name} signed out.`,
    });
  }

  clearAuthCookies(res);
  res.json({ success: true, message: "Signed out." });
});

export const logoutAll = asyncHandler(async (req, res) => {
  revokeAllSessions(req.user.id);
  revokeAccessToken(readAccessToken(req));
  clearAuthCookies(res);
  res.json({ success: true, message: "Signed out of all devices." });
});

/* ==================================================================
   PROFILE
================================================================== */

export const updateProfile = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    name: rules.string({ min: 2, max: 80, label: "Full name" }),
    phone: rules.phone({ required: false }),
    dateOfBirth: rules.date({ required: false, label: "Date of birth" }),
  });

  const user = authService.updateOwnProfile(req.user.id, req.body);

  audit(req, "profile_updated", {
    entity: "user",
    entityId: req.user.id,
    details: "Profile details updated.",
  });

  res.json({ success: true, user });
});

export const changePassword = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    currentPassword: rules.string({ min: 1, label: "Current password" }),
    newPassword: rules.password,
  });

  authService.changePassword(req.user.id, req.body);

  /* Force every other device to sign in again. */
  revokeAllSessions(req.user.id);
  clearAuthCookies(res);

  audit(req, "password_changed", {
    entity: "user",
    entityId: req.user.id,
    details: "Password changed; all sessions revoked.",
  });

  res.json({
    success: true,
    message: "Password updated. Please sign in again.",
  });
});

/* ==================================================================
   PASSWORD RECOVERY
================================================================== */

export const forgotPassword = asyncHandler(async (req, res) => {
  validate(req.body || {}, { email: rules.email });

  const { email, user, otp } = authService.requestPasswordReset(req.body.email);

  let emailed = false;
  /*
   * When there's no mail account configured at all, the reason is the
   * same regardless of whether this address is registered — set it up
   * front so the dev-only fallback response doesn't leak registration
   * status through mailError even when it can't leak it through
   * devOtp or the message text anymore.
   */
  let mailError = mailerConfigured
    ? null
    : "No mail account is configured (MAIL_USER / MAIL_PASS are unset).";

  if (user) {
    const { text, html } = otpEmail(otp, 10);
    const result = await sendMail({
      to: email,
      subject: "Your HealthCare Pro password reset code",
      text,
      html,
    });
    emailed = result.sent;
    if (!result.sent) mailError = result.reason;
  }

  audit(req, "password_reset_requested", { actorEmail: email });

  /*
   * Only reachable when the server is not in production — the local-
   * dev fallback for testing the flow without email set up. Reachable
   * whether or not the address is registered (requestPasswordReset
   * always returns a plausible-shaped otp), so the field's presence
   * cannot itself be used to test which emails have accounts. A real
   * send never echoes the code back, and production never does
   * regardless of whether one exists.
   */
  const fellBack = Boolean(otp && !emailed && config.allowDevOtp);

  res.json({
    success: true,
    /*
     * Deliberately the SAME message whether or not the account
     * exists, and whether or not the email actually sent — the two
     * used to differ ("...has been sent." vs "...has been
     * generated."), which was a one-word account-enumeration oracle
     * on an unauthenticated endpoint.
     */
    message: "If an account exists for that email, a 6-digit code has been sent.",
    ...(fellBack ? { devOtp: otp, mailError } : {}),
  });
});

export const verifyResetOtp = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    email: rules.email,
    otp: rules.string({ min: 6, max: 6, label: "Code" }),
  });

  authService.verifyPasswordResetOtp(req.body);

  res.json({ success: true, message: "Code verified." });
});

export const resetPassword = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    email: rules.email,
    otp: rules.string({ min: 6, max: 6, label: "Code" }),
    newPassword: rules.password,
  });

  const userId = authService.resetPasswordWithOtp(req.body);
  revokeAllSessions(userId);

  audit(req, "password_reset", {
    userId,
    entity: "user",
    entityId: userId,
    details: "Password reset using a one-time code.",
  });

  res.json({ success: true, message: "Password reset. You can sign in now." });
});

/* ==================================================================
   TWO-FACTOR SIGN-IN

   The second half of the login above: redeeming a challenge is what
   actually creates the session for a 2FA account.
================================================================== */

export const verifyTwoFactor = asyncHandler(async (req, res) => {
  const { challenge, code } = req.body || {};

  let userId;

  try {
    ({ userId } = twoFactor.verifyChallenge({ challenge, code }));
  } catch (error) {
    audit(req, "login_2fa_failed", { details: error.message });
    throw error;
  }

  const user = authService.getUser(userId);

  resetRateLimit(req, "login");

  const accessToken = establishSession(
    req,
    res,
    user,
    wantsPersistentSession(req.body)
  );

  const loginAction =
    user.role === "admin" ? "admin_login" : user.role === "doctor" ? "doctor_login" : "login";

  audit(req, loginAction, {
    userId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    entity: "user",
    entityId: user.id,
    details: `${user.name} signed in with a second factor.`,
  });

  res.json(authPayload(user, accessToken));
});

/** Resend the code for a challenge that is still open. */
export const resendTwoFactor = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};

  validate(req.body || {}, {
    email: rules.email,
    password: rules.string({ min: 1, label: "Password" }),
  });

  /* Re-proving the password is what stops this endpoint from being a
     free way to spam somebody's inbox with codes. */
  const user = authService.login({ email, password });

  if (!twoFactor.isEnabled(user.id)) {
    throw ApiError.badRequest("Two-factor sign-in is not enabled for this account.");
  }

  const challenge = await twoFactor.beginChallenge(user);

  res.json({
    success: true,
    challenge: challenge.challenge,
    expiresInMinutes: challenge.expiresInMinutes,
    emailed: challenge.emailed,
    maskedEmail: maskEmail(user.email),
    ...(challenge.devCode ? { devCode: challenge.devCode } : {}),
  });
});

/* ==================================================================
   UI LANGUAGE

   Its own endpoint rather than a field on updateProfile: that handler
   requires a name and rewrites the linked patient row, neither of
   which has anything to do with picking a language.
================================================================== */

const SUPPORTED_LANGUAGES = ["en", "hi", "mr", "ta"];

export const updateLanguage = asyncHandler(async (req, res) => {
  const language = String(req.body?.language || "").toLowerCase();

  if (!SUPPORTED_LANGUAGES.includes(language)) {
    throw ApiError.badRequest("That language is not supported.");
  }

  db.prepare(
    `UPDATE users SET language = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(language, req.user.id);

  res.json({ success: true, language });
});

/** Turn the second factor on/off for the signed-in account. */
export const updateTwoFactor = asyncHandler(async (req, res) => {
  const enabled = req.body?.enabled === true || req.body?.enabled === "true";

  const result = twoFactor.setEnabled(req.user.id, enabled);

  audit(req, enabled ? "2fa_enabled" : "2fa_disabled", {
    userId: req.user.id,
    entity: "user",
    entityId: req.user.id,
  });

  notify(req.user.id, {
    title: enabled ? "Two-factor sign-in enabled" : "Two-factor sign-in disabled",
    message: enabled
      ? "You will be emailed a code each time you sign in."
      : "Your account now signs in with a password only.",
    type: enabled ? "success" : "warning",
    link: "/profile",
  });

  res.json({ success: true, ...result });
});
