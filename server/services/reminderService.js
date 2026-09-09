import db from "../db.js";
import { config } from "../config/env.js";
import { sendMail, mailerConfigured } from "../utils/mailer.js";
import { sendWhatsApp, whatsappConfigured } from "../utils/whatsapp.js";
import { notify, notifyAdmins } from "../utils/notify.js";

/* ==================================================================
   APPOINTMENT REMINDERS + LOW-STOCK DIGEST

   A sweep runs on a timer (see startReminderScheduler) and, for each
   configured lead time, finds the appointments falling inside that
   window and sends the patient one reminder per channel.

   `appointment_reminders` has UNIQUE (appointment_id, channel,
   offset_label) and every send is recorded there BEFORE it is
   attempted, so an overlapping or restarted sweep can never send the
   same person the same reminder twice. That guarantee is the reason
   the table exists at all.
================================================================== */

/* Only appointments a patient is actually expected to attend. */
const REMINDABLE = ["pending", "confirmed", "scheduled", "rescheduled"];

/* The Twilio sandbox caps sending at one message every three seconds.
   3.5s leaves headroom for clock skew without slowing a real sweep
   noticeably — a 20-patient batch takes about a minute. */
const WHATSAPP_GAP_MS = 3500;

const dueAppointments = db.prepare(`
  SELECT
    a.id,
    a.appointment_date            AS date,
    a.appointment_time            AS time,
    a.reason,
    a.status,
    a.mode,
    a.video_room                  AS videoRoom,
    u.id                          AS userId,
    u.name                        AS patientName,
    u.email                       AS patientEmail,
    u.phone                       AS patientPhone,
    d.name                        AS doctorName,
    dep.name                      AS departmentName
  FROM appointments a
  JOIN users   u   ON u.id  = a.user_id
  JOIN doctors d   ON d.id  = a.doctor_id
  LEFT JOIN departments dep ON dep.id = a.department_id
  WHERE a.status IN (${REMINDABLE.map(() => "?").join(",")})
    AND datetime(a.appointment_date || ' ' || a.appointment_time)
        BETWEEN datetime('now', 'localtime', ?) AND datetime('now', 'localtime', ?)
`);

/*
 * 'localtime' is not optional here. Appointment rows store naive local
 * strings ("2026-08-29 16:00"), while datetime('now') is UTC — on this
 * machine that is a 5h30m gap, so without it the sweep reminds about
 * appointments that are already hours in the past.
 *
 * The window is also a BAND, not "everything up to N hours out".
 * Bounding it below is what stops an appointment 40 minutes away from
 * collecting the 24-hour reminder as well, and being told it is "in
 * about 1 day(s)".
 */

/*
 * A row that failed is not a row that was sent.
 *
 * The row is written before the attempt, so without this check a
 * transient failure (or a whole broken deploy) would suppress every
 * future retry for that appointment — permanently, since nothing ever
 * clears it.
 */
const alreadySent = db.prepare(`
  SELECT 1 FROM appointment_reminders
  WHERE appointment_id = ? AND channel = ? AND offset_label = ?
    AND status <> 'failed'
`);

const recordReminder = db.prepare(`
  INSERT OR IGNORE INTO appointment_reminders
    (appointment_id, channel, offset_label, status, error)
  VALUES (?, ?, ?, ?, ?)
`);

const markReminder = db.prepare(`
  UPDATE appointment_reminders
     SET status = ?, error = ?, sent_at = datetime('now')
   WHERE appointment_id = ? AND channel = ? AND offset_label = ?
`);

function formatWhen(date, time) {
  try {
    const parsed = new Date(`${date}T${time}`);
    if (Number.isNaN(parsed.getTime())) return `${date} ${time}`;

    return parsed.toLocaleString("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return `${date} ${time}`;
  }
}

function reminderText(appointment, leadLabel) {
  const when = formatWhen(appointment.date, appointment.time);
  const lines = [
    `Hi ${appointment.patientName},`,
    "",
    `This is a reminder for your appointment ${leadLabel}.`,
    "",
    `Doctor      : ${appointment.doctorName}`,
    appointment.departmentName ? `Department  : ${appointment.departmentName}` : null,
    `When        : ${when}`,
    appointment.reason ? `Reason      : ${appointment.reason}` : null,
    `Status      : ${appointment.status}`,
  ].filter(Boolean);

  if (appointment.mode === "video" && appointment.videoRoom) {
    lines.push(
      "",
      "This is a video consultation. Join from:",
      `${config.appUrl}/my-appointments`
    );
  } else {
    lines.push("", "Please arrive 10 minutes early at the hospital reception.");
  }

  lines.push("", "— HealthCare Pro");

  return lines.join("\n");
}

function reminderHtml(appointment, leadLabel) {
  const when = formatWhen(appointment.date, appointment.time);

  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px">
    <h2 style="color:#1d4ed8;margin:0 0 4px">Appointment reminder</h2>
    <p style="color:#475569;margin:0 0 16px">Your appointment is ${leadLabel}.</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <tr><td style="padding:6px 0;color:#64748b">Patient</td><td style="padding:6px 0"><b>${appointment.patientName}</b></td></tr>
      <tr><td style="padding:6px 0;color:#64748b">Doctor</td><td style="padding:6px 0"><b>${appointment.doctorName}</b></td></tr>
      ${appointment.departmentName ? `<tr><td style="padding:6px 0;color:#64748b">Department</td><td style="padding:6px 0">${appointment.departmentName}</td></tr>` : ""}
      <tr><td style="padding:6px 0;color:#64748b">When</td><td style="padding:6px 0"><b>${when}</b></td></tr>
      ${appointment.reason ? `<tr><td style="padding:6px 0;color:#64748b">Reason</td><td style="padding:6px 0">${appointment.reason}</td></tr>` : ""}
    </table>
    <p style="margin:18px 0 0">
      <a href="${config.appUrl}/my-appointments"
         style="background:#1d4ed8;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;display:inline-block">
        ${appointment.mode === "video" ? "Join / view appointment" : "View appointment"}
      </a>
    </p>
    <p style="color:#94a3b8;font-size:12px;margin-top:20px">HealthCare Pro</p>
  </div>`;
}

/**
 * Send every outstanding reminder for one lead time.
 *
 * `hours` is how far ahead to look; an appointment is reminded once
 * it falls inside that window and has not been reminded for this
 * particular lead time before.
 */
async function sweepLeadTime(hours) {
  const label = `${hours}h`;
  const leadLabel = hours >= 24 ? `in about ${Math.round(hours / 24)} day(s)` : `in about ${hours} hour(s)`;

  /*
   * Look at a band around the lead time rather than everything up to
   * it. The band is one sweep wide (plus slack) so an appointment
   * cannot fall between two sweeps, but no wider — widen it and a
   * patient seen 40 minutes before their slot also collects the
   * 24-hour reminder, which then tells them it is "in about 1 day(s)".
   */
  const bandMinutes = Math.max(Number(config.reminderSweepMinutes) || 15, 5) + 5;
  const upperMinutes = hours * 60;
  const lowerMinutes = Math.max(upperMinutes - bandMinutes, 0);

  const appointments = dueAppointments.all(
    ...REMINDABLE,
    `+${lowerMinutes} minutes`,
    `+${upperMinutes} minutes`
  );

  let sent = 0;
  let whatsappSends = 0;

  for (const appointment of appointments) {
    /* In-app always — it costs nothing and works with no provider. */
    if (!alreadySent.get(appointment.id, "inapp", label)) {
      recordReminder.run(appointment.id, "inapp", label, "sent", null);

      notify(appointment.userId, {
        title: "Appointment reminder",
        message: `${appointment.doctorName} — ${formatWhen(appointment.date, appointment.time)}`,
        type: "info",
        link: "/my-appointments",
      });

      sent += 1;
    }

    if (mailerConfigured && appointment.patientEmail && !alreadySent.get(appointment.id, "email", label)) {
      /* Recorded first: a crash mid-send must not re-send later. */
      recordReminder.run(appointment.id, "email", label, "sent", null);

      const result = await sendMail({
        to: appointment.patientEmail,
        subject: `Reminder: appointment with ${appointment.doctorName}`,
        text: reminderText(appointment, leadLabel),
        html: reminderHtml(appointment, leadLabel),
      });

      if (!result.sent) {
        markReminder.run("failed", result.reason || null, appointment.id, "email", label);
      } else {
        sent += 1;
      }
    }

    if (whatsappConfigured && appointment.patientPhone && !alreadySent.get(appointment.id, "whatsapp", label)) {
      recordReminder.run(appointment.id, "whatsapp", label, "sent", null);

      /* The Twilio sandbox accepts one message every three seconds and
         rejects the rest, so a clinic-sized batch would lose everything
         after the first without this. Only paid between sends. */
      if (whatsappSends > 0) {
        await new Promise((resolve) => setTimeout(resolve, WHATSAPP_GAP_MS));
      }
      whatsappSends += 1;

      const result = await sendWhatsApp({
        to: appointment.patientPhone,
        body: reminderText(appointment, leadLabel),
      });

      if (!result.sent) {
        markReminder.run("failed", result.reason || null, appointment.id, "whatsapp", label);
      } else {
        sent += 1;
      }
    }
  }

  return { window: label, considered: appointments.length, sent };
}

/** Run one full reminder pass across every configured lead time. */
export async function runReminderSweep() {
  const results = [];

  /* Shortest window first: an appointment inside the 2h window is
     also inside the 24h one, and reminding for the nearer deadline
     first is what a patient would expect to see. */
  for (const hours of [...config.reminderLeadHours].sort((a, b) => a - b)) {
    results.push(await sweepLeadTime(hours));
  }

  return results;
}

/* ==================================================================
   LOW-STOCK DIGEST

   Emailed to administrators at most once a day. The date stamp lives
   in schema_meta rather than a dedicated table — it is a single
   scalar and needs no history.
================================================================== */

const lowStockItems = db.prepare(`
  SELECT name, category, stock, unit_price AS price
    FROM pharmacy_items
   WHERE stock <= ?
   ORDER BY stock ASC
`);

const activeAdmins = db.prepare(
  `SELECT id, name, email FROM users WHERE role = 'admin' AND status = 'active'`
);

const readMeta = db.prepare(`SELECT value FROM schema_meta WHERE key = ?`);
const writeMeta = db.prepare(
  `INSERT INTO schema_meta (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
);

export async function runLowStockDigest({ force = false } = {}) {
  if (!config.lowStockAlertEnabled && !force) return { skipped: "disabled" };

  const today = new Date().toISOString().slice(0, 10);

  if (!force && readMeta.get("low_stock_digest_date")?.value === today) {
    return { skipped: "already sent today" };
  }

  const items = lowStockItems.all(config.lowStockThreshold);

  /* Nothing low is still a successful run — stamp the day so a later
     dip does not fire a second digest. */
  writeMeta.run("low_stock_digest_date", today);

  if (items.length === 0) return { items: 0 };

  const lines = items.map(
    (item) => `  • ${item.name}${item.category ? ` (${item.category})` : ""} — ${item.stock} units left`
  );

  const text = [
    "Pharmacy stock is running low on the following items:",
    "",
    ...lines,
    "",
    `Threshold: ${config.lowStockThreshold} units or fewer.`,
    `${config.appUrl}/pharmacy`,
    "",
    "— HealthCare Pro",
  ].join("\n");

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px">
    <h2 style="color:#b45309;margin:0 0 4px">Pharmacy low-stock alert</h2>
    <p style="color:#475569;margin:0 0 16px">
      ${items.length} item${items.length === 1 ? "" : "s"} at or below ${config.lowStockThreshold} units.
    </p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <tr style="text-align:left;color:#64748b">
        <th style="padding:6px 8px 6px 0">Item</th>
        <th style="padding:6px 8px">Category</th>
        <th style="padding:6px 0;text-align:right">Stock</th>
      </tr>
      ${items
        .map(
          (item) => `<tr>
            <td style="padding:6px 8px 6px 0"><b>${item.name}</b></td>
            <td style="padding:6px 8px;color:#64748b">${item.category || "—"}</td>
            <td style="padding:6px 0;text-align:right;color:${item.stock === 0 ? "#dc2626" : "#b45309"}"><b>${item.stock}</b></td>
          </tr>`
        )
        .join("")}
    </table>
    <p style="margin:18px 0 0">
      <a href="${config.appUrl}/pharmacy"
         style="background:#1d4ed8;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;display:inline-block">
        Open pharmacy inventory
      </a>
    </p>
  </div>`;

  notifyAdmins({
    title: "Pharmacy low on stock",
    message: `${items.length} item${items.length === 1 ? " is" : "s are"} at or below ${config.lowStockThreshold} units.`,
    type: "warning",
    link: "/pharmacy",
  });

  if (mailerConfigured) {
    for (const admin of activeAdmins.all()) {
      if (!admin.email) continue;

      await sendMail({
        to: admin.email,
        subject: `Low stock: ${items.length} pharmacy item${items.length === 1 ? "" : "s"} need reordering`,
        text,
        html,
      });
    }
  }

  return { items: items.length };
}

/* ==================================================================
   SCHEDULER

   setInterval rather than a cron dependency: the sweep is idempotent
   and the cadence is minutes, so wall-clock alignment buys nothing.
================================================================== */

let timer = null;

export function startReminderScheduler() {
  if (timer) return;

  if (!config.reminderEnabled) {
    console.log("[reminders] disabled (REMINDER_ENABLED=false)");
    return;
  }

  const everyMs = Math.max(1, config.reminderSweepMinutes) * 60 * 1000;

  const tick = async () => {
    try {
      const results = await runReminderSweep();
      const total = results.reduce((sum, row) => sum + row.sent, 0);
      if (total > 0) console.log(`[reminders] sent ${total} reminder(s)`);
    } catch (error) {
      console.error("[reminders] sweep failed:", error.message);
    }

    try {
      await runLowStockDigest();
    } catch (error) {
      console.error("[reminders] low-stock digest failed:", error.message);
    }
  };

  /* A short delay on boot keeps startup logs readable and lets the
     socket layer finish wiring before notifications start firing. */
  setTimeout(tick, 20_000);
  timer = setInterval(tick, everyMs);

  console.log(
    `[reminders] scheduler on — every ${config.reminderSweepMinutes}m, ` +
      `lead times ${config.reminderLeadHours.join("h/")}h, ` +
      `email ${mailerConfigured ? "on" : "off"}, whatsapp ${whatsappConfigured ? "on" : "off"}`
  );
}

export function stopReminderScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

export default {
  runReminderSweep,
  runLowStockDigest,
  startReminderScheduler,
  stopReminderScheduler,
};
