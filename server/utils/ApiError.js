/*
 * Typed application error. Anything thrown as an ApiError is safe to
 * show the client; anything else is sanitised into a generic 500 by
 * the error middleware.
 */
export default class ApiError extends Error {
  constructor(status, message, details = null, code = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
    this.code = code;
    this.expose = true;
  }

  static badRequest(message = "Invalid request.", details = null) {
    return new ApiError(400, message, details, "BAD_REQUEST");
  }

  static unauthorized(message = "Please sign in to continue.") {
    return new ApiError(401, message, null, "UNAUTHORIZED");
  }

  static forbidden(message = "You do not have permission to do that.") {
    return new ApiError(403, message, null, "FORBIDDEN");
  }

  static notFound(message = "Resource not found.") {
    return new ApiError(404, message, null, "NOT_FOUND");
  }

  static conflict(message = "That action conflicts with existing data.") {
    return new ApiError(409, message, null, "CONFLICT");
  }

  static validation(details, message = "Please correct the highlighted fields.") {
    return new ApiError(422, message, details, "VALIDATION_ERROR");
  }

  static tooMany(message = "Too many attempts. Please try again shortly.") {
    return new ApiError(429, message, null, "RATE_LIMITED");
  }

  static internal(message = "Something went wrong on our end.") {
    return new ApiError(500, message, null, "SERVER_ERROR");
  }
}
