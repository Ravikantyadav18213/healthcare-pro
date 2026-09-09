import ApiError from "../utils/ApiError.js";
import { isValidDate, isValidTime } from "../utils/time.js";

/* ==================================================================
   Tiny schema validator.

   Every endpoint that accepts a body runs through this so the client
   gets a consistent { field: message } map it can render inline.
================================================================== */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PHONE_RE = /^[+\d][\d\s\-()]{6,19}$/;

export const rules = {
  string:
    ({ min = 0, max = 255, label } = {}) =>
    (value, field) => {
      const text = value === undefined || value === null ? "" : String(value).trim();
      const name = label || field;

      if (text.length < min) {
        return min === 1
          ? `${name} is required.`
          : `${name} must be at least ${min} characters.`;
      }
      if (text.length > max) return `${name} must be ${max} characters or fewer.`;
      return null;
    },

  email: (value, field) => {
    const text = String(value || "").trim();
    if (!text) return "Email address is required.";
    if (!EMAIL_RE.test(text)) return "Enter a valid email address.";
    if (text.length > 190) return "Email address is too long.";
    return null;
  },

  phone:
    ({ required = true } = {}) =>
    (value) => {
      const text = String(value || "").trim();
      if (!text) return required ? "Phone number is required." : null;
      if (!PHONE_RE.test(text)) return "Enter a valid phone number.";
      return null;
    },

  /*
   * Password policy: at least 8 characters with a letter and a digit.
   * Long passphrases (12+) are accepted as-is.
   */
  password: (value) => {
    const text = String(value || "");
    if (!text) return "Password is required.";
    if (text.length < 8) return "Password must be at least 8 characters.";
    if (text.length > 128) return "Password must be 128 characters or fewer.";
    if (text.length < 12) {
      if (!/[A-Za-z]/.test(text)) return "Password must include a letter.";
      if (!/\d/.test(text)) return "Password must include a number.";
    }
    return null;
  },

  date:
    ({ required = true, label = "Date" } = {}) =>
    (value) => {
      const text = String(value || "").trim();
      if (!text) return required ? `${label} is required.` : null;
      if (!isValidDate(text)) return `${label} must be a valid YYYY-MM-DD date.`;
      return null;
    },

  time:
    ({ required = true, label = "Time" } = {}) =>
    (value) => {
      const text = String(value || "").trim();
      if (!text) return required ? `${label} is required.` : null;
      if (!isValidTime(text)) return `${label} must be a valid HH:MM time.`;
      return null;
    },

  integer:
    ({ min = 0, max = Number.MAX_SAFE_INTEGER, required = true, label } = {}) =>
    (value, field) => {
      const name = label || field;
      if (value === undefined || value === null || value === "") {
        return required ? `${name} is required.` : null;
      }
      const num = Number(value);
      if (!Number.isFinite(num)) return `${name} must be a number.`;
      if (num < min) return `${name} must be at least ${min}.`;
      if (num > max) return `${name} must be ${max} or less.`;
      return null;
    },

  oneOf:
    (allowed, { required = true, label } = {}) =>
    (value, field) => {
      const name = label || field;
      if (value === undefined || value === null || value === "") {
        return required ? `${name} is required.` : null;
      }
      if (!allowed.includes(value)) {
        return `${name} must be one of: ${allowed.join(", ")}.`;
      }
      return null;
    },
};

/**
 * Runs a { field: validatorFn | validatorFn[] } schema against an
 * object and throws a 422 with every failing field at once.
 */
export function validate(payload, schema) {
  const errors = {};

  for (const [field, validators] of Object.entries(schema)) {
    const list = Array.isArray(validators) ? validators : [validators];

    for (const validator of list) {
      const message = validator(payload?.[field], field);
      if (message) {
        errors[field] = message;
        break;
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    throw ApiError.validation(errors);
  }

  return true;
}

/** Trims strings and turns "" into null across a payload. */
export function clean(payload, fields) {
  const output = {};

  for (const field of fields) {
    const value = payload?.[field];
    if (typeof value === "string") {
      const trimmed = value.trim();
      output[field] = trimmed === "" ? null : trimmed;
    } else {
      output[field] = value === undefined ? null : value;
    }
  }

  return output;
}
