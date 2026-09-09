import db from "../db.js";

const insert = db.prepare(`
  INSERT INTO audit_logs
    (user_id, actor_email, actor_role, action, entity, entity_id, details, ip)
  VALUES
    (@user_id, @actor_email, @actor_role, @action, @entity, @entity_id, @details, @ip)
`);

/**
 * Record a meaningful action in the audit trail.
 * Never throws — auditing must not break the request it describes.
 */
export function audit(req, action, options = {}) {
  try {
    const actor = req?.user || null;

    insert.run({
      user_id: options.userId ?? actor?.id ?? null,
      actor_email: options.actorEmail ?? actor?.email ?? null,
      actor_role: options.actorRole ?? actor?.role ?? null,
      action,
      entity: options.entity ?? null,
      entity_id:
        options.entityId === undefined || options.entityId === null
          ? null
          : String(options.entityId),
      details: options.details ?? null,
      ip: req?.ip ?? null,
    });
  } catch (error) {
    console.error("[audit] failed to record action:", action, error.message);
  }
}

export default audit;
