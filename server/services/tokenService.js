import crypto from "node:crypto";
import jwt from "jsonwebtoken";

import db from "../db.js";
import { config } from "../config/env.js";
import { setEx, exists } from "../utils/kv.js";

const ACCESS_COOKIE = "hcp_access";
const REFRESH_COOKIE = "hcp_refresh";

export const COOKIE_NAMES = {
  access: ACCESS_COOKIE,
  refresh: REFRESH_COOKIE,
};

/* ==================================================================
   TOKENS
================================================================== */

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      typ: "access",
      /* Unique per token so a specific one can be revoked on logout. */
      jti: crypto.randomUUID(),
    },
    config.jwtSecret,
    { expiresIn: config.accessTokenTtl }
  );
}

/* ==================================================================
   ACCESS TOKEN REVOCATION

   Signing out used to drop the refresh row and clear the cookies, but
   the access token already in the client's hands stayed valid for the
   rest of its TTL — replayable as an Authorization header long after
   the user believed they were signed out.

   Access tokens live minutes, so a denylist of their ids stays tiny
   and needs no schema change; entries are dropped once the token
   they refer to could no longer be accepted anyway. Kept in the
   shared kv store (server/utils/kv.js, Redis in production) — an
   in-memory Map only denylisted a token on whichever single instance
   handled the logout, leaving it valid on every other serverless
   instance for the rest of its (short) natural life.
================================================================== */

function revokedKey(jti) {
  return `revoked-jti:${jti}`;
}

/** Blocks one already-issued access token for the remainder of its life. */
export async function revokeAccessToken(token) {
  if (!token) return;

  try {
    /* Decoded without verifying: an expired or tampered token needs no
       denylist entry, and jwt.decode never throws on a bad signature. */
    const payload = jwt.decode(token);
    if (!payload?.jti || !payload?.exp) return;

    const remainingSeconds = payload.exp - Math.floor(Date.now() / 1000);
    if (remainingSeconds > 0) {
      await setEx(revokedKey(payload.jti), "1", remainingSeconds);
    }
  } catch {
    /* Unparseable token: nothing to revoke. */
  }
}

export async function isAccessTokenRevoked(payload) {
  if (!payload?.jti) return false;
  return exists(revokedKey(payload.jti));
}

export async function verifyAccessToken(token) {
  const payload = jwt.verify(token, config.jwtSecret);
  if (payload.typ !== "access") {
    throw new Error("Wrong token type.");
  }
  if (await isAccessTokenRevoked(payload)) {
    throw new Error("Token revoked.");
  }
  return payload;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/* ==================================================================
   REFRESH SESSIONS

   The refresh token is a random opaque string. Only its SHA-256
   hash is persisted, so a database leak cannot be replayed.
================================================================== */

const insertSession = db.prepare(`
  INSERT INTO sessions (user_id, refresh_token_hash, user_agent, ip, expires_at, persistent)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const findSession = db.prepare(`
  SELECT * FROM sessions
  WHERE refresh_token_hash = ?
    AND revoked_at IS NULL
    AND expires_at > datetime('now')
`);

const revokeSession = db.prepare(`
  UPDATE sessions SET revoked_at = datetime('now') WHERE refresh_token_hash = ?
`);

const revokeAllForUser = db.prepare(`
  UPDATE sessions SET revoked_at = datetime('now')
  WHERE user_id = ? AND revoked_at IS NULL
`);

const purgeExpired = db.prepare(`
  DELETE FROM sessions
  WHERE expires_at < datetime('now', '-30 days')
     OR (revoked_at IS NOT NULL AND revoked_at < datetime('now', '-30 days'))
`);

/**
 * Issues a refresh token.
 *
 * A non-persistent ("do not remember me") session is kept short in the
 * database as well, since its cookie dies with the browser anyway.
 */
export async function issueRefreshToken(
  userId,
  req,
  persistent = false,
  days = null
) {
  const raw = crypto.randomBytes(48).toString("hex");

  const lifetimeDays =
    days ?? (persistent ? config.refreshTokenDays : 1);

  const expiresAt = new Date(
    Date.now() + lifetimeDays * 24 * 60 * 60 * 1000
  ).toISOString();

  await insertSession.run(
    userId,
    hashToken(raw),
    req?.get?.("user-agent") || null,
    req?.ip || null,
    expiresAt,
    persistent ? 1 : 0
  );

  return raw;
}

export async function consumeRefreshToken(raw) {
  if (!raw) return null;

  const session = await findSession.get(hashToken(raw));
  if (!session) return null;

  /* Single-use rotation: the presented token is retired immediately. */
  await revokeSession.run(hashToken(raw));

  return session;
}

export async function revokeRefreshToken(raw) {
  if (!raw) return;
  await revokeSession.run(hashToken(raw));
}

export async function revokeAllSessions(userId) {
  await revokeAllForUser.run(userId);
}

export async function purgeOldSessions() {
  try {
    await purgeExpired.run();
  } catch {
    /* housekeeping only */
  }
}

/* ==================================================================
   COOKIES
================================================================== */

/*
 * Omitting maxAge produces a *session cookie*: the browser discards it
 * when it closes. That is the default, so closing the browser really
 * does sign you out and the next visit shows the sign-in form.
 *
 * "Keep me signed in" opts into a dated cookie that survives a restart.
 */
function baseCookie(maxAgeMs, persistent) {
  const options = {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: "/",
  };

  if (persistent && maxAgeMs) options.maxAge = maxAgeMs;

  return options;
}

export function setAuthCookies(
  res,
  { accessToken, refreshToken, persistent = false, maxAgeMs = null }
) {
  const refreshMaxAge =
    maxAgeMs ?? config.refreshTokenDays * 24 * 60 * 60 * 1000;

  res.cookie(
    ACCESS_COOKIE,
    accessToken,
    baseCookie(60 * 60 * 1000, persistent)
  );

  if (refreshToken) {
    res.cookie(REFRESH_COOKIE, refreshToken, baseCookie(refreshMaxAge, persistent));
  }
}

export function clearAuthCookies(res) {
  const options = {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: "/",
  };

  res.clearCookie(ACCESS_COOKIE, options);
  res.clearCookie(REFRESH_COOKIE, options);
}

/** Reads the access token from the cookie or the Authorization header. */
export function readAccessToken(req) {
  const fromCookie = req.cookies?.[ACCESS_COOKIE];
  if (fromCookie) return fromCookie;

  const header = req.get("authorization") || "";
  if (header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }

  return null;
}

export function readRefreshToken(req) {
  return req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken || null;
}
