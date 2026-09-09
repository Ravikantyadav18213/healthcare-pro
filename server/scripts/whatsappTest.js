/*
 * Sends one real WhatsApp message so the configuration can be checked
 * without waiting for an appointment reminder to come due.
 *
 *   npm run whatsapp:test -- 9021023697
 *
 * The number may be written any way a human would write it — the same
 * normalisation the reminder sweep uses is applied here, and the
 * result is printed, so a wrong country code shows up as a wrong
 * number rather than as a silent non-delivery.
 */

import { config } from "../config/env.js";
import {
  whatsappConfigured,
  whatsappTarget,
  toE164,
  sendWhatsApp,
} from "../utils/whatsapp.js";

/* Wrapped in a function so the early checks can stop with a plain
   return. Calling process.exit() after the send would tear the event
   loop down while the HTTPS socket is still closing, which makes
   libuv assert on Windows. */
async function main() {
  const raw = process.argv[2];

  if (!whatsappConfigured) {
    console.error("\n  WhatsApp is not configured.\n");

    if (config.whatsappProvider === "meta") {
      console.error("  Provider is set to meta. Set these in .env:");
      console.error("    META_WHATSAPP_TOKEN=<permanent access token>");
      console.error("    META_WHATSAPP_PHONE_ID=<phone number id>");
    } else {
      console.error("  Provider is twilio (the default). Set these in .env:");
      console.error("    TWILIO_ACCOUNT_SID=<starts with AC>");
      console.error("    TWILIO_AUTH_TOKEN=<from the Twilio console>");
      console.error("    TWILIO_WHATSAPP_FROM=whatsapp:+14155238886");
      console.error("");
      console.error("  The sandbox number above is shared by every Twilio");
      console.error("  account. Each recipient must first message it once with");
      console.error("  the join code shown in your console, or Twilio will");
      console.error("  accept the request and never deliver the message.");
    }

    console.error("\n  Reminders still go out over email until this is set.\n");
    return 1;
  }

  if (!raw) {
    console.error("\n  Which number should this go to?\n");
    console.error("    npm run whatsapp:test -- 9021023697\n");
    return 1;
  }

  const to = toE164(raw);

  if (!to) {
    console.error(`\n  "${raw}" is not a usable phone number.\n`);
    return 1;
  }

  console.log(`\n  Provider  ${whatsappTarget}`);
  console.log(`  Typed     ${raw}`);
  console.log(`  Sending   +${to}`);

  /* A 10-digit number silently became +91… — worth saying out loud,
     since a wrong DEFAULT_COUNTRY_CODE is otherwise invisible until
     nothing arrives. */
  const digits = String(raw).replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length === 10) {
    console.log(`  (country code ${config.defaultCountryCode} was added)`);
  }

  console.log("");

  const result = await sendWhatsApp({
    to,
    body:
      "HealthCare Pro test message. If you are reading this, WhatsApp reminders are working.",
  });

  if (!result.sent) {
    console.error(`  FAILED\n    ${result.reason}\n`);

    if (/63007|not.*sandbox|not been enabled|opt/i.test(result.reason || "")) {
      console.error("  That usually means this number has not joined the sandbox.");
      console.error("  Send the join code from your Twilio console to");
      console.error("  +1 415 523 8886 on WhatsApp from that phone, then retry.\n");
    }

    return 1;
  }

  console.log("  Sent. Check WhatsApp on that phone.\n");
  return 0;
}

process.exitCode = await main();
