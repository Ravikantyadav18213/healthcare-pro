import ApiError from "../utils/ApiError.js";

/*
 * Small in-memory fixed-window limiter.
 *
 * Enough to blunt credential-stuffing against the auth endpoints in a
 * single-process deployment. Swap for Redis if this ever runs on more
 * than one node.
 */

const buckets = new Map();

/* Housekeeping so the map cannot grow without bound. */
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}, 60_000);

sweep.unref?.();

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
  return function limiter(req, res, next) {
    const identifier = bucketKey(req, keyPrefix, keyBy);

    const now = Date.now();
    let entry = buckets.get(identifier);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(identifier, entry);
    }

    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return next(ApiError.tooMany(message));
    }

    return next();
  };
}

/** Clears the counter for a key prefix after a successful login. */
export function resetRateLimit(req, keyPrefix = "rl") {
  buckets.delete(bucketKey(req, keyPrefix));
}
