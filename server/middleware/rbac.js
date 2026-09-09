import ApiError from "../utils/ApiError.js";
import audit from "../utils/audit.js";

/**
 * Role gate. Always used *after* requireAuth.
 *
 * Hiding a button in the UI is presentation. This is the actual
 * boundary — every admin route passes through here.
 */
export function requireRole(...roles) {
  const allowed = roles.flat();

  return function roleGate(req, _res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }

    if (!allowed.includes(req.user.role)) {
      audit(req, "access_denied", {
        entity: "route",
        entityId: req.originalUrl,
        details: `Role "${req.user.role}" attempted ${req.method} ${req.originalUrl}`,
      });

      const roleLabel =
        allowed.length === 1 && allowed[0] === "doctor"
          ? "A doctor account is"
          : allowed.length === 1 && allowed[0] === "user"
          ? "A patient account is"
          : "Administrator access is";

      return next(ApiError.forbidden(`${roleLabel} required for this action.`));
    }

    return next();
  };
}

export const requireAdmin = requireRole("admin");
export const requireDoctor = requireRole("doctor");
export const requireUser = requireRole("user");
export const requireDoctorOrAdmin = requireRole("doctor", "admin");
