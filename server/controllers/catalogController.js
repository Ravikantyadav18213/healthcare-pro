import asyncHandler from "../utils/asyncHandler.js";
import audit from "../utils/audit.js";
import ApiError from "../utils/ApiError.js";
import { validate, rules } from "../validators/index.js";
import * as catalog from "../services/catalogService.js";
import * as stats from "../services/statsService.js";
import * as notifications from "../services/notificationService.js";
import { DATE_RE } from "../utils/time.js";
import { buildAnalyticsPdf } from "../utils/pdf.js";

/* ==================================================================
   DEPARTMENTS
================================================================== */

export const listDepartments = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    departments: catalog.listDepartments({
      includeInactive:
        req.user?.role === "admin" && req.query.includeInactive === "true",
    }),
  });
});

export const createDepartment = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    name: rules.string({ min: 2, max: 60, label: "Department name" }),
  });

  const department = catalog.createDepartment(req.body);

  audit(req, "department_created", {
    entity: "department",
    entityId: department.id,
    details: `Added department ${department.name}.`,
  });

  res.status(201).json({ success: true, department });
});

export const updateDepartment = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    name: rules.string({ min: 2, max: 60, label: "Department name" }),
  });

  const department = catalog.updateDepartment(req.params.id, req.body);

  audit(req, "department_updated", {
    entity: "department",
    entityId: department.id,
  });

  res.json({ success: true, department });
});

export const removeDepartment = asyncHandler(async (req, res) => {
  const removed = catalog.deleteDepartment(req.params.id);

  audit(req, "department_deleted", {
    entity: "department",
    entityId: removed.id,
    details: `Deleted department ${removed.name}.`,
  });

  res.json({ success: true, message: `${removed.name} removed.` });
});

/* ==================================================================
   PHARMACY
================================================================== */

export const listPharmacy = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    items: catalog.listPharmacy({
      search: req.query.search || "",
      category: req.query.category || "",
    }),
  });
});

export const createPharmacyItem = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    name: rules.string({ min: 2, max: 80, label: "Item name" }),
    stock: rules.integer({ min: 0, required: false, label: "Stock" }),
  });

  const item = catalog.createPharmacyItem(req.body);

  audit(req, "pharmacy_item_created", {
    entity: "pharmacy_item",
    entityId: item.id,
    details: `Added ${item.name}.`,
  });

  res.status(201).json({ success: true, item });
});

export const updatePharmacyItem = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    name: rules.string({ min: 2, max: 80, label: "Item name" }),
  });

  const item = catalog.updatePharmacyItem(req.params.id, req.body);

  audit(req, "pharmacy_item_updated", {
    entity: "pharmacy_item",
    entityId: item.id,
  });

  res.json({ success: true, item });
});

export const removePharmacyItem = asyncHandler(async (req, res) => {
  const removed = catalog.deletePharmacyItem(req.params.id);

  audit(req, "pharmacy_item_deleted", {
    entity: "pharmacy_item",
    entityId: removed.id,
  });

  res.json({ success: true, message: `${removed.name} removed.` });
});

/* ==================================================================
   LABORATORY
================================================================== */

export const listLab = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    tests: catalog.listLabTests({
      search: req.query.search || "",
      status: req.query.status || "",
    }),
  });
});

export const createLabTest = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    patient: rules.string({ min: 2, max: 80, label: "Patient" }),
    test: rules.string({ min: 2, max: 120, label: "Test name" }),
  });

  const test = catalog.createLabTest(req.body);

  audit(req, "lab_test_created", {
    entity: "lab_test",
    entityId: test.id,
    details: `${test.test} for ${test.patient}.`,
  });

  res.status(201).json({ success: true, test });
});

export const updateLabTest = asyncHandler(async (req, res) => {
  const test = catalog.updateLabTest(req.params.id, req.body || {});

  audit(req, "lab_test_updated", { entity: "lab_test", entityId: test.id });

  res.json({ success: true, test });
});

export const removeLabTest = asyncHandler(async (req, res) => {
  const removed = catalog.deleteLabTest(req.params.id);

  audit(req, "lab_test_deleted", { entity: "lab_test", entityId: removed.id });

  res.json({ success: true, message: "Test removed." });
});

/* ==================================================================
   BILLING
================================================================== */

export const listBilling = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    ...catalog.listBilling({
      search: req.query.search || "",
      status: req.query.status || "",
    }),
  });
});

export const createInvoice = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    patient: rules.string({ min: 2, max: 80, label: "Patient" }),
    amount: rules.integer({ min: 0, label: "Amount" }),
  });

  const invoice = catalog.createInvoice(req.body);

  audit(req, "invoice_created", {
    entity: "invoice",
    entityId: invoice.id,
    details: `${invoice.invoiceNo} for ${invoice.patient}.`,
  });

  res.status(201).json({ success: true, invoice });
});

export const updateInvoice = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    amount: rules.integer({ min: 0, label: "Amount" }),
  });

  const invoice = catalog.updateInvoice(req.params.id, req.body);

  audit(req, "invoice_updated", {
    entity: "invoice",
    entityId: invoice.id,
    details: `${invoice.invoiceNo} edited.`,
  });

  res.json({ success: true, invoice });
});

export const updateInvoiceStatus = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    status: rules.oneOf(["Pending", "Paid", "Cancelled"], { label: "Status" }),
  });

  const invoice = catalog.updateInvoiceStatus(req.params.id, req.body.status);

  audit(req, "invoice_status_changed", {
    entity: "invoice",
    entityId: invoice.id,
    details: `${invoice.invoiceNo} marked ${invoice.status}.`,
  });

  res.json({ success: true, invoice });
});

/* ==================================================================
   EMERGENCY
================================================================== */

export const emergencyOverview = asyncHandler(async (req, res) => {
  res.json({ success: true, ...catalog.emergencyOverview() });
});

export const createEmergencyCase = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    name: rules.string({ min: 2, max: 80, label: "Patient name" }),
    severity: rules.oneOf(["Critical", "Serious", "Stable"], {
      required: false,
      label: "Severity",
    }),
  });

  const created = catalog.createEmergencyCase(req.body);

  audit(req, "emergency_case_created", {
    entity: "emergency_case",
    entityId: created.id,
    details: `${created.name} — ${created.severity}.`,
  });

  res.status(201).json({ success: true, case: created });
});

export const updateEmergencyCase = asyncHandler(async (req, res) => {
  const updated = catalog.updateEmergencyCase(req.params.id, req.body || {});

  audit(req, "emergency_case_updated", {
    entity: "emergency_case",
    entityId: updated.id,
  });

  res.json({ success: true, case: updated });
});

/* ==================================================================
   AUDIT LOG
================================================================== */

export const listAudit = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    logs: catalog.listAuditLogs({
      search: req.query.search || "",
      action: req.query.action || "",
      limit: req.query.limit,
    }),
  });
});

/* ==================================================================
   DASHBOARD ANALYTICS
================================================================== */

export const adminDashboard = asyncHandler(async (req, res) => {
  res.json({ success: true, ...stats.adminDashboard() });
});

export const updateIcuStatus = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    total: rules.integer({ min: 0, max: 10000, label: "Total beds" }),
    occupied: rules.integer({ min: 0, max: 10000, label: "Occupied beds" }),
  });

  const icu = stats.setIcuStatus(req.body);

  audit(req, "icu_capacity_updated", {
    entity: "hospital_resources",
    details: `ICU capacity set to ${icu.icuBedsOccupied}/${icu.icuBedsTotal} occupied.`,
  });

  res.json({ success: true, icu });
});

export const dischargedList = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    items: stats.dischargedList({ search: req.query.search || "" }),
  });
});

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const YEAR_RE = /^\d{4}$/;

/**
 * First and last real calendar date in a trend's labels.
 *
 * Returns nulls when the labels are not dates (the month and year
 * modes label by "Jan", "Feb", ...), which is the caller's signal
 * that a like-for-like comparison cannot be drawn.
 */
function trendWindow(trend) {
  const dates = (trend?.labels || []).filter((label) => DATE_RE.test(label)).sort();

  return { from: dates[0] || null, to: dates.at(-1) || null };
}

export const hospitalReports = asyncHandler(async (req, res) => {
  const { mode, date, month, year, from, to } = req.query;

  let revenueTrend;
  let appointmentsByDay;
  let periodLabel = `Last ${Number(req.query.days) || 14} Days`;

  if (mode === "date" && DATE_RE.test(date || "")) {
    revenueTrend = stats.revenueTrendForDates([date]);
    appointmentsByDay = stats.appointmentsByDayForDates([date]);
    periodLabel = date;
  } else if (mode === "range" && DATE_RE.test(from || "") && DATE_RE.test(to || "")) {
    if (from > to) {
      throw ApiError.badRequest("Start date must be on or before the end date.");
    }

    const dates = stats.datesBetween(from, to);
    if (dates.length > 366) {
      throw ApiError.badRequest("Custom date ranges cannot exceed 366 days.");
    }

    revenueTrend = stats.revenueTrendForDates(dates);
    appointmentsByDay = stats.appointmentsByDayForDates(dates);
    periodLabel = `${from} to ${to}`;
  } else if (mode === "month" && MONTH_RE.test(month || "")) {
    const [y, m] = month.split("-").map(Number);
    const dates = stats.datesInMonth(y, m);
    revenueTrend = stats.revenueTrendForDates(dates);
    appointmentsByDay = stats.appointmentsByDayForDates(dates);
    periodLabel = new Date(`${month}-01T00:00:00`).toLocaleString("en-IN", {
      month: "long",
      year: "numeric",
    });
  } else if (mode === "year" && YEAR_RE.test(year || "")) {
    revenueTrend = stats.revenueTrendForYear(Number(year));
    appointmentsByDay = stats.appointmentsByMonthForYear(Number(year));
    periodLabel = year;
  } else {
    const days = Number(req.query.days) || 14;
    revenueTrend = stats.revenueTrend(days);
    appointmentsByDay = stats.appointmentsByDay(days);
    periodLabel = `Last ${days} Days`;
  }

  /* The trend's own labels already carry the resolved window,
     whichever mode produced them — deriving the comparison bounds
     from those keeps this in step with the charts instead of
     re-parsing the query. Year and month modes label by period rather
     than by date, so those simply get no comparison. */
  const { from: windowFrom, to: windowTo } = trendWindow(revenueTrend);

  const comparison =
    windowFrom && windowTo ? stats.periodComparison(windowFrom, windowTo) : null;

  res.json({
    success: true,
    overview: stats.adminOverview(),
    revenueTrend,
    patientsByDepartment: stats.patientsByDepartment(),
    appointmentsByDay,
    appointmentStatus: stats.appointmentStatusBreakdown(),
    doctorUtilisation: stats.doctorUtilisation(10),
    comparison,
    periodLabel,
  });
});

/* ==================================================================
   ANALYTICS PDF

   Same numbers as the JSON endpoint, laid out as a document the
   hospital can file or email.
================================================================== */

export const hospitalReportsPdf = asyncHandler(async (req, res) => {
  const days = Number(req.query.days) || 14;

  const from = req.query.from;
  const to = req.query.to;

  const useRange = DATE_RE.test(from || "") && DATE_RE.test(to || "");

  const trend = useRange
    ? stats.revenueTrendForDates(stats.datesBetween(from, to))
    : stats.revenueTrend(days);

  const { from: windowFrom, to: windowTo } = trendWindow(trend);

  const overview = stats.adminOverview();
  const comparison =
    windowFrom && windowTo ? stats.periodComparison(windowFrom, windowTo) : null;

  const money = (value) => `INR ${Number(value || 0).toLocaleString("en-IN")}`;

  const sections = [
    {
      heading: "Overview",
      rows: [
        ["Total patients", overview.totalPatients],
        ["Total doctors", overview.totalDoctors],
        ["Appointments today", overview.appointmentsToday],
        ["Revenue collected", money(overview.revenueCollected ?? overview.totalRevenue)],
      ],
    },
  ];

  if (comparison) {
    const delta = (metric) =>
      metric.change === null
        ? `${metric.current} (no prior data)`
        : `${metric.current} (${metric.change > 0 ? "+" : ""}${metric.change}% vs previous)`;

    sections.push({
      heading: `This period vs previous ${comparison.spanDays} day(s)`,
      rows: [
        ["Revenue", comparison.metrics.revenue.change === null
          ? money(comparison.metrics.revenue.current)
          : `${money(comparison.metrics.revenue.current)} (${comparison.metrics.revenue.change > 0 ? "+" : ""}${comparison.metrics.revenue.change}%)`],
        ["Appointments", delta(comparison.metrics.appointments)],
        ["Completed", delta(comparison.metrics.completed)],
        ["Cancelled", delta(comparison.metrics.cancelled)],
        ["New patients", delta(comparison.metrics.newPatients)],
        ["Lab tests", delta(comparison.metrics.labTests)],
        ["Previous window", `${comparison.previous.from} to ${comparison.previous.to}`],
      ],
    });
  }

  /* The chart series are {labels, values} pairs; the PDF wants rows. */
  const asRows = (series) =>
    (series?.labels || []).map((label, index) => [label, series.values?.[index] ?? 0]);

  const tables = [
    {
      heading: "Patients by department",
      columns: ["Department", "Patients"],
      rows: asRows(stats.patientsByDepartment()),
    },
    {
      heading: "Doctor utilisation",
      columns: ["Doctor", "Appointments"],
      rows: asRows(stats.doctorUtilisation(10)),
    },
  ];

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="hospital-report-${windowFrom || "latest"}.pdf"`
  );

  buildAnalyticsPdf(res, {
    title: "Hospital Analytics Report",
    subtitle: windowFrom ? `${windowFrom} to ${windowTo}` : `Last ${days} days`,
    sections,
    tables,
  });
});

/* ==================================================================
   NOTIFICATIONS
================================================================== */

export const listNotifications = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    ...notifications.listNotifications(req.user.id, {
      limit: req.query.limit,
      unreadOnly: req.query.unreadOnly === "true",
    }),
  });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  notifications.markRead(req.user.id, req.params.id);
  res.json({ success: true, unread: notifications.unreadCount(req.user.id) });
});

export const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const changed = notifications.markAllRead(req.user.id);
  res.json({ success: true, updated: changed, unread: 0 });
});
