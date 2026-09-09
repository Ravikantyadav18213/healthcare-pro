import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* Project root = healthcare-pro/ */
export const ROOT = path.resolve(__dirname, "..", "..");

dotenv.config({ path: path.join(ROOT, ".env") });

const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

const DEV_SECRET = "dev-only-insecure-secret-change-me";

export const config = {
  root: ROOT,

  port: Number(process.env.PORT || 5000),
  nodeEnv: process.env.NODE_ENV || "development",
  isProd: (process.env.NODE_ENV || "development") === "production",

  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",

  /* ------------------------------------------------------------------
     AUTH
     authMode "cookie" -> HttpOnly cookies (recommended, default)
     authMode "token"  -> access token also returned in the JSON body
                          for environments where cookies are awkward.
     Passwords are never returned in either mode.
  ------------------------------------------------------------------ */
  authMode: (process.env.AUTH_MODE || "cookie").toLowerCase(),

  jwtSecret: process.env.JWT_SECRET || DEV_SECRET,
  jwtRefreshSecret:
    process.env.JWT_REFRESH_SECRET ||
    `${process.env.JWT_SECRET || DEV_SECRET}::refresh`,

  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || "20m",
  refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS || 7),

  /* Defaults to false for local http development, but production is
     never allowed to send session cookies over plain http — forgetting
     COOKIE_SECURE=true would otherwise leak both cookies to any
     passive observer on the network. */
  cookieSecure: bool(
    process.env.COOKIE_SECURE,
    (process.env.NODE_ENV || "development") === "production"
  ),
  cookieSameSite: process.env.COOKIE_SAMESITE || "lax",

  /* ------------------------------------------------------------------
     DATABASE / STORAGE
  ------------------------------------------------------------------ */
  dbFile:
    process.env.DB_FILE ||
    path.join(ROOT, "server", "data", "healthcare.db"),

  uploadDir:
    process.env.UPLOAD_DIR || path.join(ROOT, "server", "uploads"),

  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024),

  /* ------------------------------------------------------------------
     SEEDED ADMINISTRATOR
     Only the bcrypt hash is stored. The plain value never leaves
     the server and is never sent to the browser.
  ------------------------------------------------------------------ */
  adminEmail: (
    process.env.ADMIN_EMAIL || "admin@healthcarepro.io"
  ).toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || "admin123",
  adminName: process.env.ADMIN_NAME || "System Administrator",

  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 10),

  /* ------------------------------------------------------------------
     GOOGLE SIGN-IN
     Unset by default. The /auth/google endpoint checks this itself and
     answers 400 rather than crashing, so the rest of the app works
     with no Google project configured at all.
  ------------------------------------------------------------------ */
  googleClientId: process.env.GOOGLE_CLIENT_ID || null,

  /* ------------------------------------------------------------------
     OUTGOING MAIL (password reset OTPs)
     Unset by default. mailer.js checks mailUser/mailPass itself and
     falls back to handing the OTP straight back in the API response
     in development, so the reset flow still works with no mail
     account configured.

     Gmail requires an "App Password" here, not the account's normal
     login password — Google blocks plain-password SMTP auth outright.
     Generate one at https://myaccount.google.com/apppasswords (needs
     2-Step Verification turned on first).
  ------------------------------------------------------------------ */
  mailUser: process.env.MAIL_USER || null,
  mailPass: (process.env.MAIL_PASS || "").replace(/\s+/g, "") || null,
  mailFrom:
    process.env.MAIL_FROM ||
    (process.env.MAIL_USER ? `HealthCare Pro <${process.env.MAIL_USER}>` : null),

  /* Optional. With MAIL_HOST unset the mailer uses Gmail's own
     settings, which is what MAIL_USER above is written for. Set these
     three to send through any other SMTP provider instead. */
  mailHost: process.env.MAIL_HOST || null,
  mailPort: Number(process.env.MAIL_PORT) || 587,
  mailSecure: bool(process.env.MAIL_SECURE, false),

  /* ------------------------------------------------------------------
     DEV-ONLY OTP ECHO
     When mail cannot send, /auth/forgot-password can hand the reset
     code back in the response so the flow stays testable locally.
     That is an account-takeover primitive on a public endpoint, so it
     now requires an EXPLICIT opt-in rather than merely "NODE_ENV is
     not production" — a deployment that forgets to set NODE_ENV must
     not start giving out reset codes to anonymous callers.
  ------------------------------------------------------------------ */
  allowDevOtp:
    bool(process.env.ALLOW_DEV_OTP, false) &&
    (process.env.NODE_ENV || "development") !== "production",

  /* ------------------------------------------------------------------
     OUTGOING WHATSAPP (appointment reminders)

     Two providers are supported and both are optional — with neither
     configured, whatsapp.js reports { sent: false } and reminders
     simply go out over email alone.

       twilio : TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN +
                TWILIO_WHATSAPP_FROM (e.g. "whatsapp:+14155238886")
       meta   : META_WHATSAPP_TOKEN + META_WHATSAPP_PHONE_ID
  ------------------------------------------------------------------ */
  whatsappProvider: (process.env.WHATSAPP_PROVIDER || "twilio").toLowerCase(),

  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || null,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || null,
  twilioWhatsappFrom: process.env.TWILIO_WHATSAPP_FROM || null,

  metaWhatsappToken: process.env.META_WHATSAPP_TOKEN || null,
  metaWhatsappPhoneId: process.env.META_WHATSAPP_PHONE_ID || null,

  /* Default country code for patient numbers stored without one. */
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || "91",

  /* ------------------------------------------------------------------
     APPOINTMENT REMINDERS

     The sweep runs on an interval and sends each patient one reminder
     per configured lead time. Set REMINDER_ENABLED=false to turn the
     whole thing off without removing the configuration.
  ------------------------------------------------------------------ */
  reminderEnabled: bool(process.env.REMINDER_ENABLED, true),
  reminderSweepMinutes: Number(process.env.REMINDER_SWEEP_MINUTES) || 15,

  /* Hours before the appointment to remind at. "24,2" => a day ahead
     and again two hours ahead. */
  reminderLeadHours: (process.env.REMINDER_LEAD_HOURS || "24,2")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0),

  /* Pharmacy stock at or below this many units triggers the daily
     low-stock digest to administrators. */
  lowStockThreshold: Number(process.env.LOW_STOCK_THRESHOLD) || 50,
  lowStockAlertEnabled: bool(process.env.LOW_STOCK_ALERT_ENABLED, true),

  /* ------------------------------------------------------------------
     TWO-FACTOR LOGIN (email OTP)
     Users opt in individually from their profile; this only controls
     whether the feature is offered at all.
  ------------------------------------------------------------------ */
  twoFactorEnabled: bool(process.env.TWO_FACTOR_ENABLED, true),
  twoFactorMinutes: Number(process.env.TWO_FACTOR_MINUTES) || 10,

  /* ------------------------------------------------------------------
     VIDEO CONSULTATION
     Jitsi Meet needs no account: a room name is enough. Point this at
     a self-hosted Jitsi instead of the public server if you have one.
  ------------------------------------------------------------------ */
  jitsiDomain: process.env.JITSI_DOMAIN || "meet.jit.si",

  /* ------------------------------------------------------------------
     PAYMENTS (Razorpay)

     Optional. With no keys configured the pay-online button is simply
     not offered and invoices stay a manual, front-desk process.

     Get the pair from https://dashboard.razorpay.com → Settings → API
     Keys. Test keys start with "rzp_test_"; nothing here distinguishes
     them from live keys, so double-check which pair is deployed.
  ------------------------------------------------------------------ */
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || null,
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || null,

  /* Where links inside emails should point. */
  appUrl: process.env.APP_URL || "http://localhost:5173",
};

if (config.isProd && config.jwtSecret === DEV_SECRET) {
  throw new Error(
    "JWT_SECRET must be set to a strong random value in production."
  );
}
