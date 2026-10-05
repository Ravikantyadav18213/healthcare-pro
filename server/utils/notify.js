import db from "../db.js";
import { emitToUser } from "./realtime.js";

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
 * Callers should `await` this: on serverless, an un-awaited write can
 * be dropped when the function freezes right after the response.
 */
export async function notify(userId, { title, message, type = "info", link = null }) {
  if (!userId) return;

  try {
    await insert.run({
      user_id: userId,
      title,
      message,
      type,
      link,
    });

    /* Push it now instead of making the bell wait out its poll. */
    await emitToUser(userId, "notification:new", { title, message, type, link });
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
export async function notifyAdmins({
  title,
  message,
  type = "info",
  link = null,
  exceptUserId = null,
}) {
  try {
    const admins = await findAdmins.all();

    for (const admin of admins) {
      if (exceptUserId && admin.id === Number(exceptUserId)) continue;

      await insert.run({
        user_id: admin.id,
        title,
        message,
        type,
        link,
      });

      await emitToUser(admin.id, "notification:new", { title, message, type, link });
    }
  } catch (error) {
    console.error("[notifyAdmins] failed:", error.message);
  }
}

export default notify;
