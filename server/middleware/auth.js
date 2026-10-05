import db from "../db.js";
import ApiError from "../utils/ApiError.js";
import { readAccessToken, verifyAccessToken } from "../services/tokenService.js";

const findUser = db.prepare(
  `SELECT id, name, email, role, status, assigned_ward_id AS assignedWardId FROM users WHERE id = ?`
);

/**
 * Populates req.user from a verified access token.
 *
 * The role and identity always come from the signed token plus a
 * fresh database read — never from anything the client sent in the
 * body, query string, or a custom header.
 */
export async function requireAuth(req, _res, next) {
  const token = readAccessToken(req);

  if (!token) {
    return next(ApiError.unauthorized("Please sign in to continue."));
  }

  let payload;
  try {
    payload = await verifyAccessToken(token);
  } catch (error) {
    const expired = error?.name === "TokenExpiredError";
    return next(
      ApiError.unauthorized(
        expired ? "Your session has expired." : "Invalid session. Please sign in again."
      )
    );
  }

  const user = await findUser.get(payload.sub);

  if (!user) {
    return next(ApiError.unauthorized("Account no longer exists."));
  }

  if (user.status !== "active") {
    return next(
      ApiError.forbidden("Your account has been deactivated by an administrator.")
    );
  }

  req.user = user;
  return next();
}

/** Attaches req.user when a valid token exists, but never rejects. */
export async function optionalAuth(req, _res, next) {
  const token = readAccessToken(req);
  if (!token) return next();

  try {
    const payload = await verifyAccessToken(token);
    const user = await findUser.get(payload.sub);
    if (user && user.status === "active") req.user = user;
  } catch {
    /* anonymous request */
  }

  return next();
}
