import crypto from "node:crypto";
import bcrypt from "bcryptjs";

import db from "../db.js";
import { config } from "../config/env.js";
import ApiError from "../utils/ApiError.js";
import { publicUser } from "../utils/sanitize.js";
import { incr, pexpire, del } from "../utils/kv.js";

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

export async function register({ name, email, phone, password, dateOfBirth, gender }) {
  const cleanEmail = String(email).trim().toLowerCase();

  if (await findByEmail.get(cleanEmail)) {
    throw ApiError.conflict("An account with this email already exists.");
  }

  const passwordHash = bcrypt.hashSync(password, config.bcryptRounds);

  const created = await db.transaction(async () => {
    const result = await insertUser.run({
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
    await insertPatientProfile.run(
      userId,
      String(name).trim(),
      phone ? String(phone).trim() : null,
      cleanEmail,
      dateOfBirth || null,
      gender || null
    );

    return await findById.get(userId);
  })();

  return publicUser(created);
}

/* ==================================================================
   LOGIN
================================================================== */

export async function login({ email, password }) {
  const cleanEmail = String(email).trim().toLowerCase();
  const user = await findByEmail.get(cleanEmail);

  /*
   * bcrypt.compare is run even when the account is missing so the
   * response time does not reveal whether an email is registered.
   */
  const hash = user?.password_hash || "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu";
  const matches = bcrypt.compareSync(password, hash);

  if (!user || !matches) {
    if (user) await markLoginFailure.run(user.id);
    throw ApiError.unauthorized("Invalid email or password.");
  }

  if (user.status !== "active") {
    throw ApiError.forbidden(
      "Your account has been deactivated. Please contact the hospital administrator."
    );
  }

  await markLoginSuccess.run(user.id);

  return publicUser(await findById.get(user.id));
}

/* ==================================================================
   PROFILE
================================================================== */

export async function getUser(id) {
  const user = await findById.get(id);
  if (!user) throw ApiError.notFound("Account not found.");
  return publicUser(user);
}

export async function updateOwnProfile(id, { name, phone, dateOfBirth, gender }) {
  const existing = await findById.get(id);
  if (!existing) throw ApiError.notFound("Account not found.");

  await updateProfile.run({
    id,
    name: String(name).trim(),
    phone: phone ? String(phone).trim() : null,
    date_of_birth: dateOfBirth || null,
    gender: gender || null,
  });

  /* Keep the linked patient profile in step. */
  await db.prepare(
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

  return publicUser(await findById.get(id));
}

export async function changePassword(id, { currentPassword, newPassword }) {
  const user = await findById.get(id);
  if (!user) throw ApiError.notFound("Account not found.");

  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    throw ApiError.validation({
      currentPassword: "Your current password is incorrect.",
    });
  }

  await updatePassword.run(bcrypt.hashSync(newPassword, config.bcryptRounds), id);
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
 * the shared kv store (server/utils/kv.js, Redis in production) so no
 * schema change is needed; the count naturally expires alongside the
 * codes it's guarding, which are only ever valid for 10 minutes.
 */
const MAX_OTP_ATTEMPTS = 10;

function otpAttemptsKey(userId) {
  return `otp-attempts:${userId}`;
}

async function registerOtpFailure(userId) {
  const key = otpAttemptsKey(userId);
  const count = await incr(key);
  if (count === 1) await pexpire(key, OTP_TTL_MINUTES * 60 * 1000);

  if (count >= MAX_OTP_ATTEMPTS) {
    /* Too many misses on this account — throw the codes away so the
       correct one can no longer be reached even by chance. */
    await deleteResetsForUser.run(userId);
    await del(key);
  }
}

async function clearOtpFailures(userId) {
  await del(otpAttemptsKey(userId));
}

/* token_hash is UNIQUE across ALL users (not just the current one), so
   a fresh 6-digit code can — rarely — collide with another user's
   still-live code. Retried a few times with a new random code rather
   than surfacing a 409 to someone whose email is otherwise fine. */
async function insertResetRetrying(userId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const otp = randomOtp();
    try {
      await insertReset.run(userId, sha(otp), OTP_TTL_MINUTES);
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
export async function requestPasswordReset(email) {
  const cleanEmail = String(email).trim().toLowerCase();
  const user = await findByEmail.get(cleanEmail);

  await deleteExpiredResets.run();

  if (!user) return { email: cleanEmail, user: null, otp: randomOtp() };

  /* A previous code for this user (from an earlier request, still
     live) must stop working once a new one is issued — otherwise an
     old code leaked or screenshotted earlier keeps being usable
     indefinitely, even after the user thinks they have moved on from
     it by requesting/using a newer one. */
  await deleteResetsForUser.run(user.id);
  const otp = await insertResetRetrying(user.id);

  return { email: cleanEmail, user, otp };
}

/** Checks the code without spending it — used by the "enter code" step. */
export async function verifyPasswordResetOtp({ email, otp }) {
  const user = await findByEmail.get(String(email).trim().toLowerCase());
  const record = user ? await findReset.get(user.id, sha(String(otp || ""))) : null;

  if (!record) {
    if (user) await registerOtpFailure(user.id);
    throw ApiError.badRequest("That code is invalid or has expired.");
  }

  if (user) await clearOtpFailures(user.id);
  return true;
}

export async function resetPasswordWithOtp({ email, otp, newPassword }) {
  const user = await findByEmail.get(String(email).trim().toLowerCase());
  const record = user ? await findReset.get(user.id, sha(String(otp || ""))) : null;

  if (!record) {
    if (user) await registerOtpFailure(user.id);
    throw ApiError.badRequest("That code is invalid or has expired.");
  }

  await clearOtpFailures(user.id);

  await db.transaction(async () => {
    await updatePassword.run(
      bcrypt.hashSync(newPassword, config.bcryptRounds),
      user.id
    );
    /* Deletes every outstanding code for this user, not just the one
       redeemed — a sibling code from an earlier "resend" must not
       remain able to reset the password again after recovery is
       already considered complete. */
    await deleteResetsForUser.run(user.id);
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

export async function loginOrRegisterWithGoogle({ email, name, emailVerified }) {
  if (!emailVerified) {
    throw ApiError.forbidden(
      "Your Google account's email address is not verified."
    );
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const existing = await findByEmail.get(cleanEmail);

  if (existing) {
    if (existing.status !== "active") {
      throw ApiError.forbidden(
        "Your account has been deactivated. Please contact the hospital administrator."
      );
    }

    await markLoginSuccess.run(existing.id);
    return { user: publicUser(await findById.get(existing.id)), created: false };
  }

  /* A random password nobody is ever told. The account is reachable
     through Google, or later through "forgot password" once one is
     wired up to a real inbox — never through this value. */
  const unusablePassword = crypto.randomBytes(24).toString("hex");
  const passwordHash = bcrypt.hashSync(unusablePassword, config.bcryptRounds);

  const created = await db.transaction(async () => {
    const result = await insertUser.run({
      name: String(name || cleanEmail.split("@")[0]).trim(),
      email: cleanEmail,
      phone: null,
      password_hash: passwordHash,
      date_of_birth: null,
      gender: null,
    });

    const userId = result.lastInsertRowid;

    await insertPatientProfile.run(
      userId,
      String(name || cleanEmail.split("@")[0]).trim(),
      null,
      cleanEmail,
      null,
      null
    );

    await markLoginSuccess.run(userId);
    return await findById.get(userId);
  })();

  return { user: publicUser(created), created: true };
}
