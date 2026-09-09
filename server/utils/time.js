/* ==================================================================
   Date / time helpers.

   Dates are stored as 'YYYY-MM-DD' and times as 'HH:MM' (24h) so
   plain string comparison is chronological in SQLite.
================================================================== */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidDate(value) {
  if (!DATE_RE.test(String(value || ""))) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime());
}

export function isValidTime(value) {
  return TIME_RE.test(String(value || ""));
}

/** Local (server) today as YYYY-MM-DD. */
export function today() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/** Current local time as HH:MM. */
export function nowTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`;
}

/** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD string. */
export function weekdayOf(dateStr) {
  return new Date(`${dateStr}T00:00:00`).getDay();
}

export function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function toMinutes(timeStr) {
  const [h, m] = String(timeStr).split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Expand a working window into discrete slot start times. */
export function buildSlots(startTime, endTime, slotMinutes) {
  const slots = [];
  const end = toMinutes(endTime);
  const step = Math.max(5, Number(slotMinutes) || 30);

  for (let t = toMinutes(startTime); t + step <= end; t += step) {
    slots.push(fromMinutes(t));
  }

  return slots;
}

/** True when the date is in the past relative to the server's today. */
export function isPastDate(dateStr) {
  return dateStr < today();
}
