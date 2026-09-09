import ApiError from "../utils/ApiError.js";
import { config } from "../config/env.js";

export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`No API route matches ${req.method} ${req.originalUrl}`));
}

/* eslint-disable no-unused-vars */
export function errorHandler(err, req, res, _next) {
  /* Translate database constraint failures into meaningful statuses. */
  let error = err;

  if (!(error instanceof ApiError)) {
    const code = error?.code || "";

    if (code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
      error = ApiError.conflict("That record already exists.");
    } else if (code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      error = ApiError.badRequest("Referenced record does not exist.");
    } else if (code === "SQLITE_CONSTRAINT_CHECK") {
      error = ApiError.badRequest("One of the supplied values is not allowed.");
    } else if (error?.type === "entity.too.large") {
      error = ApiError.badRequest("Uploaded content is too large.");
    }
  }

  const status = error instanceof ApiError ? error.status : 500;

  if (status >= 500) {
    console.error(
      `[error] ${req.method} ${req.originalUrl}`,
      err?.stack || err?.message || err
    );
  }

  const body = {
    success: false,
    message:
      error instanceof ApiError
        ? error.message
        : "Something went wrong on our end.",
    code: error instanceof ApiError ? error.code : "SERVER_ERROR",
  };

  if (error instanceof ApiError && error.details) {
    body.errors = error.details;
  }

  /* Stack traces only in development, never to the browser in prod. */
  if (!config.isProd && status >= 500) {
    body.debug = err?.message;
  }

  res.status(status).json(body);
}
