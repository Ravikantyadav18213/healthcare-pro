import asyncHandler from "../utils/asyncHandler.js";
import audit from "../utils/audit.js";
import { validate, rules } from "../validators/index.js";
import * as contact from "../services/contactService.js";

/* ==================================================================
   CONTACT US
================================================================== */

export const submit = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    name: rules.string({ min: 2, max: 100, label: "Name" }),
    email: rules.email,
    message: rules.string({ min: 10, max: 4000, label: "Message" }),
  });

  const { name, email, message } = req.body;

  const { message: created, emailed } = await contact.submitContactMessage({
    name: name.trim(),
    email: email.trim(),
    message: message.trim(),
    ip: req.ip,
  });

  audit(req, "contact_message_submitted", {
    entity: "contact_message",
    entityId: created.id,
    details: `${created.name} <${created.email}>${emailed ? "" : " (email delivery failed)"}`,
  });

  res.status(201).json({ success: true, emailed });
});

export const list = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    messages: contact.listContactMessages({ status: req.query.status || "" }),
    stats: contact.contactMessageStats(),
  });
});

export const markRead = asyncHandler(async (req, res) => {
  const updated = contact.markContactMessageRead(req.params.id);

  audit(req, "contact_message_read", {
    entity: "contact_message",
    entityId: updated.id,
  });

  res.json({ success: true, message: updated });
});

export const remove = asyncHandler(async (req, res) => {
  const deleted = contact.deleteContactMessage(req.params.id);

  audit(req, "contact_message_deleted", {
    entity: "contact_message",
    entityId: deleted.id,
    details: `${deleted.name} <${deleted.email}>`,
  });

  res.json({ success: true });
});

export const reply = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    message: rules.string({ min: 2, max: 4000, label: "Reply" }),
  });

  const updated = await contact.replyToContactMessage(req.params.id, req.body.message.trim());

  audit(req, "contact_message_replied", {
    entity: "contact_message",
    entityId: updated.id,
    details: `Replied to ${updated.name} <${updated.email}>.`,
  });

  res.json({ success: true, message: updated });
});
