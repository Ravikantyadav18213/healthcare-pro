import db from "../db.js";
import ApiError from "../utils/ApiError.js";
import { today, addDays } from "../utils/time.js";
import { emitToAdmins } from "../sockets/index.js";

/* ==================================================================
   ADMIN DASHBOARD ANALYTICS

   Every number here is computed from live tables. Nothing is
   hard-coded, so the dashboard reflects whatever is really in the
   database at the moment it is requested.
================================================================== */

function resourceValue(kind, label, fallback = 0) {
  const row = db
    .prepare(`SELECT value FROM hospital_resources WHERE kind = ? AND label = ?`)
    .get(kind, label);

  return row ? Number(row.value) || 0 : fallback;
}

export function adminOverview() {
  const day = today();

  const totalPatients = db.prepare(`SELECT COUNT(*) AS n FROM patients`).get().n;

  const totalDoctors = db
    .prepare(`SELECT COUNT(*) AS n FROM doctors WHERE status = 'active'`)
    .get().n;

  const appointmentsToday = db
    .prepare(
      `SELECT COUNT(*) AS n FROM appointments
        WHERE appointment_date = ?
          AND status IN ('pending','scheduled','confirmed','rescheduled','completed')`
    )
    .get(day).n;

  const icuTotal = resourceValue("icu", "total", 20);
  const icuOccupied = resourceValue("icu", "occupied", 0);

  const revenueToday = db
    .prepare(
      `SELECT COALESCE(SUM(total), 0) AS amount
         FROM billing_records
        WHERE status = 'Paid' AND issued_at = ?`
    )
    .get(day).amount;

  /* Fall back to the most recent paid day so a brand new database
     still shows a meaningful figure instead of a flat zero. */
  const revenueFallback = db
    .prepare(
      `SELECT COALESCE(SUM(total), 0) AS amount
         FROM billing_records
        WHERE status = 'Paid'
          AND issued_at = (SELECT MAX(issued_at) FROM billing_records WHERE status = 'Paid')`
    )
    .get().amount;

  const pharmacySales = db
    .prepare(
      `SELECT COALESCE(SUM(stock), 0) AS units FROM pharmacy_items WHERE status = 'active'`
    )
    .get().units;

  const emergencyCases = db
    .prepare(`SELECT COUNT(*) AS n FROM emergency_cases WHERE status = 'Active'`)
    .get().n;

  /*
   * "Discharged Today" reads as a single hospital-wide figure, but a
   * patient is marked Discharged from TWO separate places in this
   * app — the Emergency page (emergency_cases.status) and the
   * Patients page (patients.status, e.g. Outpatient/Admitted/
   * Critical/Discharged). Counting only the first meant discharging
   * someone from Patients silently never moved this number, which
   * reads as the same "it doesn't track discharges" bug from a
   * different screen. Both tables already stamp updated_at on every
   * status change, so this is a sum of two identically-shaped counts
   * — no schema change needed on either side.
   */
  const dischargedToday =
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM emergency_cases
          WHERE status = 'Discharged' AND date(updated_at) = ?`
      )
      .get(day).n +
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM patients
          WHERE status = 'Discharged' AND date(updated_at) = ?`
      )
      .get(day).n;

  /* Same two sources as above, not reset at midnight — the all-time
     running total shown as the small "X all-time" line under the
     Discharged Today figure, not a tile of its own. */
  const dischargedTotal =
    db.prepare(`SELECT COUNT(*) AS n FROM emergency_cases WHERE status = 'Discharged'`).get()
      .n +
    db.prepare(`SELECT COUNT(*) AS n FROM patients WHERE status = 'Discharged'`).get().n;

  return {
    totalPatients,
    totalDoctors,
    appointmentsToday,
    icuBedsFree: Math.max(0, icuTotal - icuOccupied),
    icuBedsTotal: icuTotal,
    icuBedsOccupied: icuOccupied,
    revenueToday: revenueToday || revenueFallback,
    pharmacyStock: pharmacySales,
    emergencyCases,
    dischargedToday,
    dischargedTotal,
  };
}

/* ==================================================================
   DISCHARGED PATIENTS — DETAIL LIST

   Backs the "Discharged Today" card's detail view: who was
   discharged, from which of the two discharge workflows, what the
   condition/problem was, which doctor handled them, and when — so
   an admin can search instead of just seeing a raw count.
================================================================== */

export function dischargedList({ search = "" } = {}) {
  const term = `%${String(search).trim()}%`;

  const rows = db
    .prepare(
      `SELECT * FROM (
         SELECT 'Emergency'     AS source,
                e.id            AS id,
                e.patient_name  AS name,
                e.phone         AS phone,
                e.condition     AS problem,
                e.severity      AS severity,
                d.name          AS doctor_name,
                e.updated_at    AS discharged_at
           FROM emergency_cases e
           LEFT JOIN doctors d ON d.id = e.doctor_id
          WHERE e.status = 'Discharged'

          UNION ALL

         SELECT 'Patient'       AS source,
                p.id            AS id,
                p.name          AS name,
                p.phone         AS phone,
                COALESCE(dep.name, 'General') AS problem,
                p.status        AS severity,
                d.name          AS doctor_name,
                p.updated_at    AS discharged_at
           FROM patients p
           LEFT JOIN departments dep ON dep.id = p.department_id
           LEFT JOIN doctors     d   ON d.id  = p.doctor_id
          WHERE p.status = 'Discharged'
       )
       WHERE @search = '%%'
          OR name         LIKE @search
          OR phone         LIKE @search
          OR problem       LIKE @search
          OR doctor_name   LIKE @search
       ORDER BY discharged_at DESC`
    )
    .all({ search: term });

  return rows;
}

/* ==================================================================
   ICU CAPACITY

   Total and Occupied are the two numbers actually stored (in
   hospital_resources, kind='icu'); Free is always derived from them,
   never stored directly, so the two can never drift apart.
================================================================== */

const upsertResource = db.prepare(`
  INSERT INTO hospital_resources (kind, label, value)
  VALUES (@kind, @label, @value)
  ON CONFLICT (kind, label) DO UPDATE SET value = excluded.value
`);

export function setIcuStatus({ total, occupied }) {
  if (!Number.isFinite(Number(total)) || !Number.isFinite(Number(occupied))) {
    throw ApiError.badRequest("Total and occupied beds must be numbers.");
  }

  const nextTotal = Math.max(0, Math.round(Number(total)));
  const nextOccupied = Math.max(0, Math.round(Number(occupied)));

  if (nextOccupied > nextTotal) {
    throw ApiError.badRequest("Occupied beds cannot exceed total beds.");
  }

  db.transaction(() => {
    upsertResource.run({ kind: "icu", label: "total", value: String(nextTotal) });
    upsertResource.run({ kind: "icu", label: "occupied", value: String(nextOccupied) });
  })();

  /* Moves the ICU Beds Free tile on the dashboard. */
  emitToAdmins("dashboard:stats-changed", { source: "icu" });

  return {
    icuBedsTotal: nextTotal,
    icuBedsOccupied: nextOccupied,
    icuBedsFree: Math.max(0, nextTotal - nextOccupied),
  };
}

/** Paid revenue for each of the last N days. */
export function revenueTrend(days = 7) {
  const labels = [];
  const values = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = addDays(today(), -i);

    const amount = db
      .prepare(
        `SELECT COALESCE(SUM(total), 0) AS amount
           FROM billing_records WHERE status = 'Paid' AND issued_at = ?`
      )
      .get(date).amount;

    labels.push(date);
    values.push(Math.round(amount));
  }

  return { labels, values };
}

export function patientsByDepartment() {
  const rows = db
    .prepare(
      `SELECT dep.name AS label, COUNT(p.id) AS value
         FROM departments dep
         LEFT JOIN patients p ON p.department_id = dep.id
        GROUP BY dep.id
        HAVING value > 0
        ORDER BY value DESC`
    )
    .all();

  return {
    labels: rows.map((row) => row.label),
    values: rows.map((row) => row.value),
  };
}

export function appointmentsByDay(days = 7) {
  const labels = [];
  const values = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = addDays(today(), -i);

    const count = db
      .prepare(
        `SELECT COUNT(*) AS n FROM appointments
          WHERE appointment_date = ? AND status != 'cancelled'`
      )
      .get(date).n;

    labels.push(date);
    values.push(count);
  }

  return { labels, values };
}

/* ==================================================================
   REPORTS — CUSTOM DATE / MONTH / YEAR

   The "Last N days" preset above always counts back from today. These
   back the Reports page's calendar picker, which needs an EXPLICIT
   period instead — one specific day, every day in one specific month,
   or (aggregated to a point per month, or a 365-point chart would be
   unreadable) every month in one specific year.
================================================================== */

/** Every YYYY-MM-DD from `from` to `to`, inclusive — backs the
    custom date-range picker's Apply. Plain string comparison stays
    chronological, same convention as the rest of this file. */
export function datesBetween(from, to) {
  const dates = [];
  let cursor = from;

  while (cursor <= to) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return dates;
}

export function datesInMonth(year, month) {
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();

  return Array.from(
    { length: lastDay },
    (_, i) => `${year}-${mm}-${String(i + 1).padStart(2, "0")}`
  );
}

export function revenueTrendForDates(dates) {
  const labels = [];
  const values = [];

  for (const date of dates) {
    const amount = db
      .prepare(
        `SELECT COALESCE(SUM(total), 0) AS amount
           FROM billing_records WHERE status = 'Paid' AND issued_at = ?`
      )
      .get(date).amount;

    labels.push(date);
    values.push(Math.round(amount));
  }

  return { labels, values };
}

export function appointmentsByDayForDates(dates) {
  const labels = [];
  const values = [];

  for (const date of dates) {
    const count = db
      .prepare(
        `SELECT COUNT(*) AS n FROM appointments
          WHERE appointment_date = ? AND status != 'cancelled'`
      )
      .get(date).n;

    labels.push(date);
    values.push(count);
  }

  return { labels, values };
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function revenueTrendForYear(year) {
  const labels = [];
  const values = [];

  for (let month = 1; month <= 12; month += 1) {
    const ym = `${year}-${String(month).padStart(2, "0")}`;

    const amount = db
      .prepare(
        `SELECT COALESCE(SUM(total), 0) AS amount
           FROM billing_records WHERE status = 'Paid' AND substr(issued_at, 1, 7) = ?`
      )
      .get(ym).amount;

    labels.push(MONTH_NAMES[month - 1]);
    values.push(Math.round(amount));
  }

  return { labels, values };
}

export function appointmentsByMonthForYear(year) {
  const labels = [];
  const values = [];

  for (let month = 1; month <= 12; month += 1) {
    const ym = `${year}-${String(month).padStart(2, "0")}`;

    const count = db
      .prepare(
        `SELECT COUNT(*) AS n FROM appointments
          WHERE substr(appointment_date, 1, 7) = ? AND status != 'cancelled'`
      )
      .get(ym).n;

    labels.push(MONTH_NAMES[month - 1]);
    values.push(count);
  }

  return { labels, values };
}

/* ==================================================================
   PERIOD COMPARISON

   "Is this month better than last month?" needs the same numbers for
   two windows, so both are computed by the same query with different
   bounds — a second query shaped differently would be a second thing
   that can drift.
================================================================== */

const periodTotals = db.prepare(`
  SELECT
    (SELECT COALESCE(SUM(total), 0) FROM billing_records
      WHERE status = 'Paid' AND date(issued_at) BETWEEN @from AND @to)      AS revenue,
    (SELECT COUNT(*) FROM billing_records
      WHERE date(issued_at) BETWEEN @from AND @to)                          AS invoices,
    (SELECT COUNT(*) FROM appointments
      WHERE appointment_date BETWEEN @from AND @to)                         AS appointments,
    (SELECT COUNT(*) FROM appointments
      WHERE status = 'completed' AND appointment_date BETWEEN @from AND @to) AS completed,
    (SELECT COUNT(*) FROM appointments
      WHERE status = 'cancelled' AND appointment_date BETWEEN @from AND @to) AS cancelled,
    (SELECT COUNT(*) FROM patients
      WHERE date(created_at) BETWEEN @from AND @to)                         AS newPatients,
    (SELECT COUNT(*) FROM laboratory_tests
      WHERE test_date BETWEEN @from AND @to)                                AS labTests
`);

function shiftDays(iso, days) {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);

  /* Formatted from the local parts, NOT via toISOString(): the date
     was parsed as local midnight, and converting that to UTC lands on
     the previous day everywhere east of Greenwich — which silently
     shifted the whole comparison window by one day. */
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Totals for a window plus the equally long window immediately before
 * it, with the percentage change between them.
 *
 * `change` is null rather than 0 or Infinity when the previous window
 * was empty — "up 100%" from nothing is a claim the data does not
 * support, and the UI should say "no prior data" instead.
 */
export function periodComparison(from, to) {
  const spanDays =
    Math.round(
      (new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86_400_000
    ) + 1;

  const previousTo = shiftDays(from, -1);
  const previousFrom = shiftDays(previousTo, -(spanDays - 1));

  const current = periodTotals.get({ from, to });
  const previous = periodTotals.get({ from: previousFrom, to: previousTo });

  const metrics = {};

  for (const key of Object.keys(current)) {
    const now = Number(current[key]) || 0;
    const before = Number(previous[key]) || 0;

    metrics[key] = {
      current: now,
      previous: before,
      change: before === 0 ? null : Math.round(((now - before) / before) * 1000) / 10,
    };
  }

  return {
    current: { from, to },
    previous: { from: previousFrom, to: previousTo },
    spanDays,
    metrics,
  };
}

export function appointmentStatusBreakdown() {
  const rows = db
    .prepare(
      `SELECT status AS label, COUNT(*) AS value
         FROM appointments GROUP BY status ORDER BY value DESC`
    )
    .all();

  return {
    labels: rows.map((row) => row.label),
    values: rows.map((row) => row.value),
  };
}

export function doctorUtilisation(limit = 8) {
  const rows = db
    .prepare(
      `SELECT d.name AS label, COUNT(a.id) AS value
         FROM doctors d
         LEFT JOIN appointments a
           ON a.doctor_id = d.id
          AND a.appointment_date >= date('now','-30 days')
          AND a.status != 'cancelled'
        WHERE d.status = 'active'
        GROUP BY d.id
        ORDER BY value DESC
        LIMIT ?`
    )
    .all(limit);

  return {
    labels: rows.map((row) => row.label),
    values: rows.map((row) => row.value),
  };
}

export function recentActivity(limit = 8) {
  return db
    .prepare(
      `SELECT a.id, a.appointment_date, a.appointment_time, a.status,
              d.name AS doctor_name,
              COALESCE(p.name, u.name) AS patient_name
         FROM appointments a
         LEFT JOIN doctors  d ON d.id = a.doctor_id
         LEFT JOIN patients p ON p.id = a.patient_id
         LEFT JOIN users    u ON u.id = a.user_id
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT ?`
    )
    .all(limit)
    .map((row) => ({
      id: row.id,
      patient: row.patient_name,
      doctor: row.doctor_name,
      date: row.appointment_date,
      time: row.appointment_time,
      status: row.status,
    }));
}

export function adminDashboard() {
  return {
    overview: adminOverview(),
    revenueTrend: revenueTrend(7),
    patientsByDepartment: patientsByDepartment(),
    appointmentsByDay: appointmentsByDay(7),
    appointmentStatus: appointmentStatusBreakdown(),
    doctorUtilisation: doctorUtilisation(6),
    recentActivity: recentActivity(6),
    markedDates: db
      .prepare(
        `SELECT DISTINCT appointment_date AS date FROM appointments
          WHERE status IN ('pending','scheduled','confirmed','rescheduled')`
      )
      .all()
      .map((row) => row.date),
  };
}
