import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { config } from "./config/env.js";
import db from "./db.js";
import runSeed from "./seed.js";
import routes from "./routes/index.js";
import { notFoundHandler, errorHandler } from "./middleware/error.js";
import { purgeOldSessions } from "./services/tokenService.js";
import { isAllowedOrigin } from "./utils/corsOrigins.js";
import { initSockets } from "./sockets/index.js";
import { mailerConfigured, mailerTarget, verifyMailer } from "./utils/mailer.js";
import { whatsappConfigured, whatsappTarget } from "./utils/whatsapp.js";
import { startReminderScheduler } from "./services/reminderService.js";

const app = express();

/* Correct client IPs behind a proxy, needed by the rate limiter. */
app.set("trust proxy", 1);
app.disable("x-powered-by");

/* ==================================================================
   CORS

   Credentials are enabled so the browser will send the HttpOnly auth
   cookies, which means the allowed origin must be explicit.

   In development any localhost port is accepted, because Vite moves
   to 5174 / 5175 / ... whenever the previous port is already taken.
   In production only CLIENT_URL (plus anything in EXTRA_ORIGINS) is
   allowed.
================================================================== */

app.use(
  cors({
    origin(origin, callback) {
      /* Same-origin requests and tools like curl send no Origin. */
      if (!origin || isAllowedOrigin(origin)) return callback(null, true);

      console.warn(`[cors] blocked origin: ${origin}`);

      /*
       * Resolve without the CORS headers rather than throwing. The
       * browser still blocks the response, but the server answers
       * cleanly instead of turning it into a 500.
       */
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

/* Minimal hardening without pulling in another dependency. */
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

if (!config.isProd) {
  app.use((req, _res, next) => {
    if (req.path !== "/api/health") {
      console.log(`${req.method} ${req.originalUrl}`);
    }
    next();
  });
}

/* ==================================================================
   ROUTES
================================================================== */

app.use("/api", routes);

app.get("/", (_req, res) => {
  res.json({
    success: true,
    service: "HealthCare Pro API",
    docs: "/api/health",
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

/* ==================================================================
   STARTUP
================================================================== */

runSeed();
purgeOldSessions();

const server = app.listen(config.port, () => {
  console.log("");
  console.log("  HealthCare Pro API");
  console.log(`  ├─ listening   http://localhost:${config.port}`);
  console.log(`  ├─ health      http://localhost:${config.port}/api/health`);
  console.log(`  ├─ database    ${config.dbFile}`);
  console.log(`  ├─ auth mode   ${config.authMode}`);
  console.log(`  ├─ realtime    socket.io`);
  console.log(`  ├─ client      ${config.clientUrl}`);
  console.log(`  ├─ mail        ${mailerConfigured ? mailerTarget : "not configured"}`);
  console.log(`  └─ whatsapp    ${whatsappConfigured ? whatsappTarget : "not configured"}`);
  console.log("");

  /*
   * Checked at boot rather than on the first password reset: a bad
   * App Password would otherwise stay invisible until a real person
   * was already waiting for a code that never arrives.
   */
  verifyMailer().then(({ ok, reason }) => {
    if (ok) {
      console.log(`  [mail] ready — password reset codes will be emailed.\n`);
    } else {
      console.warn(`  [mail] OUTGOING EMAIL IS OFF: ${reason}`);
      console.warn(
        `  [mail] Until this is fixed, /auth/forgot-password returns the code ` +
          `in the response body (development only).\n`
      );
    }
  });
});

initSockets(server);

/* Started after the socket layer so the first sweep's in-app
   notifications have somewhere to be pushed. */
startReminderScheduler();

function shutdown(signal) {
  console.log(`\n[${signal}] shutting down...`);

  server.close(() => {
    try {
      db.close();
    } catch {
      /* already closed */
    }
    process.exit(0);
  });

  /* Do not hang forever if a socket refuses to close. */
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export default app;
