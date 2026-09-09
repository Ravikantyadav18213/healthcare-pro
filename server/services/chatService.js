import db from "../db.js";
import ApiError from "../utils/ApiError.js";
import notify, { notifyAdmins } from "../utils/notify.js";
import {
  publicConversation,
  publicChatMessage,
  publicChatRequest,
} from "../utils/sanitize.js";
import { emitToUser, emitToUsers, isUserOnline } from "../sockets/index.js";

/* ==================================================================
   PATIENT <-> ADMIN / PATIENT <-> DOCTOR MESSAGING

   The single rule this whole file exists to enforce:

     A patient may never exchange a message with a doctor until an
     administrator has explicitly approved that patient-doctor pair.

   Every write path below re-derives the conversation's status from
   the database on every call — never from anything the client sent —
   so hiding a button, editing React state, or guessing a conversation
   id in the URL cannot open a channel the database says is closed.
================================================================== */

const SELECT_CONVERSATION = `
  SELECT c.*,
         p.name           AS patient_name,
         p.email          AS patient_email,
         du.name           AS doctor_name,
         d.id              AS doctor_catalog_id,
         d.specialization  AS doctor_specialization,
         (SELECT CASE
                   WHEN m.message != '' THEN m.message
                   WHEN m.message_type = 'audio' THEN 'Voice message'
                   WHEN m.message_type = 'image' THEN 'Photo'
                   WHEN m.message_type = 'file'  THEN COALESCE(m.attachment_name, 'Attachment')
                   ELSE m.message
                 END
            FROM chat_messages m
           WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message,
         (SELECT created_at FROM chat_messages m
           WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message_at,
         (SELECT message_type FROM chat_messages m
           WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message_type,
         (SELECT sender_id FROM chat_messages m
           WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message_sender_id,
         (SELECT is_read FROM chat_messages m
           WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message_is_read
    FROM chat_conversations c
    LEFT JOIN users   p  ON p.id  = c.patient_id
    LEFT JOIN users   du ON du.id = c.doctor_id
    LEFT JOIN doctors d  ON d.user_id = c.doctor_id
`;

const SELECT_MESSAGE = `
  SELECT m.*, u.name AS sender_name
    FROM chat_messages m
    LEFT JOIN users u ON u.id = m.sender_id
`;

const SELECT_REQUEST = `
  SELECT r.*,
         p.name  AS patient_name,
         p.email AS patient_email,
         d.name  AS doctor_name,
         d.specialization AS doctor_specialization,
         rb.name AS reviewed_by_name
    FROM chat_approval_requests r
    LEFT JOIN users   p  ON p.id = r.patient_id
    LEFT JOIN doctors d  ON d.id = r.doctor_id
    LEFT JOIN users   rb ON rb.id = r.reviewed_by
`;

const findConversationById = db.prepare(`${SELECT_CONVERSATION} WHERE c.id = ?`);
const findRequestById = db.prepare(`${SELECT_REQUEST} WHERE r.id = ?`);
const findActiveAdmins = db.prepare(
  `SELECT id FROM users WHERE role = 'admin' AND status = 'active'`
);

const insertConversation = db.prepare(`
  INSERT INTO chat_conversations
    (patient_id, doctor_id, admin_id, type, approval_request_id, status)
  VALUES
    (@patient_id, @doctor_id, @admin_id, @type, @approval_request_id, @status)
`);

const insertMessage = db.prepare(`
  INSERT INTO chat_messages
    (conversation_id, sender_id, sender_role, message, message_type,
     attachment_url, attachment_name, attachment_mime, attachment_size,
     attachment_duration)
  VALUES
    (@conversation_id, @sender_id, @sender_role, @message, @message_type,
     @attachment_url, @attachment_name, @attachment_mime, @attachment_size,
     @attachment_duration)
`);

const insertRequest = db.prepare(`
  INSERT INTO chat_approval_requests
    (patient_id, doctor_id, reason, appointment_id, initial_message, status)
  VALUES
    (@patient_id, @doctor_id, @reason, @appointment_id, @initial_message, 'pending')
`);

function unreadCountFor(conversationId, viewerId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS n FROM chat_messages
        WHERE conversation_id = ? AND sender_id != ? AND is_read = 0`
    )
    .get(conversationId, viewerId).n;
}

/**
 * The account on the other end of the thread, from the viewer's side.
 * For a patient-admin thread the "other end" is the admin desk as a
 * whole, so any connected administrator counts as online.
 */
function counterpartOf(row, viewerId) {
  if (row.type === "patient_admin") {
    return Number(row.patient_id) === Number(viewerId)
      ? findActiveAdmins.all().map((a) => a.id)
      : [row.patient_id];
  }

  return [
    Number(row.patient_id) === Number(viewerId) ? row.doctor_id : row.patient_id,
  ].filter(Boolean);
}

function counterpartOnline(row, viewerId) {
  return counterpartOf(row, viewerId).some((id) => isUserOnline(id));
}

/** Every account with a stake in this thread — used for notifications and sockets. */
function conversationRecipients(row) {
  if (row.type === "patient_admin") {
    return [row.patient_id, ...findActiveAdmins.all().map((a) => a.id)];
  }
  return [row.patient_id, row.doctor_id].filter(Boolean);
}

export function getConversationRow(id) {
  const row = findConversationById.get(Number(id));
  if (!row) throw ApiError.notFound("Conversation not found.");
  return row;
}

/* ==================================================================
   AUTHORIZATION HELPERS

   Reused by every controller so the boundary is defined once. None of
   these trust req.body — only the conversation row from the database
   and the authenticated req.user.
================================================================== */

/** Is this user one of the two/three parties this conversation belongs to? */
export function isConversationParticipant(row, user) {
  if (!row || !user) return false;
  if (user.role === "admin") return true;
  if (user.role === "doctor") return Number(row.doctor_id) === Number(user.id);
  return Number(row.patient_id) === Number(user.id);
}

/** The one gate that matters: has an administrator actually approved this pair? */
export function isDoctorChatApproved(row) {
  if (row?.type !== "patient_doctor") return true; // n/a for admin threads
  if (row?.status !== "active") return false;

  if (!row.approval_request_id) return false;

  const approval = db
    .prepare(`SELECT status FROM chat_approval_requests WHERE id = ?`)
    .get(row.approval_request_id);

  return approval?.status === "approved";
}

export function canAccessConversation(row, user) {
  return isConversationParticipant(row, user);
}

export function canSendMessage(row, user) {
  if (!isConversationParticipant(row, user)) return false;
  if (row.status !== "active") return false;
  if (row.type === "patient_doctor") return isDoctorChatApproved(row);
  return true;
}

export function requireParticipant(row, user) {
  if (!canAccessConversation(row, user)) {
    throw ApiError.forbidden("You are not a participant in this conversation.");
  }
}

/**
 * The enforcement point for POST .../messages. Every failure mode maps
 * to the exact business rule from the spec: an unapproved, rejected,
 * revoked, pending or archived thread returns 403, never a 200.
 */
function assertSendable(row, user) {
  requireParticipant(row, user);

  if (row.status === "archived") {
    throw ApiError.forbidden("This conversation has been archived.");
  }

  if (row.status !== "active" || !canSendMessage(row, user)) {
    throw ApiError.forbidden(
      "Doctor communication has not been approved by the administrator."
    );
  }
}

/* ==================================================================
   CONVERSATIONS
================================================================== */

export function listConversations(user) {
  let rows;

  if (user.role === "admin") {
    rows = db
      .prepare(
        `${SELECT_CONVERSATION} WHERE c.type = 'patient_admin'
          ORDER BY COALESCE(last_message_at, c.created_at) DESC`
      )
      .all();
  } else if (user.role === "doctor") {
    /* Only conversations an administrator has actually activated — a
       pending request never shows up here as if it were live. */
    rows = db
      .prepare(
        `${SELECT_CONVERSATION}
          WHERE c.type = 'patient_doctor' AND c.doctor_id = @doctorId AND c.status = 'active'
          ORDER BY COALESCE(last_message_at, c.created_at) DESC`
      )
      .all({ doctorId: user.id });
  } else {
    rows = db
      .prepare(
        `${SELECT_CONVERSATION} WHERE c.patient_id = @patientId
          ORDER BY COALESCE(last_message_at, c.created_at) DESC`
      )
      .all({ patientId: user.id });
  }

  return rows.map((row) =>
    publicConversation(
      {
        ...row,
        unread_count: unreadCountFor(row.id, user.id),
        online: counterpartOnline(row, user.id),
      },
      user.id
    )
  );
}

export function getConversation(user, id) {
  const row = getConversationRow(id);
  requireParticipant(row, user);

  return publicConversation(
    {
      ...row,
      unread_count: unreadCountFor(row.id, user.id),
      online: counterpartOnline(row, user.id),
    },
    user.id
  );
}

/** POST /api/chat/admin — always allowed, never gated by approval. */
export function getOrCreateAdminConversation(patient) {
  if (patient.role !== "user") {
    throw ApiError.forbidden("Only patients can start a conversation with the administrator.");
  }

  let row = db
    .prepare(
      `${SELECT_CONVERSATION} WHERE c.patient_id = ? AND c.type = 'patient_admin'`
    )
    .get(patient.id);

  if (!row) {
    const result = insertConversation.run({
      patient_id: patient.id,
      doctor_id: null,
      admin_id: null,
      type: "patient_admin",
      approval_request_id: null,
      status: "active",
    });

    row = findConversationById.get(result.lastInsertRowid);

    notifyAdmins({
      title: "New patient conversation",
      message: `${patient.name} started a conversation with the administrator.`,
      type: "info",
      link: "/admin/messages",
    });
  }

  return publicConversation(
    { ...row, unread_count: unreadCountFor(row.id, patient.id) },
    patient.id
  );
}

/* ==================================================================
   DOCTOR CHAT APPROVAL WORKFLOW
================================================================== */

export function getDoctorRequestRow(id) {
  const row = findRequestById.get(Number(id));
  if (!row) throw ApiError.notFound("Doctor chat request not found.");
  return row;
}

/** POST /api/chat/doctor-request — creates a pending request only; never opens the chat. */
export function createDoctorChatRequest(patient, { doctorId, appointmentId, reason, initialMessage }) {
  if (patient.role !== "user") {
    throw ApiError.forbidden("Only patients can request doctor communication.");
  }

  const doctor = db.prepare(`SELECT * FROM doctors WHERE id = ?`).get(Number(doctorId));
  if (!doctor) throw ApiError.badRequest("Select a valid doctor.");
  if (doctor.status !== "active") {
    throw ApiError.conflict("This doctor is not currently available for communication.");
  }

  const cleanReason = String(reason || "").trim();
  if (cleanReason.length < 3) {
    throw ApiError.validation({
      reason: "Tell the administrator why you want to contact this doctor.",
    });
  }

  if (appointmentId) {
    const appt = db
      .prepare(`SELECT id FROM appointments WHERE id = ? AND user_id = ?`)
      .get(Number(appointmentId), patient.id);
    if (!appt) throw ApiError.badRequest("That appointment reference is not valid.");
  }

  if (doctor.user_id) {
    const activeConversation = db
      .prepare(
        `SELECT id FROM chat_conversations
          WHERE patient_id = ? AND doctor_id = ? AND type = 'patient_doctor' AND status = 'active'`
      )
      .get(patient.id, doctor.user_id);

    if (activeConversation) {
      throw ApiError.conflict("You already have an approved conversation with this doctor.");
    }
  }

  let requestId;

  try {
    requestId = insertRequest.run({
      patient_id: patient.id,
      doctor_id: doctor.id,
      reason: cleanReason,
      appointment_id: appointmentId ? Number(appointmentId) : null,
      initial_message: initialMessage ? String(initialMessage).trim().slice(0, 2000) : null,
    }).lastInsertRowid;
  } catch (error) {
    if (String(error.code || "").startsWith("SQLITE_CONSTRAINT")) {
      throw ApiError.conflict("You already have a pending request for this doctor.");
    }
    throw error;
  }

  /* A locked placeholder conversation lets the patient see "waiting for
     approval" immediately, without granting any messaging ability. */
  if (doctor.user_id) {
    let conversation = db
      .prepare(
        `SELECT * FROM chat_conversations
          WHERE patient_id = ? AND doctor_id = ? AND type = 'patient_doctor'`
      )
      .get(patient.id, doctor.user_id);

    let conversationId;

    if (!conversation) {
      conversationId = insertConversation.run({
        patient_id: patient.id,
        doctor_id: doctor.user_id,
        admin_id: null,
        type: "patient_doctor",
        approval_request_id: requestId,
        status: "pending",
      }).lastInsertRowid;
    } else {
      conversationId = conversation.id;
      db.prepare(
        `UPDATE chat_conversations
            SET status = 'pending', approval_request_id = ?, updated_at = datetime('now')
          WHERE id = ?`
      ).run(requestId, conversationId);
    }

    db.prepare(`UPDATE chat_approval_requests SET conversation_id = ? WHERE id = ?`).run(
      conversationId,
      requestId
    );
  }

  notifyAdmins({
    title: "New doctor chat approval request",
    message: `New doctor chat approval request from ${patient.name} for ${doctor.name}.`,
    type: "warning",
    link: "/admin/messages",
  });

  return publicChatRequest(findRequestById.get(requestId));
}

/** GET /api/chat/doctor-requests — admin sees every request, a patient sees only their own. */
export function listDoctorRequests(user, status) {
  const where = [];
  const params = {};

  if (user.role !== "admin") {
    where.push("r.patient_id = @patientId");
    params.patientId = user.id;
  }

  if (status && status !== "all") {
    where.push("r.status = @status");
    params.status = status;
  }

  const sql = `${SELECT_REQUEST}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY r.requested_at DESC`;

  return db.prepare(sql).all(params).map(publicChatRequest);
}

/** PATCH /api/chat/doctor-requests/:id/approve — the only path that opens a doctor chat. */
export function approveDoctorRequest(admin, id) {
  const row = getDoctorRequestRow(id);

  if (row.status !== "pending") {
    throw ApiError.conflict(`This request has already been ${row.status}.`);
  }

  const doctor = db.prepare(`SELECT * FROM doctors WHERE id = ?`).get(row.doctor_id);

  if (!doctor?.user_id) {
    throw ApiError.conflict(
      "This doctor does not have a linked login account yet. Link a doctor login before approving."
    );
  }

  const conversation = db.transaction(() => {
    db.prepare(
      `UPDATE chat_approval_requests
          SET status = 'approved', reviewed_at = datetime('now'), reviewed_by = ?
        WHERE id = ?`
    ).run(admin.id, row.id);

    let conv = db
      .prepare(
        `SELECT * FROM chat_conversations
          WHERE patient_id = ? AND doctor_id = ? AND type = 'patient_doctor'`
      )
      .get(row.patient_id, doctor.user_id);

    let conversationId;

    if (!conv) {
      conversationId = insertConversation.run({
        patient_id: row.patient_id,
        doctor_id: doctor.user_id,
        admin_id: admin.id,
        type: "patient_doctor",
        approval_request_id: row.id,
        status: "active",
      }).lastInsertRowid;
    } else {
      conversationId = conv.id;
      db.prepare(
        `UPDATE chat_conversations
            SET status = 'active', admin_id = ?, approval_request_id = ?, updated_at = datetime('now')
          WHERE id = ?`
      ).run(admin.id, row.id, conversationId);
    }

    db.prepare(`UPDATE chat_approval_requests SET conversation_id = ? WHERE id = ?`).run(
      conversationId,
      row.id
    );

    if (row.initial_message) {
      insertMessage.run({
        conversation_id: conversationId,
        sender_id: row.patient_id,
        sender_role: "user",
        message: row.initial_message,
        message_type: "text",
        attachment_url: null,
        attachment_name: null,
        attachment_mime: null,
        attachment_size: null,
        attachment_duration: null,
      });
    }

    return findConversationById.get(conversationId);
  })();

  notify(row.patient_id, {
    title: "Doctor chat approved",
    message: `Your chat request with ${doctor.name} has been approved.`,
    type: "success",
    link: "/messages",
  });

  notify(doctor.user_id, {
    title: "New approved patient chat",
    message: `Admin approved a chat request from ${row.patient_name || "a patient"}.`,
    type: "success",
    link: "/doctor/messages",
  });

  const recipients = [row.patient_id, doctor.user_id];
  emitToUsers(recipients, "chat:request-updated", { requestId: row.id, status: "approved" });
  emitToUsers(
    recipients,
    "chat:conversation-updated",
    publicConversation({ ...conversation, unread_count: 0 })
  );

  return publicChatRequest(findRequestById.get(row.id));
}

export function rejectDoctorRequest(admin, id, rejectionReason) {
  const row = getDoctorRequestRow(id);

  if (row.status !== "pending") {
    throw ApiError.conflict(`This request has already been ${row.status}.`);
  }

  const cleanReason = rejectionReason ? String(rejectionReason).trim().slice(0, 300) : null;

  db.prepare(
    `UPDATE chat_approval_requests
        SET status = 'rejected', reviewed_at = datetime('now'), reviewed_by = ?, rejection_reason = ?
      WHERE id = ?`
  ).run(admin.id, cleanReason, row.id);

  if (row.conversation_id) {
    db.prepare(
      `UPDATE chat_conversations SET status = 'locked', updated_at = datetime('now') WHERE id = ?`
    ).run(row.conversation_id);
  }

  notify(row.patient_id, {
    title: "Doctor chat request not approved",
    message:
      `Your chat request with ${row.doctor_name} was not approved by the administrator.` +
      (cleanReason ? ` Reason: "${cleanReason}"` : ""),
    type: "warning",
    link: "/messages",
  });

  emitToUser(row.patient_id, "chat:request-updated", { requestId: row.id, status: "rejected" });

  if (row.conversation_id) {
    emitToUser(
      row.patient_id,
      "chat:conversation-updated",
      publicConversation(findConversationById.get(row.conversation_id))
    );
  }

  return publicChatRequest(findRequestById.get(row.id));
}

export function revokeDoctorRequest(admin, id) {
  const row = getDoctorRequestRow(id);

  if (row.status !== "approved") {
    throw ApiError.conflict("Only an approved request can be revoked.");
  }

  db.prepare(
    `UPDATE chat_approval_requests
        SET status = 'revoked', reviewed_at = datetime('now'), reviewed_by = ?
      WHERE id = ?`
  ).run(admin.id, row.id);

  if (row.conversation_id) {
    db.prepare(
      `UPDATE chat_conversations SET status = 'revoked', updated_at = datetime('now') WHERE id = ?`
    ).run(row.conversation_id);
  }

  const doctor = db.prepare(`SELECT * FROM doctors WHERE id = ?`).get(row.doctor_id);

  notify(row.patient_id, {
    title: "Doctor communication disabled",
    message: `Your communication with ${row.doctor_name} has been disabled by the administrator.`,
    type: "warning",
    link: "/messages",
  });

  if (doctor?.user_id) {
    notify(doctor.user_id, {
      title: "Patient chat access revoked",
      message: `Admin revoked chat access with ${row.patient_name || "a patient"}.`,
      type: "warning",
      link: "/doctor/messages",
    });
  }

  const recipients = [row.patient_id, doctor?.user_id].filter(Boolean);
  emitToUsers(recipients, "chat:request-updated", { requestId: row.id, status: "revoked" });

  if (row.conversation_id) {
    emitToUsers(
      recipients,
      "chat:conversation-updated",
      publicConversation(findConversationById.get(row.conversation_id))
    );
  }

  return publicChatRequest(findRequestById.get(row.id));
}

/* ==================================================================
   MESSAGES
================================================================== */

export function listMessages(conversationId, user, { page = 1, limit = 50 } = {}) {
  const row = getConversationRow(conversationId);
  requireParticipant(row, user);

  const take = Math.min(Number(limit) || 50, 100);
  const currentPage = Math.max(Number(page) || 1, 1);
  const skip = (currentPage - 1) * take;

  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM chat_messages WHERE conversation_id = ?`)
    .get(row.id).n;

  const rows = db
    .prepare(
      `${SELECT_MESSAGE} WHERE m.conversation_id = ? ORDER BY m.id DESC LIMIT ? OFFSET ?`
    )
    .all(row.id, take, skip);

  /* Opening the thread marks the other side's messages read. */
  const changed = db
    .prepare(
      `UPDATE chat_messages
          SET is_read = 1, updated_at = datetime('now')
        WHERE conversation_id = ? AND sender_id != ? AND is_read = 0`
    )
    .run(row.id, user.id).changes;

  if (changed > 0) {
    emitToUsers(conversationRecipients(row), "chat:read", {
      conversationId: row.id,
      readerId: user.id,
    });
  }

  return {
    conversation: publicConversation(
      { ...row, unread_count: 0, online: counterpartOnline(row, user.id) },
      user.id
    ),
    items: rows.reverse().map(publicChatMessage),
    total,
    page: currentPage,
    limit: take,
  };
}

/**
 * POST /api/chat/conversations/:id/messages
 *
 * The full server-side chain: authenticate (route middleware) -> load
 * the conversation from the database -> verify participation -> verify
 * status/approval -> save -> notify -> return. A pending, locked or
 * revoked conversation never reaches the INSERT.
 */
export function sendMessage(
  user,
  conversationId,
  {
    message,
    messageType = "text",
    attachmentUrl = null,
    attachmentName = null,
    attachmentMime = null,
    attachmentSize = null,
    attachmentDuration = null,
  }
) {
  const row = getConversationRow(conversationId);
  assertSendable(row, user);

  const cleanMessage = String(message || "").trim();

  if (!cleanMessage && !attachmentUrl) {
    throw ApiError.validation({ message: "Type a message before sending." });
  }
  if (cleanMessage.length > 4000) {
    throw ApiError.validation({ message: "Message is too long (4000 characters max)." });
  }

  const result = insertMessage.run({
    conversation_id: row.id,
    sender_id: user.id,
    sender_role: user.role,
    message: cleanMessage,
    message_type: messageType,
    attachment_url: attachmentUrl || null,
    attachment_name: attachmentName || null,
    attachment_mime: attachmentMime || null,
    attachment_size: attachmentSize ? Number(attachmentSize) : null,
    attachment_duration: attachmentDuration ? Number(attachmentDuration) : null,
  });

  db.prepare(`UPDATE chat_conversations SET updated_at = datetime('now') WHERE id = ?`).run(row.id);

  const created = db.prepare(`${SELECT_MESSAGE} WHERE m.id = ?`).get(result.lastInsertRowid);
  const publicMessage = publicChatMessage(created);

  const recipients = conversationRecipients(row).filter((id) => id !== user.id);

  for (const recipientId of recipients) {
    const recipient = db.prepare(`SELECT role FROM users WHERE id = ?`).get(recipientId);
    const link =
      recipient?.role === "admin"
        ? "/admin/messages"
        : recipient?.role === "doctor"
        ? "/doctor/messages"
        : "/messages";

    notify(recipientId, {
      title: user.role === "user" ? `New message from ${user.name}` : "New message",
      message:
        cleanMessage.slice(0, 140) ||
        (messageType === "audio"
          ? "Sent a voice message."
          : messageType === "image"
          ? "Sent a photo."
          : "Sent an attachment."),
      type: "info",
      link,
    });
  }

  const updatedRow = getConversationRow(row.id);
  emitToUsers(conversationRecipients(row), "chat:message", {
    conversationId: row.id,
    message: publicMessage,
  });
  emitToUsers(conversationRecipients(row), "chat:conversation-updated", publicConversation(updatedRow));

  return publicMessage;
}

/**
 * The row behind an attachment, once the caller has been proved to be
 * a participant in its conversation. Chat attachments are never served
 * from a static directory — a medical conversation's files must not be
 * reachable by anyone who guesses the stored filename.
 */
export function getAttachment(user, messageId) {
  const msg = db.prepare(`SELECT * FROM chat_messages WHERE id = ?`).get(Number(messageId));
  if (!msg) throw ApiError.notFound("Message not found.");

  const row = getConversationRow(msg.conversation_id);
  requireParticipant(row, user);

  if (!msg.attachment_url) {
    throw ApiError.notFound("This message has no attachment.");
  }

  return {
    storedName: msg.attachment_url,
    fileName: msg.attachment_name || msg.attachment_url,
    mimeType: msg.attachment_mime || "application/octet-stream",
    messageType: msg.message_type,
  };
}

export function markMessageRead(user, messageId) {
  const msg = db.prepare(`SELECT * FROM chat_messages WHERE id = ?`).get(Number(messageId));
  if (!msg) throw ApiError.notFound("Message not found.");

  const row = getConversationRow(msg.conversation_id);
  requireParticipant(row, user);

  if (msg.sender_id !== user.id && !msg.is_read) {
    db.prepare(
      `UPDATE chat_messages SET is_read = 1, updated_at = datetime('now') WHERE id = ?`
    ).run(msg.id);

    emitToUsers(conversationRecipients(row), "chat:read", {
      conversationId: row.id,
      messageId: msg.id,
      readerId: user.id,
    });
  }

  const updated = db.prepare(`${SELECT_MESSAGE} WHERE m.id = ?`).get(msg.id);
  return publicChatMessage(updated);
}

export function totalUnreadForUser(user) {
  const conversations = listConversations(user);
  return conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
}
