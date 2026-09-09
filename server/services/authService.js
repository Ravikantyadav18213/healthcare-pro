import crypto from "node:crypto";
import bcrypt from "bcryptjs";

import db from "../db.js";
import { config } from "../config/env.js";
import ApiError from "../utils/ApiError.js";
import { publicUser } from "../utils/sanitize.js";

/* ==================================================================
   QUERIES
================================================================== */

const findByEmail = db.prepare(`SELECT * FROM users WHERE email = ?`);
const findById = db.prepare(`SELECT * FROM users WHERE id = ?`);

const insertUser = db.prepare(`
  INSERT INTO users
    (name, email, phone, password_hash, role, status, date_of_birth, gender)
  VALUES
    (@name, @email, @phone, @password_hash, 'user', 'active', @date_of_birth, @gender)
`);

const insertPatientProfile = db.prepare(`
  INSERT INTO patients (user_id, name, phone, email, date_of_birth, gender, status)
  VALUES (?, ?, ?, ?, ?, ?, 'Outpatient')
`);

const markLoginSuccess = db.prepare(`
  UPDATE users
     SET last_login = datetime('now'),
         login_count = login_count + 1,
         failed_login_attempts = 0,
         updated_at = datetime('now')
   WHERE id = ?
`);

const markLoginFailure = db.prepare(`
  UPDATE users
     SET failed_login_attempts = failed_login_attempts + 1,
         updated_at = datetime('now')
   WHERE id = ?
`);

const updateProfile = db.prepare(`
  UPDATE users
     SET name = @name,
         phone = @phone,
         date_of_birth = @date_of_birth,
         gender = @gender,
         updated_at = datetime('now')
   WHERE id = @id
`);

const updatePassword = db.prepare(`
  UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?
`);

/* ==================================================================
   REGISTRATION
================================================================== */

export function register({ name, email, phone, password, dateOfBirth, gender }) {
  const cleanEmail = String(email).trim().toLowerCase();

  if (findByEmail.get(cleanEmail)) {
    throw ApiError.conflict("An account with this email already exists.");
  }

  const passwordHash = bcrypt.hashSync(password, config.bcryptRounds);

  const created = db.transaction(() => {
    const result = insertUser.run({
      name: String(name).trim(),
      email: cleanEmail,
      phone: phone ? String(phone).trim() : null,
      password_hash: passwordHash,
      date_of_birth: dateOfBirth || null,
      gender: gender || null,
    });

    const userId = result.lastInsertRowid;

    /* Every registered user also gets a linked patient profile so
       they can be attached to appointments and reports. */
    insertPatientProfile.run(
      userId,
      String(name).trim(),
      phone ? String(phone).trim() : null,
      cleanEmail,
      dateOfBirth || null,
      gender || null
    );

    return findById.get(userId);
  })();

  return publicUser(created);
}

/* ==================================================================
   LOGIN
================================================================== */

export function login({ email, password }) {
  const cleanEmail = String(email).trim().toLowerCase();
  const user = findByEmail.get(cleanEmail);

  /*
   * bcrypt.compare is run even when the account is missing so the
   * response time does not reveal whether an email is registered.
   */
  const hash = user?.password_hash || "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu";
  const matches = bcrypt.compareSync(password, hash);

  if (!user || !matches) {
    if (user) markLoginFailure.run(user.id);
    throw ApiError.unauthorized("Invalid email or password.");
  }

  if (user.status !== "active") {
    throw ApiError.forbidden(
      "Your account has been deactivated. Please contact the hospital administrator."
    );
  }

  markLoginSuccess.run(user.id);

  return publicUser(findById.get(user.id));
}

/* ==================================================================
   PROFILE
================================================================== */

export function getUser(id) {
  const user = findById.get(id);
  if (!user) throw ApiError.notFound("Account not found.");
  return publicUser(user);
}

export function updateOwnProfile(id, { name, phone, dateOfBirth, gender }) {
  const existing = findById.get(id);
  if (!existing) throw ApiError.notFound("Account not found.");

  updateProfile.run({
    id,
    name: String(name).trim(),
    phone: phone ? String(phone).trim() : null,
    date_of_birth: dateOfBirth || null,
    gender: gender || null,
  });

  /* Keep the linked patient profile in step. */
  db.prepare(
    `UPDATE patients
        SET name = ?, phone = ?, date_of_birth = ?, gender = ?,
            updated_at = datetime('now')
      WHERE user_id = ?`
  ).run(
    String(name).trim(),
    phone ? String(phone).trim() : null,
    dateOfBirth || null,
    gender || null,
    id
  );

  return publicUser(findById.get(id));
}

export function changePassword(id, { currentPassword, newPassword }) {
  const user = findById.get(id);
  if (!user) throw ApiError.notFound("Account not found.");

  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    throw ApiError.validation({
      currentPassword: "Your current password is incorrect.",
    });
  }

  updatePassword.run(bcrypt.hashSync(newPassword, config.bcryptRounds), id);
  return true;
}

/* ==================================================================
   PASSWORD RESET — ONE-TIME CODE

   A 6-digit code, not a link: the whole recovery flow (request code
   -> enter code -> choose a new password) happens on one screen, so a
   URL token has nothing to attach to. It is stored the exact same way
   the old link token was — hashed in password_resets.token_hash — a
   6-digit code hashed is indistinguishable from any other short
   secret at rest.

   Verifying the code does not consume it. Only changing the password
   does (setPasswordWithOtp marks it used), so the person can move
   from the "enter code" screen to the "choose password" screen
   without the code going stale in between.
================================================================== */

const OTP_TTL_MINUTES = 10;

/*
 * expires_at is computed by SQLite itself (not JS's Date#toISOString)
 * so it is written in exactly the format datetime('now') produces
 * ("YYYY-MM-DD HH:MM:SS", space-separated). Comparing an ISO string
 * ("...T...Z") against that with a plain TEXT/BINARY comparison is
 * unsound — 'T' (0x54) sorts after the space (0x20), so any
 * same-day ISO timestamp would compare greater than "now" regardless
 * of the time of day, silently defeating the TTL. Letting SQLite
 * generate both sides keeps the formats identical by construction.
 */
const insertReset = db.prepare(`
  INSERT INTO password_resets (user_id, token_hash, expires_at)
  VALUES (?, ?, datetime('now', '+' || ? || ' minutes'))
`);

const findReset = db.prepare(`
  SELECT * FROM password_resets
   WHERE user_id = ? AND token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')
`);

/* Every outstanding code for a user, live or not — used to invalidate
   the rest of the set on a new request or a completed reset, rather
   than leaving them redeemable (and permanently occupying the UNIQUE
   token_hash index) forever. */
const deleteResetsForUser = db.prepare(`DELETE FROM password_resets WHERE user_id = ?`);

/* Opportunistic garbage collection: nothing else ever purges expired
   rows, and token_hash is globally UNIQUE, so a table that only ever
   grows would eventually make every fresh code collide with a stale
   one. Run on every request — cheap, and keeps the live table small. */
const deleteExpiredResets = db.prepare(
  `DELETE FROM password_resets WHERE expires_at <= datetime('now')`
);

const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");

const randomOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

/*
 * Per-account guess counter for the reset code, independent of the
 * IP-based rate limiter. A 6-digit code has only 10^6 values; the
 * limiter caps guesses per IP, but an attacker who rotates IPs could
 * still spray the space. Binding a hard ceiling to the code itself —
 * after this many wrong guesses every outstanding code for the
 * account is burned and a new request is required — makes the code
 * unguessable regardless of how the requests are distributed. Kept in
 * memory (like the rate limiter) so no schema change is needed; a
 * process restart simply resets the count, which is safe because the
 * codes also expire in 10 minutes.
 */
const MAX_OTP_ATTEMPTS = 10;
const otpAttempts = new Map();

const otpSweep = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of otpAttempts) {
    if (entry.resetAt <= now) otpAttempts.delete(key);
  }
}, 60_000);
otpSweep.unref?.();

function registerOtpFailure(userId) {
  const now = Date.now();
  let entry = otpAttempts.get(userId);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + OTP_TTL_MINUTES * 60 * 1000 };
    otpAttempts.set(userId, entry);
  }
  entry.count += 1;

  if (entry.count >= MAX_OTP_ATTEMPTS) {
    /* Too many misses on this account — throw the codes away so the
       correct one can no longer be reached even by chance. */
    deleteResetsForUser.run(userId);
    otpAttempts.delete(userId);
  }
}

function clearOtpFailures(userId) {
  otpAttempts.delete(userId);
}

/* token_hash is UNIQUE across ALL users (not just the current one), so
   a fresh 6-digit code can — rarely — collide with another user's
   still-live code. Retried a few times with a new random code rather
   than surfacing a 409 to someone whose email is otherwise fine. */
function insertResetRetrying(userId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const otp = randomOtp();
    try {
      insertReset.run(userId, sha(otp), OTP_TTL_MINUTES);
      return otp;
    } catch (error) {
      if (error?.code !== "SQLITE_CONSTRAINT_UNIQUE" && error?.code !== "SQLITE_CONSTRAINT") {
        throw error;
      }
    }
  }
  throw ApiError.internal("Could not generate a reset code. Please try again.");
}

/**
 * Always resolves — even for an email with no account — so the
 * endpoint built on top of this cannot be used to test which emails
 * are registered. `user` is null in that case and the caller (the
 * controller) skips sending anything, but a plausible-shaped `otp` is
 * still returned so the response (and any dev-only fallback built on
 * it) is not itself a second, cheaper oracle.
 */
export function requestPasswordReset(email) {
  const cleanEmail = String(email).trim().toLowerCase();
  const user = findByEmail.get(cleanEmail);

  deleteExpiredResets.run();

  if (!user) return { email: cleanEmail, user: null, otp: randomOtp() };

  /* A previous code for this user (from an earlier request, still
     live) must stop working once a new one is issued — otherwise an
     old code leaked or screenshotted earlier keeps being usable
     indefinitely, even after the user thinks they have moved on from
     it by requesting/using a newer one. */
  deleteResetsForUser.run(user.id);
  const otp = insertResetRetrying(user.id);

  return { email: cleanEmail, user, otp };
}

/** Checks the code without spending it — used by the "enter code" step. */
export function verifyPasswordResetOtp({ email, otp }) {
  const user = findByEmail.get(String(email).trim().toLowerCase());
  const record = user ? findReset.get(user.id, sha(String(otp || ""))) : null;

  if (!record) {
    if (user) registerOtpFailure(user.id);
    throw ApiError.badRequest("That code is invalid or has expired.");
  }

  if (user) clearOtpFailures(user.id);
  return true;
}

export function resetPasswordWithOtp({ email, otp, newPassword }) {
  const user = findByEmail.get(String(email).trim().toLowerCase());
  const record = user ? findReset.get(user.id, sha(String(otp || ""))) : null;

  if (!record) {
    if (user) registerOtpFailure(user.id);
    throw ApiError.badRequest("That code is invalid or has expired.");
  }

  clearOtpFailures(user.id);

  db.transaction(() => {
    updatePassword.run(
      bcrypt.hashSync(newPassword, config.bcryptRounds),
      user.id
    );
    /* Deletes every outstanding code for this user, not just the one
       redeemed — a sibling code from an earlier "resend" must not
       remain able to reset the password again after recovery is
       already considered complete. */
    deleteResetsForUser.run(user.id);
  })();

  return user.id;
}

/* ==================================================================
   GOOGLE SIGN-IN

   The controller has already verified the ID token's signature and
   audience against Google's public keys before this runs — this
   function only ever sees a payload Google itself vouched for.

   Email is the join key with the rest of the app: a Google sign-in
   for an email that already has a password-based account signs into
   that SAME account rather than creating a second one, so patients
   who registered normally can still use Google afterwards and vice
   versa. A brand-new email creates an account exactly like /register
   does — patient profile included — except the password is a random
   value nobody knows. That account is not password-less by accident:
   password_hash is NOT NULL in the schema, and leaving sign-in-with-
   password possible (via a later "forgot password") is more useful
   than a special-cased column.
================================================================== */

export function loginOrRegisterWithGoogle({ email, name, emailVerified }) {
  if (!emailVerified) {
    throw ApiError.forbidden(
      "Your Google account's email address is not verified."
    );
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const existing = findByEmail.get(cleanEmail);

  if (existing) {
    if (existing.status !== "active") {
      throw ApiError.forbidden(
        "Your account has been deactivated. Please contact the hospital administrator."
      );
    }

    markLoginSuccess.run(existing.id);
    return { user: publicUser(findById.get(existing.id)), created: false };
  }

  /* A random password nobody is ever told. The account is reachable
     through Google, or later through "forgot password" once one is
     wired up to a real inbox — never through this value. */
  const unusablePassword = crypto.randomBytes(24).toString("hex");
  const passwordHash = bcrypt.hashSync(unusablePassword, config.bcryptRounds);

  const created = db.transaction(() => {
    const result = insertUser.run({
      name: String(name || cleanEmail.split("@")[0]).trim(),
      email: cleanEmail,
      phone: null,
      password_hash: passwordHash,
      date_of_birth: null,
      gender: null,
    });

    const userId = result.lastInsertRowid;

    insertPatientProfile.run(
      userId,
      String(name || cleanEmail.split("@")[0]).trim(),
      null,
      cleanEmail,
      null,
      null
    );

    markLoginSuccess.run(userId);
    return findById.get(userId);
  })();

  return { user: publicUser(created), created: true };
}
