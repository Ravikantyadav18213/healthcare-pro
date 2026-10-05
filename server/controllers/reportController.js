import { Readable } from "node:stream";

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
    reports: await reports.listReports({
      userId: req.user.id,
      search: req.query.search || "",
      status: req.query.status || "",
      type: req.query.type || "",
    }),
    stats: await reports.reportStats(req.user.id),
  });
});

/* ==================================================================
   ADMIN — every report
================================================================== */

export const listAll = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    reports: await reports.listReports({
      search: req.query.search || "",
      status: req.query.status || "",
      type: req.query.type || "",
    }),
    stats: await reports.reportStats(),
  });
});

/* Ownership is enforced inside the service for both roles. */
export const getOne = asyncHandler(async (req, res) => {
  res.json({ success: true, report: await reports.getReport(req.params.id, req.user) });
});

export const download = asyncHandler(async (req, res) => {
  const row = await reports.getOwnedReport(req.params.id, req.user);
  const stored = await reports.resolveReportFile(row);

  await audit(req, "report_downloaded", {
    entity: "report",
    entityId: row.id,
    details: `Downloaded "${row.title}".`,
  });

  const filename = String(row.file_name || `report-${row.id}`).replace(/"/g, "");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  if (stored.contentLength) res.setHeader("Content-Length", stored.contentLength);

  const nodeStream =
    typeof stored.stream.pipe === "function" ? stored.stream : Readable.fromWeb(stored.stream);
  nodeStream.pipe(res);
});

export const create = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    userId: rules.integer({ min: 1, label: "Patient account" }),
    title: rules.string({ min: 3, max: 120, label: "Report title" }),
    type: rules.string({ min: 2, max: 40, label: "Report type" }),
    reportDate: rules.date({ label: "Report date" }),
  });

  const report = await reports.createReport(
    req.user,
    req.body,
    describeUpload(req.file)
  );

  await audit(req, "report_created", {
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

  const report = await reports.updateReport(req.params.id, req.body);

  await audit(req, "report_updated", {
    entity: "report",
    entityId: report.id,
    details: `Updated report "${report.title}".`,
  });

  res.json({ success: true, report });
});

export const remove = asyncHandler(async (req, res) => {
  const removed = await reports.deleteReport(req.params.id);

  await audit(req, "report_deleted", {
    entity: "report",
    entityId: removed.id,
    details: `Deleted report "${removed.title}".`,
  });

  res.json({ success: true, message: "Report deleted." });
});
