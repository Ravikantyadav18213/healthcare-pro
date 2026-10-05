import db from "../db.js";
import ApiError from "../utils/ApiError.js";
import { publicNotification } from "../utils/sanitize.js";

export async function listNotifications(userId, { limit = 30, unreadOnly = false } = {}) {
  const rows = await db
    .prepare(
      `SELECT * FROM notifications
        WHERE user_id = @userId
          ${unreadOnly ? "AND is_read = 0" : ""}
        ORDER BY created_at DESC, id DESC
        LIMIT @limit`
    )
    .all({ userId: Number(userId), limit: Math.min(Number(limit) || 30, 100) });

  const unreadRow = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0`
    )
    .get(Number(userId));

  return { items: rows.map(publicNotification), unread: unreadRow.n };
}

export async function markRead(userId, id) {
  const row = await db
    .prepare(`SELECT * FROM notifications WHERE id = ? AND user_id = ?`)
    .get(Number(id), Number(userId));

  if (!row) throw ApiError.notFound("Notification not found.");

  await db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ?`).run(Number(id));
  return true;
}

export async function markAllRead(userId) {
  const result = await db
    .prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`)
    .run(Number(userId));

  return result.changes;
}

export async function unreadCount(userId) {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0`)
    .get(Number(userId));

  return row.n;
}
