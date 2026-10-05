import crypto from "node:crypto";

import db from "../db.js";
import ApiError from "../utils/ApiError.js";
import { config } from "../config/env.js";
import { notify, notifyAdmins } from "../utils/notify.js";
import { emitToAdmins } from "../utils/realtime.js";

/* ==================================================================
   ONLINE PAYMENTS (Razorpay)

   Razorpay's REST API is plain HTTPS with basic auth, so there is no
   SDK to install.

   The flow, and why each step exists:

     1. createOrder  — the server decides the amount, never the
                       browser. A client that could name its own
                       price would be a client that pays ₹1 for a
                       ₹9,000 invoice.
     2. checkout     — the browser opens Razorpay with that order id.
     3. verify       — Razorpay hands the browser a signature; the
                       server recomputes it with the key secret. Only
                       a signature that matches marks the invoice
                       paid, because everything the browser reports is
                       otherwise forgeable.
================================================================== */

export const paymentsConfigured = Boolean(
  config.razorpayKeyId && config.razorpayKeySecret
);

const RAZORPAY_API = "https://api.razorpay.com/v1";

function authHeader() {
  const pair = `${config.razorpayKeyId}:${config.razorpayKeySecret}`;
  return `Basic ${Buffer.from(pair).toString("base64")}`;
}

const findInvoice = db.prepare(`
  SELECT
    b.id, b.invoice_no AS invoiceNo, b.total, b.status,
    b.user_id AS userId, b.patient_id AS patientId,
    b.patient_name AS patientName,
    b.payment_order_id AS paymentOrderId,
    b.payment_id AS paymentId,
    u.email AS userEmail, u.name AS userName, u.phone AS userPhone
  FROM billing_records b
  LEFT JOIN users u ON u.id = b.user_id
  WHERE b.id = ?
`);

const saveOrder = db.prepare(
  `UPDATE billing_records
      SET payment_order_id = ?, updated_at = datetime('now')
    WHERE id = ?`
);

const markPaid = db.prepare(`
  UPDATE billing_records
     SET status = 'Paid', payment_id = ?, paid_at = datetime('now'),
         method = COALESCE(NULLIF(method, ''), 'Online'),
         updated_at = datetime('now')
   WHERE id = ?
`);

/**
 * A patient may only pay their own invoice; staff may take payment
 * for anyone (front-desk card machine, phone payment).
 */
function assertMayPay(invoice, user) {
  if (user.role !== "user") return;

  if (!invoice.userId || Number(invoice.userId) !== Number(user.id)) {
    throw ApiError.forbidden("That invoice is not yours.");
  }
}

export async function getInvoiceOrThrow(id) {
  const invoice = await findInvoice.get(Number(id));
  if (!invoice) throw ApiError.notFound("Invoice not found.");
  return invoice;
}

/**
 * Create (or reuse) a Razorpay order for one invoice.
 *
 * Reusing an existing open order matters: a patient who closes the
 * checkout and reopens it should land on the same order rather than
 * leaving a trail of abandoned ones.
 */
export async function createOrder(invoiceId, user) {
  if (!paymentsConfigured) {
    throw ApiError.badRequest(
      "Online payments are not configured on this server (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)."
    );
  }

  const invoice = await getInvoiceOrThrow(invoiceId);
  assertMayPay(invoice, user);

  if (invoice.status === "Paid") {
    throw ApiError.conflict("That invoice is already paid.");
  }

  if (invoice.status === "Cancelled") {
    throw ApiError.conflict("That invoice was cancelled.");
  }

  const amount = Math.round(Number(invoice.total) * 100);

  if (!Number.isInteger(amount) || amount <= 0) {
    throw ApiError.badRequest("That invoice has no payable amount.");
  }

  const response = await fetch(`${RAZORPAY_API}/orders`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      /* Razorpay works in the smallest currency unit — paise. */
      amount,
      currency: "INR",
      receipt: invoice.invoiceNo,
      notes: {
        invoiceId: String(invoice.id),
        patient: invoice.patientName || "",
      },
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw ApiError.badRequest(
      data?.error?.description || `Razorpay refused the order (${response.status}).`
    );
  }

  await saveOrder.run(data.id, invoice.id);

  return {
    orderId: data.id,
    amount: data.amount,
    currency: data.currency,
    /* The key id is public by design — it identifies the merchant in
       the checkout. The secret never leaves this server. */
    keyId: config.razorpayKeyId,
    invoice: {
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      total: invoice.total,
      patientName: invoice.patientName,
    },
    prefill: {
      name: invoice.userName || invoice.patientName || "",
      email: invoice.userEmail || "",
      contact: invoice.userPhone || "",
    },
  };
}

/**
 * Confirm a payment and mark the invoice paid.
 *
 * The signature is HMAC-SHA256 of "<order_id>|<payment_id>" keyed with
 * the account secret. Recomputing it here is the whole security of
 * this endpoint: without it, any caller could POST arbitrary ids and
 * have an invoice marked paid.
 */
export async function verifyPayment({ invoiceId, orderId, paymentId, signature }, user) {
  if (!paymentsConfigured) {
    throw ApiError.badRequest("Online payments are not configured on this server.");
  }

  if (!orderId || !paymentId || !signature) {
    throw ApiError.badRequest("Incomplete payment confirmation.");
  }

  const invoice = await getInvoiceOrThrow(invoiceId);
  assertMayPay(invoice, user);

  /* The order must be the one this server created for this invoice —
     otherwise a valid signature from some other order would settle
     this one. */
  if (invoice.paymentOrderId && invoice.paymentOrderId !== orderId) {
    throw ApiError.badRequest("That payment does not belong to this invoice.");
  }

  const expected = crypto
    .createHmac("sha256", config.razorpayKeySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  const provided = Buffer.from(String(signature), "utf8");
  const computed = Buffer.from(expected, "utf8");

  /* timingSafeEqual throws on a length mismatch, which is itself a
     failed comparison. */
  const valid =
    provided.length === computed.length && crypto.timingSafeEqual(provided, computed);

  if (!valid) {
    throw ApiError.badRequest("Payment verification failed. The invoice has not been marked paid.");
  }

  /* Already settled by an earlier confirmation of the same payment —
     a double-click, or a retried request. Not an error. */
  if (invoice.status === "Paid" && invoice.paymentId === paymentId) {
    return { invoice: await getInvoiceOrThrow(invoiceId), alreadyPaid: true };
  }

  await markPaid.run(paymentId, invoice.id);

  if (invoice.userId) {
    await notify(invoice.userId, {
      title: "Payment received",
      message: `Invoice ${invoice.invoiceNo} is paid. Thank you.`,
      type: "success",
      link: "/my-billing",
    });
  }

  await notifyAdmins({
    title: "Invoice paid online",
    message: `${invoice.patientName} paid ${invoice.invoiceNo} (₹${Number(invoice.total).toLocaleString("en-IN")}).`,
    type: "success",
    link: "/billing",
  });

  /* Revenue Today and the Reports charts read live off this event —
     without it they only catch up on their next poll or manual
     refresh, which reads as the payment "not showing up yet". */
  await emitToAdmins("dashboard:stats-changed", { source: "billing" });

  return { invoice: await getInvoiceOrThrow(invoiceId), alreadyPaid: false };
}

const COUNTER_METHODS = ["Cash", "Card", "UPI"];

const markPaidAtCounter = db.prepare(`
  UPDATE billing_records
     SET status = 'Paid', method = ?, collected_by = ?,
         paid_at = datetime('now'), updated_at = datetime('now')
   WHERE id = ?
`);

/**
 * Record a payment taken in person — cash, or a card/UPI machine at
 * the counter that isn't wired into this app the way Razorpay is.
 *
 * Unlike the online flow there is no signature to check: the person
 * physically holding the money IS the verification. What this
 * function guards instead is bookkeeping — which invoice, which
 * method, and which staff member recorded it, so a "we didn't
 * actually collect that" dispute has an answer.
 */
export async function recordCounterPayment(invoiceId, method, staffUser) {
  if (!COUNTER_METHODS.includes(method)) {
    throw ApiError.badRequest(`Method must be one of: ${COUNTER_METHODS.join(", ")}.`);
  }

  const invoice = await getInvoiceOrThrow(invoiceId);

  if (invoice.status === "Paid") {
    throw ApiError.conflict("That invoice is already paid.");
  }

  if (invoice.status === "Cancelled") {
    throw ApiError.conflict("That invoice was cancelled.");
  }

  await markPaidAtCounter.run(method, staffUser.id, invoice.id);

  if (invoice.userId) {
    await notify(invoice.userId, {
      title: "Payment received",
      message: `Invoice ${invoice.invoiceNo} is paid (${method} at the hospital). Thank you.`,
      type: "success",
      link: "/my-billing",
    });
  }

  await emitToAdmins("dashboard:stats-changed", { source: "billing" });

  return getInvoiceOrThrow(invoiceId);
}

/** What the client needs to know before offering a Pay button. */
export function paymentStatus() {
  return {
    enabled: paymentsConfigured,
    provider: paymentsConfigured ? "razorpay" : null,
    keyId: paymentsConfigured ? config.razorpayKeyId : null,
  };
}

export default { createOrder, verifyPayment, paymentStatus, paymentsConfigured };
