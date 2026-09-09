import db from "../db.js";
import ApiError from "../utils/ApiError.js";
import { publicNotification } from "../utils/sanitize.js";

export function listNotifications(userId, { limit = 30, unreadOnly = false } = {}) {
  const rows = db
    .prepare(
      `SELECT * FROM notifications
        WHERE user_id = @userId
          ${unreadOnly ? "AND is_read = 0" : ""}
        ORDER BY created_at DESC, id DESC
        LIMIT @limit`
    )
    .all({ userId: Number(userId), limit: Math.min(Number(limit) || 30, 100) });

  const unread = db
    .prepare(
      `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0`
    )
    .get(Number(userId)).n;

  return { items: rows.map(publicNotification), unread };
}

export function markRead(userId, id) {
  const row = db
    .prepare(`SELECT * FROM notifications WHERE id = ? AND user_id = ?`)
    .get(Number(id), Number(userId));

  if (!row) throw ApiError.notFound("Notification not found.");

  db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ?`).run(Number(id));
  return true;
}

export function markAllRead(userId) {
  const result = db
    .prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`)
    .run(Number(userId));

  return result.changes;
}

export function unreadCount(userId) {
  return db
    .prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0`)
    .get(Number(userId)).n;
}
