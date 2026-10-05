import asyncHandler from "../utils/asyncHandler.js";
import audit from "../utils/audit.js";
import { validate, rules } from "../validators/index.js";
import * as users from "../services/userService.js";
import * as staff from "../services/staffService.js";

export const list = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    users: await users.listUsers({
      search: req.query.search || "",
      status: req.query.status || "",
      role: req.query.role || "",
    }),
    stats: await users.userStats(),
  });
});

export const stats = asyncHandler(async (req, res) => {
  res.json({ success: true, stats: await users.userStats() });
});

export const getOne = asyncHandler(async (req, res) => {
  res.json({ success: true, user: await users.getUserById(req.params.id) });
});

export const history = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    user: await users.getUserById(req.params.id),
    ...(await users.userHistory(req.params.id)),
  });
});

export const setStatus = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    status: rules.oneOf(["active", "inactive"], { label: "Status" }),
  });

  const user = await users.setUserStatus(req.user, req.params.id, req.body.status);

  await audit(req, user.status === "active" ? "user_activated" : "user_deactivated", {
    entity: "user",
    entityId: user.id,
    details: `${user.name} (${user.email}) set to ${user.status}.`,
  });

  res.json({ success: true, user });
});

/* ==================================================================
   STAFF DIRECTORY (nurses, receptionists)
================================================================== */

export const listStaff = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    staff: await staff.listStaff({
      search: req.query.search || "",
      role: req.query.role || "",
      departmentId: req.query.departmentId || "",
    }),
    stats: await staff.staffStats(),
  });
});

export const createStaff = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    name: rules.string({ min: 2, max: 80, label: "Name" }),
    email: rules.email,
    password: rules.password,
    role: rules.oneOf(staff.STAFF_ROLES, { label: "Role" }),
  });

  const created = await staff.createStaff(req.body);

  await audit(req, "staff_created", {
    entity: "user",
    entityId: created.id,
    details: `${created.name} added as ${created.role}.`,
  });

  res.status(201).json({ success: true, staff: created });
});

export const updateStaffDepartment = asyncHandler(async (req, res) => {
  const updated = await staff.setStaffDepartment(req.params.id, req.body?.departmentId ?? null);

  await audit(req, "staff_department_changed", {
    entity: "user",
    entityId: updated.id,
    details: `${updated.name} → ${updated.departmentName || "unassigned"}.`,
  });

  res.json({ success: true, staff: updated });
});

export const updateStaffWard = asyncHandler(async (req, res) => {
  const updated = await staff.setStaffWard(req.params.id, req.body?.wardId ?? null);

  await audit(req, "staff_ward_changed", {
    entity: "user",
    entityId: updated.id,
    details: `${updated.name} → ${updated.assignedWardName || "unassigned"}.`,
  });

  res.json({ success: true, staff: updated });
});

export const updateStaffDuty = asyncHandler(async (req, res) => {
  validate(req.body || {}, {
    dutyStatus: rules.oneOf(staff.DUTY_STATUSES, { label: "Duty status" }),
  });

  const updated = await staff.setStaffDuty(req.params.id, req.body.dutyStatus);

  await audit(req, "staff_duty_changed", {
    entity: "user",
    entityId: updated.id,
    details: `${updated.name} → ${updated.dutyStatus}.`,
  });

  res.json({ success: true, staff: updated });
});
