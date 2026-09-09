import { config } from "../config/env.js";

/* ==================================================================
   OUTGOING WHATSAPP

   Mirrors utils/mailer.js deliberately: same { sent, reason } result
   shape, same "never throw" contract. A reminder that cannot reach
   WhatsApp must still go out over email, so every failure here is
   reported rather than raised.

   Both supported providers speak plain HTTPS, so there is no SDK to
   install — global fetch is enough.
================================================================== */

const provider = config.whatsappProvider;

export const whatsappConfigured =
  provider === "twilio"
    ? Boolean(
        config.twilioAccountSid &&
          config.twilioAuthToken &&
          config.twilioWhatsappFrom
      )
    : provider === "meta"
    ? Boolean(config.metaWhatsappToken && config.metaWhatsappPhoneId)
    : false;

export const whatsappTarget = whatsappConfigured
  ? provider === "twilio"
    ? `Twilio (${config.twilioWhatsappFrom})`
    : `Meta Cloud API (phone id ${config.metaWhatsappPhoneId})`
  : "not configured";

/**
 * Normalise a stored phone number to E.164 digits.
 *
 * Patient numbers are typed by humans: "+91 90210 23697", "9021023697",
 * "091-9021023697" all mean the same thing. WhatsApp accepts none of
 * those — it wants digits with a country code and nothing else.
 *
 * Returns null when there is nothing usable, so the caller can skip
 * the send rather than hand the API something it will reject.
 */
export function toE164(raw) {
  if (!raw) return null;

  const trimmed = String(raw).trim();
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  /* "+" or a "00" prefix both mean the number already names its own
     country. Treating those two cases the same as a domestic "0" is
     what used to turn a foreign number into an Indian one. */
  const carriesCountryCode = trimmed.startsWith("+") || digits.startsWith("00");

  if (digits.startsWith("00")) digits = digits.slice(2);

  if (carriesCountryCode) {
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }

  /* A single leading 0 is the domestic trunk prefix — not part of
     E.164, and what remains is a national number. */
  digits = digits.replace(/^0/, "");

  /*
   * Only a well-formed national number may borrow the default country
   * code. The guard runs BEFORE the prepend, not after: an 11-digit
   * typo used to sail through untouched, and any bare 10-digit number
   * — including a US one like (415) 523-8886 — used to be rewritten
   * into a different, real Indian subscriber. For a hospital that is a
   * message about someone's appointment delivered to a stranger.
   */
  if (digits.length === 10) {
    /* WhatsApp only ever reaches mobiles, and Indian mobiles start
       6-9. Refusing the rest costs nothing real — a landline could not
       have received the message anyway — and it is what stops a bare
       US number like (415) 523-8886 from being read as Indian. */
    if (config.defaultCountryCode === "91" && !/^[6-9]/.test(digits)) {
      return null;
    }

    return `${config.defaultCountryCode}${digits}`;
  }

  /*
   * Longer than a national number and with no "+" to say so. Trust it
   * only when it actually begins with the country code we default to;
   * otherwise it is ambiguous, and guessing is how "90210236971" (a
   * mistyped Indian number) becomes a Turkish one.
   */
  if (
    digits.length >= 11 &&
    digits.length <= 15 &&
    digits.startsWith(config.defaultCountryCode)
  ) {
    return digits;
  }

  return null;
}

async function sendViaTwilio(to, body) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`;

  const auth = Buffer.from(
    `${config.twilioAccountSid}:${config.twilioAuthToken}`
  ).toString("base64");

  /* Twilio routes by the scheme on the number. Without the prefix the
     same digits are an SMS sender, so a From set as "+14155238886"
     silently leaves the WhatsApp channel rather than failing loudly. */
  const from = config.twilioWhatsappFrom.startsWith("whatsapp:")
    ? config.twilioWhatsappFrom
    : `whatsapp:${config.twilioWhatsappFrom}`;

  const form = new URLSearchParams({
    From: from,
    To: `whatsapp:+${to}`,
    Body: body,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    /* Two failures worth naming, because Twilio's own wording does not
       say what to do about them and both are the normal case here. */
    if (data.code === 63016) {
      return {
        sent: false,
        reason:
          "Outside the 24h customer service window — WhatsApp only accepts an approved template here, not free-form text (Twilio 63016).",
      };
    }

    if (data.code === 63015 || data.code === 63007) {
      return {
        sent: false,
        reason:
          "That number has not joined the WhatsApp sandbox (or its 3-day join has expired). Send the join code to +1 415 523 8886 from that phone and retry.",
      };
    }

    return {
      sent: false,
      reason: data.message || `Twilio responded ${response.status}`,
    };
  }

  return { sent: true, messageId: data.sid || null };
}

async function sendViaMeta(to, body) {
  const url = `https://graph.facebook.com/v21.0/${config.metaWhatsappPhoneId}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.metaWhatsappToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body },
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      sent: false,
      reason:
        data?.error?.message || `Meta Cloud API responded ${response.status}`,
    };
  }

  return { sent: true, messageId: data?.messages?.[0]?.id || null };
}

/**
 * Send one WhatsApp text message.
 *
 * Resolves to { sent: false, reason } rather than throwing when the
 * provider is unconfigured, the number is unusable, or the API
 * refuses — reminders are best-effort by design.
 */
export async function sendWhatsApp({ to, body }) {
  if (!whatsappConfigured) {
    return {
      sent: false,
      reason:
        "WhatsApp is not configured (set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / " +
        "TWILIO_WHATSAPP_FROM, or WHATSAPP_PROVIDER=meta with META_WHATSAPP_TOKEN / " +
        "META_WHATSAPP_PHONE_ID).",
    };
  }

  const number = toE164(to);

  if (!number) {
    return { sent: false, reason: `No usable phone number ("${to || ""}").` };
  }

  try {
    const result =
      provider === "meta"
        ? await sendViaMeta(number, body)
        : await sendViaTwilio(number, body);

    if (result.sent) {
      console.log(`[whatsapp] sent to +${number}`);
    } else {
      console.error(`[whatsapp] send to +${number} failed: ${result.reason}`);
    }

    return result;
  } catch (error) {
    const reason = error?.message || String(error);
    console.error(`[whatsapp] send to +${number} failed: ${reason}`);
    return { sent: false, reason };
  }
}

export default sendWhatsApp;
