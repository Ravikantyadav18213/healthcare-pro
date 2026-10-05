import db from "../db.js";
import ApiError from "../utils/ApiError.js";
import { sendMail } from "../utils/mailer.js";

/* ==================================================================
   CONTACT US

   The public form on the marketing site (Home.jsx). Every submission
   is saved so it shows up in the admin view even if the email below
   never arrives, and is also emailed straight to the inbox that
   actually gets read day to day — the two don't depend on each other.
================================================================== */

const CONTACT_RECIPIENT = "ravimcm50@gmail.com";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toCamel(row) {
  if (!row) return row;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    message: row.message,
    status: row.status,
    ip: row.ip,
    createdAt: row.created_at,
    replyMessage: row.reply_message,
    repliedAt: row.replied_at,
  };
}

function contactEmail({ name, email, message }) {
  const text = `New message from the HealthCare Pro contact form.\n\nName: ${name}\nEmail: ${email}\n\nMessage:\n${message}`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <p style="font-size:14px;color:#334155;margin:0 0 16px;">
        New message from the HealthCare Pro contact form.
      </p>
      <p style="font-size:13px;color:#334155;margin:0 0 4px;"><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p style="font-size:13px;color:#334155;margin:0 0 16px;"><strong>Email:</strong> ${escapeHtml(email)}</p>
      <div style="font-size:13px;color:#334155;background:#F8FAFC;border-radius:12px;padding:14px 16px;white-space:pre-wrap;">${escapeHtml(message)}</div>
    </div>
  `;

  return { text, html };
}

/** Sent to the ORIGINAL sender — quotes their message so the reply
    makes sense out of context in their inbox. */
function replyEmail({ name, originalMessage, reply }) {
  const text = `Hi ${name},\n\n${reply}\n\n---\nYour original message:\n${originalMessage}`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <p style="font-size:14px;color:#334155;margin:0 0 16px;">Hi ${escapeHtml(name)},</p>
      <p style="font-size:14px;color:#334155;margin:0 0 20px;white-space:pre-wrap;">${escapeHtml(reply)}</p>
      <p style="font-size:12px;color:#94A3B8;margin:0 0 6px;">Your original message:</p>
      <div style="font-size:12px;color:#64748B;background:#F8FAFC;border-left:3px solid #CBD5E1;border-radius:4px;padding:10px 14px;white-space:pre-wrap;">${escapeHtml(originalMessage)}</div>
    </div>
  `;

  return { text, html };
}

/** Saves the message first — the DB copy is the record of truth — then
    emails it. A failed email never fails the submission itself. */
export async function submitContactMessage({ name, email, message, ip }) {
  const insert = db.prepare(
    `INSERT INTO contact_messages (name, email, message, ip) VALUES (@name, @email, @message, @ip)`
  );
  const result = await insert.run({ name, email, message, ip: ip || null });

  const created = await db
    .prepare(`SELECT * FROM contact_messages WHERE id = ?`)
    .get(result.lastInsertRowid);

  const { text, html } = contactEmail({ name, email, message });
  const mailResult = await sendMail({
    to: CONTACT_RECIPIENT,
    subject: `New contact message from ${name}`,
    text,
    html,
  });

  return { message: toCamel(created), emailed: mailResult.sent, mailError: mailResult.reason };
}

export async function listContactMessages({ status = "" } = {}) {
  const where = [];
  const params = {};

  if (status && status !== "All") {
    where.push("status = @status");
    params.status = status;
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await db
    .prepare(`SELECT * FROM contact_messages ${clause} ORDER BY created_at DESC`)
    .all(params);

  return rows.map(toCamel);
}

export async function contactMessageStats() {
  const total = (await db.prepare(`SELECT COUNT(*) AS n FROM contact_messages`).get()).n;
  const unread = (
    await db
      .prepare(`SELECT COUNT(*) AS n FROM contact_messages WHERE status = 'unread'`)
      .get()
  ).n;

  return { total, unread };
}

async function getOrThrow(id) {
  const row = await db.prepare(`SELECT * FROM contact_messages WHERE id = ?`).get(Number(id));
  if (!row) throw ApiError.notFound("Contact message not found.");
  return row;
}

export async function markContactMessageRead(id) {
  await getOrThrow(id);
  await db.prepare(`UPDATE contact_messages SET status = 'read' WHERE id = ?`).run(Number(id));
  return toCamel(await db.prepare(`SELECT * FROM contact_messages WHERE id = ?`).get(Number(id)));
}

export async function deleteContactMessage(id) {
  const row = await getOrThrow(id);
  await db.prepare(`DELETE FROM contact_messages WHERE id = ?`).run(Number(id));
  return toCamel(row);
}

/** Emails the sender back and records the reply on the same row.
    Marks the message read too — replying to something you have not
    read is not a state worth representing. */
export async function replyToContactMessage(id, replyMessage) {
  const row = await getOrThrow(id);

  const { text, html } = replyEmail({
    name: row.name,
    originalMessage: row.message,
    reply: replyMessage,
  });

  const mailResult = await sendMail({
    to: row.email,
    subject: "Re: your message to HealthCare Pro",
    text,
    html,
  });

  if (!mailResult.sent) {
    throw ApiError.badRequest(
      `Could not send the reply email: ${mailResult.reason || "unknown error"}`
    );
  }

  await db.prepare(
    `UPDATE contact_messages
        SET reply_message = ?, replied_at = datetime('now'), status = 'read'
      WHERE id = ?`
  ).run(replyMessage, Number(id));

  return toCamel(await db.prepare(`SELECT * FROM contact_messages WHERE id = ?`).get(Number(id)));
}
