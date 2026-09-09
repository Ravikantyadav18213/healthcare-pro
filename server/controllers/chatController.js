import fs from "node:fs";
import path from "node:path";

import asyncHandler from "../utils/asyncHandler.js";
import audit from "../utils/audit.js";
import ApiError from "../utils/ApiError.js";
import { config } from "../config/env.js";
import { chatMessageTypeFor } from "../middleware/upload.js";
import { validate, rules } from "../validators/index.js";
import * as chat from "../services/chatService.js";

/* ==================================================================
   CONVERSATIONS
================================================================== */

export const listConversations = asyncHandler(async (req, res) => {
  res.json({ success: true, items: chat.listConversations(req.user) });
});

export const getConversation = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    conversation: chat.getConversation(req.user, req.params.id),
  });
});

export const listMessages = asyncHandler(async (req, res) => {
  const result = chat.listMessages(req.params.id, req.user, {
    page: req.query.page,
    limit: req.query.limit,
  });

  res.json({ success: true, ...result });
});

/** The single enforcement point: throws 403 unless the DB says approved/active. */
export const sendMessage = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    message: rules.string({ min: 0, max: 4000, label: "Message" }),
  });

  const message = chat.sendMessage(req.user, req.params.id, {
    message: req.body?.message,
    messageType: "text",
  });

  audit(req, "message_sent", {
    entity: "chat_conversation",
    entityId: req.params.id,
    details: `Message sent in conversation #${req.params.id}.`,
  });

  res.status(201).json({ success: true, message });
});

/**
 * Runs BEFORE multer on the attachment route.
 *
 * sendMessage authorises the conversation, but by the time it runs the
 * file has already been streamed to disk — so a 403 still left a 5 MB
 * file behind, and looping the request was an unauthenticated-shaped
 * way to fill the volume the SQLite database lives on. Rejecting
 * first means nothing is written for a thread the caller cannot post
 * to. sendMessage still re-checks; this does not replace it.
 */
export const authorizeAttachment = asyncHandler(async (req, _res, next) => {
  const row = chat.getConversationRow(req.params.id);

  if (!row) {
    throw ApiError.notFound("Conversation not found.");
  }

  chat.requireParticipant(row, req.user);
  next();
});

/**
 * POST /api/chat/conversations/:id/attachments
 *
 * multipart upload -> one message carrying the stored file. The
 * conversation is authorised inside chat.sendMessage exactly as a text
 * message is, so an unapproved thread rejects the upload too.
 */
export const sendAttachment = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest("Choose a file to send.");
  }

  const messageType = chatMessageTypeFor(req.file.mimetype);

  const message = chat.sendMessage(req.user, req.params.id, {
    message: req.body?.message || "",
    messageType,
    attachmentUrl: req.file.filename,
    attachmentName: req.file.originalname,
    attachmentMime: String(req.file.mimetype || "").split(";")[0].trim(),
    attachmentSize: req.file.size,
    attachmentDuration: req.body?.duration ? Number(req.body.duration) : null,
  });

  audit(req, "message_sent", {
    entity: "chat_conversation",
    entityId: req.params.id,
    details: `${messageType} attachment sent in conversation #${req.params.id}.`,
  });

  res.status(201).json({ success: true, message });
});

/** GET /api/chat/messages/:id/attachment — participants only. */
export const downloadAttachment = asyncHandler(async (req, res) => {
  const file = chat.getAttachment(req.user, req.params.id);
  const absolute = path.join(config.uploadDir, file.storedName);

  if (!fs.existsSync(absolute)) {
    throw ApiError.notFound("That attachment is no longer stored on the server.");
  }

  res.type(file.mimeType);

  /*
   * Images and voice notes are played in place; anything else is a
   * download, so the browser never renders an uploaded document
   * inline on the API origin.
   */
  if (file.messageType === "image" || file.messageType === "audio") {
    return res.sendFile(absolute);
  }

  return res.download(absolute, file.fileName);
});

export const markMessageRead = asyncHandler(async (req, res) => {
  const message = chat.markMessageRead(req.user, req.params.id);
  res.json({ success: true, message });
});

/** POST /api/chat/admin — always allowed, never approval-gated. */
export const startAdminChat = asyncHandler(async (req, res) => {
  const conversation = chat.getOrCreateAdminConversation(req.user);

  audit(req, "conversation_created", {
    entity: "chat_conversation",
    entityId: conversation.id,
    details: `${req.user.name} opened a conversation with the administrator.`,
  });

  res.status(201).json({ success: true, conversation });
});

/* ==================================================================
   DOCTOR CHAT APPROVAL WORKFLOW
================================================================== */

export const createDoctorRequest = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    doctorId: rules.integer({ min: 1, label: "Doctor" }),
    reason: rules.string({ min: 3, max: 500, label: "Reason for contacting the doctor" }),
  });

  const request = chat.createDoctorChatRequest(req.user, {
    doctorId: req.body.doctorId,
    appointmentId: req.body.appointmentId || null,
    reason: req.body.reason,
    initialMessage: req.body.initialMessage || null,
  });

  audit(req, "doctor_chat_requested", {
    entity: "chat_approval_request",
    entityId: request.id,
    details: `${req.user.name} requested to chat with ${request.doctorName}.`,
  });

  res.status(201).json({ success: true, request });
});

export const listDoctorRequests = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    items: chat.listDoctorRequests(req.user, req.query.status || "all"),
  });
});

export const approveDoctorRequest = asyncHandler(async (req, res) => {
  const request = chat.approveDoctorRequest(req.user, req.params.id);

  audit(req, "doctor_chat_approved", {
    entity: "chat_approval_request",
    entityId: request.id,
    details: `Approved chat between ${request.patientName} and ${request.doctorName}.`,
  });

  res.json({ success: true, request });
});

export const rejectDoctorRequest = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    rejectionReason: rules.string({ min: 0, max: 300, label: "Rejection reason" }),
  });

  const request = chat.rejectDoctorRequest(req.user, req.params.id, req.body?.rejectionReason);

  audit(req, "doctor_chat_rejected", {
    entity: "chat_approval_request",
    entityId: request.id,
    details: `Rejected chat request between ${request.patientName} and ${request.doctorName}.`,
  });

  res.json({ success: true, request });
});

export const revokeDoctorRequest = asyncHandler(async (req, res) => {
  const request = chat.revokeDoctorRequest(req.user, req.params.id);

  audit(req, "doctor_chat_revoked", {
    entity: "chat_approval_request",
    entityId: request.id,
    details: `Revoked chat access between ${request.patientName} and ${request.doctorName}.`,
  });

  res.json({ success: true, request });
});
