import ApiError from "../utils/ApiError.js";
import { incr, pexpire, pttl, del } from "../utils/kv.js";

/*
 * Fixed-window limiter, backed by the shared kv store (server/utils/kv.js)
 * so counts are correct across every serverless instance — see that
 * file for why an in-memory Map alone isn't enough on Vercel.
 */

/*
 * The bucket key has to normalise the email EXACTLY the way the auth
 * services do, or the limit is decorative: everything downstream calls
 * String(email).trim().toLowerCase(), so " victim@x.com" and
 * "victim@x.com" resolve to the same account. Keying on the untrimmed
 * value gave each padded variant its own fresh bucket, which let one
 * IP make unlimited login and OTP attempts against a single account
 * just by appending spaces.
 */
function bucketKey(req, keyPrefix, keyBy) {
  if (keyBy === "user") {
    /* Authenticated endpoints: the account is the thing worth
       limiting, not the address it was reached from. */
    return `${keyPrefix}:user:${req.user?.id ?? "-"}`;
  }
  if (keyBy === "ip") {
    /* Public endpoints with no account concept (e.g. the contact
       form): keying in the email too would let one IP get a fresh
       bucket for every value it types into that field. */
    return `${keyPrefix}:${req.ip}`;
  }
  const email = String(req.body?.email || "").trim().toLowerCase();
  return `${keyPrefix}:${req.ip}:${email || "-"}`;
}

export function rateLimit({
  windowMs = 15 * 60 * 1000,
  max = 20,
  keyPrefix = "rl",
  message = "Too many attempts. Please try again in a few minutes.",
  keyBy = "ip-email",
} = {}) {
  return async function limiter(req, res, next) {
    const identifier = bucketKey(req, keyPrefix, keyBy);

    const count = await incr(identifier);
    if (count === 1) await pexpire(identifier, windowMs);

    const remaining = Math.max(0, max - count);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));

    if (count > max) {
      const ttlMs = await pttl(identifier);
      const retryAfter = Math.ceil((ttlMs > 0 ? ttlMs : windowMs) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return next(ApiError.tooMany(message));
    }

    return next();
  };
}

/** Clears the counter for a key prefix after a successful login. */
export async function resetRateLimit(req, keyPrefix = "rl") {
  await del(bucketKey(req, keyPrefix));
}
