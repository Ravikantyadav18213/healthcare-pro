import db from "../db.js";
import { emitToUser } from "../sockets/index.js";

const insert = db.prepare(`
  INSERT INTO notifications (user_id, title, message, type, link)
  VALUES (@user_id, @title, @message, @type, @link)
`);

const findAdmins = db.prepare(
  `SELECT id FROM users WHERE role = 'admin' AND status = 'active'`
);

/**
 * Create an in-app notification for a user.
 * Never throws — a failed notification must not fail the action.
 */
export function notify(userId, { title, message, type = "info", link = null }) {
  if (!userId) return;

  try {
    insert.run({
      user_id: userId,
      title,
      message,
      type,
      link,
    });

    /* Push it now instead of making the bell wait out its poll. */
    emitToUser(userId, "notification:new", { title, message, type, link });
  } catch (error) {
    console.error("[notify] failed:", error.message);
  }
}

/**
 * Fan a notification out to every active administrator.
 *
 * `exceptUserId` skips the person who triggered the action, so an
 * admin never gets notified about their own click.
 */
export function notifyAdmins({
  title,
  message,
  type = "info",
  link = null,
  exceptUserId = null,
}) {
  try {
    for (const admin of findAdmins.all()) {
      if (exceptUserId && admin.id === Number(exceptUserId)) continue;

      insert.run({
        user_id: admin.id,
        title,
        message,
        type,
        link,
      });

      emitToUser(admin.id, "notification:new", { title, message, type, link });
    }
  } catch (error) {
    console.error("[notifyAdmins] failed:", error.message);
  }
}

export default notify;
