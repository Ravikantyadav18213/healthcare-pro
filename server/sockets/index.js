import { Server } from "socket.io";
import cookie from "cookie";

import db from "../db.js";
import { verifyAccessToken } from "../services/tokenService.js";
import { isAllowedOrigin } from "../utils/corsOrigins.js";

/* ==================================================================
   REALTIME CHAT TRANSPORT

   Socket.IO is authenticated with the same HttpOnly access-token
   cookie the REST API uses — no separate token is ever issued. A
   socket that cannot present a valid, active session is refused at
   the handshake, before it can join any room.

   This module only ever pushes updates that the REST layer has
   already persisted and authorised (see chatService.js). It has no
   business logic of its own — it is a delivery mechanism, not a
   second place the approval rule could be bypassed.
================================================================== */

const findUser = db.prepare(
  `SELECT id, name, email, role, status FROM users WHERE id = ?`
);

const findConversation = db.prepare(
  `SELECT id, type, patient_id, doctor_id, status FROM chat_conversations WHERE id = ?`
);

const findActiveAdminIds = db.prepare(
  `SELECT id FROM users WHERE role = 'admin' AND status = 'active'`
);

/* Who a live update from this thread should reach. */
function participantsOf(conversation) {
  if (conversation.type === "patient_admin") {
    return [conversation.patient_id, ...findActiveAdminIds.all().map((a) => a.id)];
  }
  return [conversation.patient_id, conversation.doctor_id].filter(Boolean);
}

let io = null;

/** userId -> Set<socket.id>, so an emit reaches every open tab/device. */
const userSockets = new Map();

export function initSockets(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (!origin || isAllowedOrigin(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const parsed = cookie.parse(socket.handshake.headers.cookie || "");
      const token = parsed.hcp_access;

      if (!token) return next(new Error("unauthorized"));

      const payload = verifyAccessToken(token);
      const user = findUser.get(payload.sub);

      if (!user || user.status !== "active") {
        return next(new Error("unauthorized"));
      }

      socket.user = user;
      return next();
    } catch {
      return next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user.id;

    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId).add(socket.id);

    /* A private per-user room — every chat push targets this room
       rather than a conversation room, so a user with no open
       conversation view still gets the "new message" badge update. */
    socket.join(`user:${userId}`);

    /*
     * A typing signal is relayed, never stored. The sender's identity
     * comes from the authenticated socket, and the thread is checked
     * against the database — a client cannot type into a conversation
     * it is not part of, or pretend to be someone else.
     */
    socket.on("chat:typing", (payload) => {
      try {
        const conversation = findConversation.get(Number(payload?.conversationId));
        if (!conversation || conversation.status !== "active") return;

        const participants = participantsOf(conversation);
        if (!participants.some((id) => Number(id) === Number(userId))) return;

        const others = participants.filter((id) => Number(id) !== Number(userId));

        emitToUsers(others, "chat:typing", {
          conversationId: conversation.id,
          userId,
          name: socket.user.name,
          typing: Boolean(payload?.typing),
        });
      } catch {
        /* A malformed typing ping is not worth an error path. */
      }
    });

    /* First socket for this account: they just came online. */
    if (userSockets.get(userId).size === 1) {
      announcePresence(userId, true);
    }

    socket.on("disconnect", () => {
      const set = userSockets.get(userId);
      set?.delete(socket.id);

      if (set && set.size === 0) {
        userSockets.delete(userId);
        announcePresence(userId, false);
      }
    });
  });

  return io;
}

/**
 * Tell this user's conversation partners that they came online or
 * went offline. Only actual participants are told — presence is not
 * broadcast to everyone connected.
 */
function announcePresence(userId, online) {
  if (!io) return;

  try {
    const user = findUser.get(userId);

    /*
     * An administrator is not a row in any conversation — they answer
     * the admin desk as a group — so their audience is every patient
     * holding an admin thread.
     */
    const rows =
      user?.role === "admin"
        ? db
            .prepare(
              `SELECT id, type, patient_id, doctor_id FROM chat_conversations
                WHERE type = 'patient_admin'`
            )
            .all()
        : db
            .prepare(
              `SELECT id, type, patient_id, doctor_id FROM chat_conversations
                WHERE patient_id = ? OR doctor_id = ?`
            )
            .all(userId, userId);

    const audience = new Set();

    for (const row of rows) {
      for (const id of participantsOf(row)) {
        if (Number(id) !== Number(userId)) audience.add(id);
      }
    }

    if (audience.size === 0) return;

    emitToUsers([...audience], "chat:presence", { userId, online });
  } catch (error) {
    console.error("[presence] failed:", error.message);
  }
}

/** True while at least one open socket belongs to this user. */
export function isUserOnline(userId) {
  return (userSockets.get(Number(userId))?.size || 0) > 0;
}

export function emitToUser(userId, event, payload) {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, payload);
}

export function emitToUsers(userIds, event, payload) {
  for (const id of userIds) emitToUser(id, event, payload);
}

/** Pushes an event to every signed-in administrator — for dashboard
    figures that any admin session might currently be looking at. */
export function emitToAdmins(event, payload) {
  emitToUsers(
    findActiveAdminIds.all().map((row) => row.id),
    event,
    payload
  );
}

export default initSockets;
