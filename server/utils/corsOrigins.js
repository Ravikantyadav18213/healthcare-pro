import { config } from "../config/env.js";

/*
 * Which browser origins may present the auth cookies on a REST call.
 * Realtime (Pusher) has no CORS surface of its own — the browser
 * talks to Pusher directly, authorized via POST /api/realtime/auth,
 * which goes through this same check as any other route.
 */

const allowedOrigins = new Set(
  [
    config.clientUrl,
    ...String(process.env.EXTRA_ORIGINS || "")
      .split(",")
      .map((value) => value.trim()),
  ].filter(Boolean)
);

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function isAllowedOrigin(origin) {
  if (allowedOrigins.has(origin)) return true;
  if (!config.isProd && LOCALHOST_ORIGIN.test(origin)) return true;
  return false;
}

export default isAllowedOrigin;
