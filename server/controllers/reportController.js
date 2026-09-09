import asyncHandler from "../utils/asyncHandler.js";
import audit from "../utils/audit.js";
import { validate, rules } from "../validators/index.js";
import { describeUpload } from "../middleware/upload.js";
import * as reports from "../services/reportService.js";

/* ==================================================================
   USER — own reports only
================================================================== */

export const listMine = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    reports: reports.listReports({
      userId: req.user.id,
      search: req.query.search || "",
      status: req.query.status || "",
      type: req.query.type || "",
    }),
    stats: reports.reportStats(req.user.id),
  });
});

/* ==================================================================
   ADMIN — every report
================================================================== */

export const listAll = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    reports: reports.listReports({
      search: req.query.search || "",
      status: req.query.status || "",
      type: req.query.type || "",
    }),
    stats: reports.reportStats(),
  });
});

/* Ownership is enforced inside the service for both roles. */
export const getOne = asyncHandler(async (req, res) => {
  res.json({ success: true, report: reports.getReport(req.params.id, req.user) });
});

export const download = asyncHandler(async (req, res) => {
  const row = reports.getOwnedReport(req.params.id, req.user);
  const absolute = reports.resolveReportFile(row);

  audit(req, "report_downloaded", {
    entity: "report",
    entityId: row.id,
    details: `Downloaded "${row.title}".`,
  });

  res.download(absolute, row.file_name || `report-${row.id}`);
});

export const create = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    userId: rules.integer({ min: 1, label: "Patient account" }),
    title: rules.string({ min: 3, max: 120, label: "Report title" }),
    type: rules.string({ min: 2, max: 40, label: "Report type" }),
    reportDate: rules.date({ label: "Report date" }),
  });

  const report = reports.createReport(
    req.user,
    req.body,
    describeUpload(req.file)
  );

  audit(req, "report_created", {
    entity: "report",
    entityId: report.id,
    details: `Created report "${report.title}" for user #${report.userId}.`,
  });

  res.status(201).json({ success: true, report });
});

export const update = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    title: rules.string({ min: 3, max: 120, label: "Report title" }),
  });

  const report = reports.updateReport(req.params.id, req.body);

  audit(req, "report_updated", {
    entity: "report",
    entityId: report.id,
    details: `Updated report "${report.title}".`,
  });

  res.json({ success: true, report });
});

export const remove = asyncHandler(async (req, res) => {
  const removed = reports.deleteReport(req.params.id);

  audit(req, "report_deleted", {
    entity: "report",
    entityId: removed.id,
    details: `Deleted report "${removed.title}".`,
  });

  res.json({ success: true, message: "Report deleted." });
});
