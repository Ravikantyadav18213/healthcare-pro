import nodemailer from "nodemailer";

import { config } from "../config/env.js";

/* ==================================================================
   OUTGOING MAIL

   A single account sends every OTP the app issues. The transporter is
   built once and reused — a fresh connection per email would be
   slower and is not necessary for this volume.

   With no MAIL_USER/MAIL_PASS configured, mailerConfigured is false
   and sendMail resolves to { sent: false } instead of throwing, so a
   caller can fall back to showing the code directly (dev only) rather
   than the request failing outright.
================================================================== */

export const mailerConfigured = Boolean(config.mailUser && config.mailPass);

/* MAIL_HOST unset means Gmail, which is what the default config is
   written for. Any other provider is reached by setting the three
   MAIL_HOST/MAIL_PORT/MAIL_SECURE values instead. */
const transportOptions = config.mailHost
  ? {
      host: config.mailHost,
      port: config.mailPort,
      secure: config.mailSecure,
      auth: { user: config.mailUser, pass: config.mailPass },
    }
  : {
      service: "gmail",
      auth: { user: config.mailUser, pass: config.mailPass },
    };

const transporter = mailerConfigured
  ? nodemailer.createTransport(transportOptions)
  : null;

/** Human-readable name for the account/host doing the sending. */
export const mailerTarget = config.mailHost
  ? `${config.mailUser} via ${config.mailHost}:${config.mailPort}`
  : `${config.mailUser} via Gmail`;

/*
 * Gmail's SMTP errors are famously unhelpful ("Username and Password
 * not accepted"), and the cause is nearly always the same one thing:
 * a normal account password was used where an App Password is
 * required. Translating the common codes into the actual fix saves
 * the reader from guessing.
 */
function explain(error) {
  const message = String(error?.message || error);

  if (error?.code === "EAUTH" || /Username and Password not accepted/i.test(message)) {
    return (
      "SMTP rejected the credentials. For Gmail, MAIL_PASS must be a " +
      "16-character App Password from https://myaccount.google.com/apppasswords " +
      "(2-Step Verification must be on first) — not the account's normal password."
    );
  }

  if (error?.code === "ECONNECTION" || error?.code === "ETIMEDOUT" || error?.code === "ESOCKET") {
    return `Could not reach the mail server (${error.code}). Check the network or MAIL_HOST/MAIL_PORT.`;
  }

  if (error?.code === "EENVELOPE") {
    return `The mail server refused the sender or recipient address: ${message}`;
  }

  return message;
}

/**
 * Opens a connection and authenticates without sending anything, so
 * a misconfiguration surfaces at boot rather than the first time
 * somebody tries to reset a password.
 */
export async function verifyMailer() {
  if (!transporter) {
    return {
      ok: false,
      reason:
        "MAIL_USER / MAIL_PASS are not set, so no password-reset email can be sent.",
    };
  }

  try {
    await transporter.verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: explain(error) };
  }
}

/**
 * Never throws — a failed send should not fail the request that
 * triggered it. The caller reads `sent` to decide what to tell the
 * user, and `reason` is already phrased as something actionable.
 */
export async function sendMail({ to, subject, text, html }) {
  if (!transporter) {
    return {
      sent: false,
      reason: "No mail account is configured (MAIL_USER / MAIL_PASS are unset).",
    };
  }

  try {
    const info = await transporter.sendMail({
      from: config.mailFrom,
      to,
      subject,
      text,
      html,
    });

    console.log(`[mailer] sent to ${to} (${info.messageId})`);
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    const reason = explain(error);
    console.error(`[mailer] send to ${to} failed: ${reason}`);
    return { sent: false, reason };
  }
}

/** A plain-and-HTML pair for one OTP, so the two never drift apart. */
export function otpEmail(otp, minutes) {
  const text = `Your HealthCare Pro password reset code is ${otp}. It expires in ${minutes} minutes. If you did not request this, you can ignore this email.`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:420px;margin:0 auto;padding:24px;">
      <p style="font-size:14px;color:#334155;margin:0 0 16px;">
        Use this code to reset your HealthCare Pro password:
      </p>
      <div style="font-size:32px;font-weight:700;letter-spacing:6px;color:#1D4ED8;background:#EFF6FF;border-radius:12px;padding:16px 20px;text-align:center;margin:0 0 16px;">
        ${otp}
      </div>
      <p style="font-size:12px;color:#94A3B8;margin:0;">
        This code expires in ${minutes} minutes. If you did not request
        this, you can safely ignore this email.
      </p>
    </div>
  `;

  return { text, html };
}
