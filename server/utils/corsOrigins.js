import { config } from "../config/env.js";

/*
 * Shared with Socket.IO's own CORS check (server/sockets/index.js) so
 * the realtime channel and the REST API always agree on which origins
 * may present the auth cookies.
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
