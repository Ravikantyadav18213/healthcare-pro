import React, { useCallback, useEffect, useState } from "react";
import { FiCreditCard, FiCheckCircle } from "react-icons/fi";

import { paymentService } from "../services/clinicalService.js";
import { useToast } from "../context/ToastContext.jsx";
import { Spinner } from "./ui/States.jsx";

/* ==================================================================
   PAY AN INVOICE (Razorpay checkout)

   The browser never names the amount — it asks the server for an
   order, opens Razorpay with that order id, and hands the signed
   result straight back for verification. A payment is only real once
   the server has checked the signature.

   Razorpay's checkout script is loaded on demand: most visitors never
   pay anything, and every one of them would otherwise carry it.
================================================================== */

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckout() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);

  if (window.__razorpayLoading) return window.__razorpayLoading;

  window.__razorpayLoading = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    const script = existing || document.createElement("script");

    script.src = SCRIPT_SRC;
    script.async = true;

    script.onload = () =>
      window.Razorpay
        ? resolve(window.Razorpay)
        : reject(new Error("Payment checkout loaded but did not initialise."));

    script.onerror = () =>
      reject(new Error("Could not reach the payment gateway. Check your connection."));

    if (!existing) document.body.appendChild(script);
  });

  return window.__razorpayLoading;
}

/**
 * Cached once per page: whether the server has gateway keys at all.
 *
 * Without this every invoice row would ask the same question, and a
 * hospital that never configured payments would still see a Pay
 * button that cannot work.
 */
let statusPromise = null;

function usePaymentsEnabled() {
  const [enabled, setEnabled] = useState(null);

  useEffect(() => {
    let cancelled = false;

    if (!statusPromise) statusPromise = paymentService.status().catch(() => ({ enabled: false }));

    statusPromise.then((data) => {
      if (!cancelled) setEnabled(Boolean(data?.enabled));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
}

export default function PayInvoiceButton({ invoice, onPaid, className = "" }) {
  const toast = useToast();
  const enabled = usePaymentsEnabled();

  const [busy, setBusy] = useState(false);

  const paid = invoice.status === "Paid";
  const payable = invoice.status === "Pending" && Number(invoice.total) > 0;

  const pay = useCallback(async () => {
    setBusy(true);

    try {
      const { order } = await paymentService.createOrder(invoice.id);
      const Razorpay = await loadCheckout();

      const checkout = new Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "HealthCare Pro",
        description: `Invoice ${order.invoice.invoiceNo}`,
        order_id: order.orderId,
        prefill: order.prefill,
        theme: { color: "#1d4ed8" },

        handler: async (response) => {
          try {
            await paymentService.verify(invoice.id, {
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });

            toast.success("Payment received. Thank you.");
            onPaid?.();
          } catch (caught) {
            /* Money may well have left the payer's account here — the
               failure is in confirming it, so say so plainly rather
               than implying the payment did not happen. */
            toast.error(
              caught.message ||
                "The payment went through but could not be confirmed. Contact the hospital with your payment id."
            );
          } finally {
            setBusy(false);
          }
        },

        modal: {
          ondismiss: () => setBusy(false),
        },
      });

      checkout.on("payment.failed", (event) => {
        toast.error(event?.error?.description || "The payment was declined.");
        setBusy(false);
      });

      checkout.open();
    } catch (caught) {
      toast.error(caught.message || "Could not start the payment.");
      setBusy(false);
    }
  }, [invoice.id, onPaid, toast]);

  if (paid) {
    return (
      <span
        className={`badge bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 inline-flex items-center gap-1.5 ${className}`}
      >
        <FiCheckCircle size={11} />
        Paid
      </span>
    );
  }

  /* Still checking, not configured, or nothing to pay. */
  if (!enabled || !payable) return null;

  return (
    <button
      type="button"
      onClick={pay}
      disabled={busy}
      className={`btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-60 ${className}`}
    >
      {busy ? <Spinner size={12} /> : <FiCreditCard size={13} />}
      {busy ? "Opening..." : `Pay ₹${Number(invoice.total).toLocaleString("en-IN")}`}
    </button>
  );
}
