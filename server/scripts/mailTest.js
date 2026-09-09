/*
 * Sends one real test email so the mail configuration can be checked
 * without going through the whole forgot-password flow.
 *
 *   npm run mail:test -- you@example.com
 *
 * With no address given it emails MAIL_USER (the sending account
 * itself), which is the quickest way to prove delivery works.
 */

import { config } from "../config/env.js";
import {
  mailerConfigured,
  mailerTarget,
  verifyMailer,
  sendMail,
  otpEmail,
} from "../utils/mailer.js";

const to = process.argv[2] || config.mailUser;

if (!mailerConfigured) {
  console.error("\n  Outgoing mail is not configured.\n");
  console.error("  Set these in .env, then run this again:");
  console.error("    MAIL_USER=<the Gmail address that sends>");
  console.error("    MAIL_PASS=<16-character App Password>");
  console.error("\n  App Password: https://myaccount.google.com/apppasswords");
  console.error("  (2-Step Verification must be turned on for that account first.)\n");
  process.exit(1);
}

console.log(`\n  Account   ${mailerTarget}`);
console.log(`  From      ${config.mailFrom}`);
console.log(`  To        ${to}\n`);

const check = await verifyMailer();

if (!check.ok) {
  console.error(`  Login to the mail server FAILED:\n    ${check.reason}\n`);
  process.exit(1);
}

console.log("  Credentials accepted. Sending test message...");

const { text, html } = otpEmail("123456", 10);

const result = await sendMail({
  to,
  subject: "HealthCare Pro — mail configuration test",
  text: `This is a test email. ${text}`,
  html,
});

if (result.sent) {
  console.log(`\n  Sent. Check the inbox for ${to} (look in Spam too).\n`);
  process.exit(0);
}

console.error(`\n  Send FAILED:\n    ${result.reason}\n`);
process.exit(1);
