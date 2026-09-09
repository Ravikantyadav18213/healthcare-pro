import crypto from "node:crypto";
import bcrypt from "bcryptjs";

import db from "../db.js";
import ApiError from "../utils/ApiError.js";
import { config } from "../config/env.js";
import { sendMail, mailerConfigured } from "../utils/mailer.js";

/* ==================================================================
   TWO-FACTOR LOGIN (email OTP)

   Password success does not create a session for an account with 2FA
   on. Instead a one-time code is emailed and the browser is handed an
   opaque `challenge`; only redeeming that challenge with the right
   code produces a session.

   The challenge is random rather than the user's id, so holding a
   valid email/password pair is not enough to start guessing codes for
   an account — the attacker also has to hold the challenge that was
   issued, and each one dies after MAX_ATTEMPTS wrong guesses.
================================================================== */

const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 5;

const insertOtp = db.prepare(`
  INSERT INTO login_otps (user_id, code_hash, challenge, expires_at)
  VALUES (@userId, @codeHash, @challenge, datetime('now', @ttl))
`);

const findByChallenge = db.prepare(`
  SELECT o.*, u.id AS uid, u.email, u.name, u.status
    FROM login_otps o
    JOIN users u ON u.id = o.user_id
   WHERE o.challenge = ?
`);

const bumpAttempts = db.prepare(
  `UPDATE login_otps SET attempts = attempts + 1 WHERE id = ?`
);

const consume = db.prepare(
  `UPDATE login_otps SET consumed_at = datetime('now') WHERE id = ?`
);

/* Any earlier challenge for this account is void the moment a new one
   is issued — two live codes for one login is one more than needed. */
const voidPrevious = db.prepare(`
  UPDATE login_otps
     SET consumed_at = datetime('now')
   WHERE user_id = ? AND consumed_at IS NULL
`);

const setFlag = db.prepare(
  `UPDATE users SET two_factor_enabled = ?, updated_at = datetime('now') WHERE id = ?`
);

function generateCode() {
  /* crypto rather than Math.random: this is an authentication secret. */
  return String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

function otpEmail(code, minutes, name) {
  const text = [
    `Hi ${name || "there"},`,
    "",
    `Your HealthCare Pro sign-in code is: ${code}`,
    "",
    `It expires in ${minutes} minutes.`,
    "If you did not try to sign in, change your password immediately.",
    "",
    "— HealthCare Pro",
  ].join("\n");

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:460px">
    <h2 style="color:#1d4ed8;margin:0 0 6px">Your sign-in code</h2>
    <p style="color:#475569;margin:0 0 18px">Enter this code to finish signing in.</p>
    <div style="font-size:30px;letter-spacing:8px;font-weight:700;color:#0f172a;
                background:#f1f5f9;padding:14px 18px;border-radius:12px;text-align:center">
      ${code}
    </div>
    <p style="color:#64748b;font-size:13px;margin:18px 0 0">
      Expires in ${minutes} minutes. If this wasn't you, change your password immediately.
    </p>
  </div>`;

  return { text, html };
}

/**
 * Issue a challenge for an account that has 2FA switched on.
 *
 * Returns the opaque challenge plus, in development with no mailer
 * configured, the code itself — otherwise the flow would be
 * untestable locally. That echo is gated on the same explicit opt-in
 * the password-reset flow uses.
 */
export async function beginChallenge(user) {
  const code = generateCode();
  const challenge = crypto.randomBytes(24).toString("hex");

  voidPrevious.run(user.id);

  insertOtp.run({
    userId: user.id,
    codeHash: bcrypt.hashSync(code, 10),
    challenge,
    ttl: `+${config.twoFactorMinutes} minutes`,
  });

  const { text, html } = otpEmail(code, config.twoFactorMinutes, user.name);

  const delivery = await sendMail({
    to: user.email,
    subject: `${code} is your HealthCare Pro sign-in code`,
    text,
    html,
  });

  return {
    challenge,
    expiresInMinutes: config.twoFactorMinutes,
    emailed: delivery.sent,
    /* Dev-only escape hatch, same rule as /auth/forgot-password. */
    devCode: !delivery.sent && config.allowDevOtp ? code : undefined,
  };
}

/**
 * Redeem a challenge. Returns the user id on success.
 *
 * Every failure path burns an attempt, including an expired or
 * already-used challenge, so a valid-looking response cannot be used
 * to distinguish "wrong code" from "wrong challenge".
 */
export function verifyChallenge({ challenge, code }) {
  if (!challenge || !code) {
    throw ApiError.badRequest("Enter the code we emailed you.");
  }

  const row = findByChallenge.get(String(challenge));

  if (!row) throw ApiError.unauthorized("That sign-in request has expired. Start again.");

  if (row.consumed_at) {
    throw ApiError.unauthorized("That code has already been used. Start again.");
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    consume.run(row.id);
    throw ApiError.unauthorized("Too many incorrect codes. Start again.");
  }

  const expired =
    db
      .prepare(`SELECT datetime('now') > ? AS expired`)
      .get(row.expires_at)?.expired === 1;

  if (expired) {
    consume.run(row.id);
    throw ApiError.unauthorized("That code has expired. Start again.");
  }

  if (!bcrypt.compareSync(String(code).trim(), row.code_hash)) {
    bumpAttempts.run(row.id);

    const left = MAX_ATTEMPTS - (row.attempts + 1);

    throw ApiError.unauthorized(
      left > 0
        ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.`
        : "Too many incorrect codes. Start again."
    );
  }

  if (row.status !== "active") {
    consume.run(row.id);
    throw ApiError.forbidden("Your account has been deactivated.");
  }

  consume.run(row.id);

  return { userId: row.uid };
}

/** Turn the second factor on or off for one account. */
export function setEnabled(userId, enabled) {
  if (enabled && !mailerConfigured) {
    throw ApiError.badRequest(
      "Two-factor sign-in needs outgoing email to be configured on the server."
    );
  }

  setFlag.run(enabled ? 1 : 0, userId);

  /* Switching it off should not leave a live challenge behind. */
  if (!enabled) voidPrevious.run(userId);

  return { twoFactorEnabled: Boolean(enabled) };
}

export function isEnabled(userId) {
  const row = db
    .prepare(`SELECT two_factor_enabled AS enabled FROM users WHERE id = ?`)
    .get(userId);

  return Boolean(row?.enabled);
}

export default { beginChallenge, verifyChallenge, setEnabled, isEnabled };
