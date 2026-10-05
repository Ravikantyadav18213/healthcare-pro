import { Redis } from "@upstash/redis";

import { config } from "../config/env.js";

/* ==================================================================
   SHARED EPHEMERAL KEY/VALUE STORE

   Backs the rate limiter, the OTP-guess counter, and the JWT
   revocation denylist — three pieces of state that used to live in
   separate in-memory Maps, which only worked because the app ran as
   one always-on process. Vercel serverless functions don't share
   memory across instances, so this needs a real shared store: Upstash
   Redis when UPSTASH_REDIS_REST_URL/TOKEN are set, falling back to an
   in-memory Map (same as before this migration) so local dev and a
   single-process deployment still need no Redis account.
================================================================== */

const redis =
  config.redisUrl && config.redisToken
    ? new Redis({ url: config.redisUrl, token: config.redisToken })
    : null;

export const kvConfigured = Boolean(redis);

const store = new Map();

if (!redis) {
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.expiresAt && entry.expiresAt <= now) store.delete(key);
    }
  }, 60_000);

  sweep.unref?.();
}

function localEntry(key) {
  const entry = store.get(key);
  if (!entry) return undefined;

  if (entry.expiresAt && entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }

  return entry;
}

/** Atomically increments a counter, creating it at 1 if absent. */
export async function incr(key) {
  if (redis) return redis.incr(key);

  const entry = localEntry(key) || { value: 0, expiresAt: null };
  entry.value = (entry.value || 0) + 1;
  store.set(key, entry);
  return entry.value;
}

/** Sets (or refreshes) a key's time-to-live, in milliseconds. */
export async function pexpire(key, ms) {
  if (redis) {
    await redis.pexpire(key, ms);
    return;
  }

  const entry = localEntry(key) || { value: 0, expiresAt: null };
  entry.expiresAt = Date.now() + ms;
  store.set(key, entry);
}

/** Milliseconds until expiry, or -1 if the key has no TTL / doesn't exist. */
export async function pttl(key) {
  if (redis) return redis.pttl(key);

  const entry = localEntry(key);
  if (!entry || !entry.expiresAt) return -1;
  return Math.max(0, entry.expiresAt - Date.now());
}

export async function del(key) {
  if (redis) {
    await redis.del(key);
    return;
  }
  store.delete(key);
}

/** Sets a value with a time-to-live, in seconds. */
export async function setEx(key, value, exSeconds) {
  if (redis) {
    await redis.set(key, value, { ex: exSeconds });
    return;
  }
  store.set(key, { value, expiresAt: Date.now() + exSeconds * 1000 });
}

export async function exists(key) {
  if (redis) return (await redis.exists(key)) > 0;
  return Boolean(localEntry(key));
}
