import axios from "axios";

/* ==================================================================
   AXIOS INSTANCE

   withCredentials is on so the browser sends the HttpOnly auth
   cookies issued by the API. No token is ever kept in localStorage.
================================================================== */

export const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_URL,
  timeout: 20000,
  withCredentials: true,
  headers: { Accept: "application/json" },
});

/* ==================================================================
   ERROR SHAPE

   Every rejection reaching a component is a plain object with the
   same fields, so no page has to unpack an Axios error itself.
================================================================== */

export class ApiError extends Error {
  constructor({ status, message, errors, code, isNetwork = false }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors || null;
    this.code = code || null;
    this.isNetwork = isNetwork;
  }
}

const FRIENDLY = {
  400: "That request could not be processed.",
  401: "Your session has expired. Please sign in again.",
  403: "You do not have permission to do that.",
  404: "We could not find what you were looking for.",
  409: "That action conflicts with existing data.",
  422: "Please correct the highlighted fields.",
  429: "Too many attempts. Please wait a moment.",
  500: "Something went wrong on our end. Please try again.",
};

function normalise(error) {
  if (axios.isCancel?.(error) || error.code === "ERR_CANCELED") {
    return new ApiError({ status: 0, message: "Request cancelled", code: "CANCELLED" });
  }

  if (!error.response) {
    /*
     * A blocked CORS response and a dead server are indistinguishable
     * from the browser, so the message covers both rather than
     * blaming the port when the API is actually up.
     */
    const message =
      error.code === "ECONNABORTED"
        ? "The server took too long to respond. Please try again."
        : `Could not reach the API at ${API_URL}. Make sure the backend is running (npm run server) and that this page's address is allowed by CORS.`;

    return new ApiError({
      status: 0,
      message,
      code: "NETWORK_ERROR",
      isNetwork: true,
    });
  }

  const { status, data } = error.response;

  return new ApiError({
    status,
    message: data?.message || FRIENDLY[status] || "Unexpected error.",
    errors: data?.errors,
    code: data?.code,
  });
}

/* ==================================================================
   SESSION EVENTS

   AuthContext listens for these instead of the interceptor importing
   React state, which would create a circular dependency.
================================================================== */

export const AUTH_EVENT = "hcp:session-expired";

function announceSessionExpired() {
  window.dispatchEvent(new CustomEvent(AUTH_EVENT));
}

/* Endpoints that must never trigger a refresh-and-retry cycle. */
const NO_REFRESH = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"];

let refreshPromise = null;

api.interceptors.response.use(
  (response) => response,

  async (error) => {
    const original = error.config || {};
    const status = error.response?.status;

    /* ---- 401: try a single silent refresh, then replay once ---- */
    if (
      status === 401 &&
      !original.__retried &&
      !NO_REFRESH.some((path) => String(original.url || "").includes(path))
    ) {
      original.__retried = true;

      try {
        /* Concurrent 401s share one refresh call. */
        refreshPromise =
          refreshPromise || api.post("/auth/refresh").finally(() => {
            refreshPromise = null;
          });

        await refreshPromise;

        return api(original);
      } catch {
        announceSessionExpired();
        return Promise.reject(normalise(error));
      }
    }

    if (status === 401 && !String(original.url || "").includes("/auth/me")) {
      announceSessionExpired();
    }

    return Promise.reject(normalise(error));
  }
);

/* Unwraps `data` so services return the payload directly. */
export const unwrap = (promise) => promise.then((response) => response.data);

export default api;
