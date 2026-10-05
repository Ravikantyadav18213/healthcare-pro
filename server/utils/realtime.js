import Pusher from "pusher";

import db from "../db.js";
import { config } from "../config/env.js";
import ApiError from "./ApiError.js";

/* ==================================================================
   REALTIME (Pusher Channels)

   Replaces the old socket.io server (server/sockets/index.js, removed
   in this migration) — Vercel serverless functions can't hold a
   persistent WebSocket server, but they CAN make a REST call, which
   is all `pusher.trigger()` is.

   Every signed-in user's browser subscribes to a private channel
   named `private-user-{id}` (see src/hooks/useSocket.js) — this file
   is the only thing that ever triggers events on it, so the shape
   controllers/services already used (`emitToUser`/`emitToUsers`/
   `emitToAdmins`) needed no changes at any call site.

   Unset PUSHER_* env vars -> every export below silently no-ops,
   same pattern as the optional mailer/whatsapp/Razorpay integrations
   elsewhere in this app. The REST API and every DB write work fully
   without it; only live push (chat, notifications, dashboard ticks)
   is unavailable.
================================================================== */

const configured = Boolean(
  config.pusherAppId && config.pusherKey && config.pusherSecret && config.pusherCluster
);

const pusher = configured
  ? new Pusher({
      appId: config.pusherAppId,
      key: config.pusherKey,
      secret: config.pusherSecret,
      cluster: config.pusherCluster,
      useTLS: true,
    })
  : null;

const findActiveAdminIds = db.prepare(
  `SELECT id FROM users WHERE role = 'admin' AND status = 'active'`
);

export function isRealtimeConfigured() {
  return configured;
}

export async function emitToUser(userId, event, payload) {
  if (!pusher || !userId) return;

  try {
    await pusher.trigger(`private-user-${userId}`, event, payload);
  } catch (error) {
    console.error("[realtime] emitToUser failed:", error.message);
  }
}

export async function emitToUsers(userIds, event, payload) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(Number))];
  if (!pusher || ids.length === 0) return;

  try {
    /* Pusher accepts up to 100 channels per trigger call. */
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100).map((id) => `private-user-${id}`);
      await pusher.trigger(batch, event, payload);
    }
  } catch (error) {
    console.error("[realtime] emitToUsers failed:", error.message);
  }
}

/** Pushes an event to every signed-in administrator — for dashboard
    figures that any admin session might currently be looking at. */
export async function emitToAdmins(event, payload) {
  const admins = await findActiveAdminIds.all();
  await emitToUsers(admins.map((row) => row.id), event, payload);
}

/** True if this user has at least one tab subscribed to the shared
    presence channel right now. Queried live from Pusher — there is
    no local state to go stale across serverless instances. */
export async function isUserOnline(userId) {
  if (!pusher || !userId) return false;

  try {
    const response = await pusher.get({ path: "/channels/presence-online/users" });
    if (response.status !== 200) return false;

    const body = await response.json();
    return (body.users || []).some((u) => String(u.id) === String(userId));
  } catch (error) {
    console.error("[realtime] isUserOnline failed:", error.message);
    return false;
  }
}

/**
 * Authorizes a browser's subscription to a private/presence channel.
 * Called from POST /api/realtime/auth (see routes/index.js), which
 * runs behind requireAuth — `user` is always the authenticated caller,
 * never anything the client claims to be.
 */
export function authorizeChannel(socketId, channelName, user) {
  if (!pusher) {
    throw ApiError.internal("Realtime is not configured.");
  }

  if (channelName === "presence-online") {
    return pusher.authorizeChannel(socketId, channelName, {
      user_id: String(user.id),
      user_info: { name: user.name, role: user.role },
    });
  }

  /* A user may only ever subscribe to their own private channel. */
  if (channelName === `private-user-${user.id}`) {
    return pusher.authorizeChannel(socketId, channelName);
  }

  throw ApiError.forbidden("Not authorized for this channel.");
}
