import React, { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiPlus,
  FiSearch,
  FiRefreshCw,
  FiUsers,
  FiUserCheck,
  FiPhone,
  FiMail,
  FiToggleLeft,
  FiToggleRight,
  FiLayers,
} from "react-icons/fi";

import { staffService, departmentService } from "../services/adminService.js";
import { wardService } from "../services/clinicalService.js";
import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";
import { useDebouncedValue } from "../hooks/useApi.js";
import { Modal } from "../components/ui/Modal.jsx";
import { Alert, EmptyState, ErrorState, Spinner } from "../components/ui/States.jsx";
import { Skeleton } from "../components/ui/Skeleton.jsx";
import SelectDropdown from "../components/ui/SelectDropdown.jsx";
import { padRefresh } from "../utils/timing.js";
import { roleLabel } from "../constants/roles.js";

/* ==================================================================
   STAFF DIRECTORY (nurses, receptionists)

   The one thing this page exists to answer at a glance: who is
   actually here right now, and covering which department. Everything
   else — creating an account, moving someone between departments —
   flows from that same view rather than a separate admin screen,
   since "who's on the floor" and "who works here at all" are the
   same question on a slow front desk.
================================================================== */

const DUTY_STATUSES = ["On Duty", "Off Duty", "On Leave"];

/* The stored duty value stays English — only the rendered label is
   translated, so what is sent to the API never changes. */
const DUTY_KEYS = {
  "On Duty": "staff.duty.onDuty",
  "Off Duty": "staff.duty.offDuty",
  "On Leave": "staff.duty.onLeave",
};

const DUTY_TONE = {
  "On Duty": "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  "Off Duty": "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  "On Leave": "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
};

const ROLE_TONE = {
  nurse: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  receptionist: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
};

const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
  password: "",
  role: "nurse",
  departmentId: "",
};

export default function Staff() {
  const { search: navbarSearch } = useOutletContext() || {};
  const toast = useToast();
  const t = useT();

  const dutyLabel = (value) => (DUTY_KEYS[value] ? t(DUTY_KEYS[value], value) : value);

  const [staff, setStaff] = useState([]);
  const [stats, setStats] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [wards, setWards] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [localSearch, setLocalSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  /* Which row has a save in flight, so only that row's dropdown shows
     a spinner instead of the whole table locking up. */
  const [rowBusy, setRowBusy] = useState(null);

  const term = useDebouncedValue(localSearch || navbarSearch || "", 350);

  useEffect(() => {
    departmentService
      .list()
      .then((data) => setDepartments(data.departments))
      .catch(() => setDepartments([]));

    wardService
      .list()
      .then((data) => setWards(data.wards))
      .catch(() => setWards([]));
  }, []);

  const load = useCallback(
    async (isRefresh = false) => {
      const startedAt = Date.now();
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      setError(null);

      try {
        const data = await staffService.list({
          search: term,
          role: roleFilter === "All" ? "" : roleFilter,
        });
        setStaff(data.staff);
        setStats(data.stats);
      } catch (caught) {
        setError(caught);
      } finally {
        await padRefresh(isRefresh, startedAt);
        setLoading(false);
        setRefreshing(false);
      }
    },
    [term, roleFilter]
  );

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError("");
    setFieldErrors({});
    setModalOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    setFieldErrors({});

    try {
      const created = await staffService.create(form);
      toast.success(`${created.staff.name} added as ${roleLabel(created.staff.role)}.`);
      setModalOpen(false);
      load(true);
    } catch (caught) {
      setFieldErrors(caught?.errors || {});
      setFormError(caught.message);
    } finally {
      setSaving(false);
    }
  };

  const changeDepartment = async (member, departmentId) => {
    setRowBusy(member.id);

    try {
      await staffService.setDepartment(member.id, departmentId || null);
      toast.success(`${member.name} moved to ${
        departments.find((d) => String(d.id) === departmentId)?.name || "unassigned"
      }.`);
      load(true);
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setRowBusy(null);
    }
  };

  const changeWard = async (member, wardId) => {
    setRowBusy(member.id);

    try {
      await staffService.setWard(member.id, wardId || null);
      toast.success(`${member.name} assigned to ${
        wards.find((w) => String(w.id) === wardId)?.name || "no ward"
      }.`);
      load(true);
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setRowBusy(null);
    }
  };

  const changeDuty = async (member, dutyStatus) => {
    setRowBusy(member.id);

    try {
      await staffService.setDuty(member.id, dutyStatus);
      load(true);
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setRowBusy(null);
    }
  };

  const toggleAccountStatus = async (member) => {
    setRowBusy(member.id);
    const next = member.status === "active" ? "inactive" : "active";

    try {
      await staffService.setStatus(member.id, next);
      toast.success(`${member.name} ${next === "active" ? "enabled" : "disabled"}.`);
      load(true);
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setRowBusy(null);
    }
  };

  if (error) {
    return (
      <div className="glass-card">
        <ErrorState error={error} onRetry={() => load()} />
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ============ HEADER ============ */}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold">{t("staff.title", "Staff Directory")}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t(
              "staff.subtitle",
              "Nurses and receptionists — who's covering what, right now."
            )}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={localSearch}
              onChange={(event) => setLocalSearch(event.target.value)}
              placeholder={t("staff.searchPlaceholder", "Search name, email, phone")}
              aria-label="Search staff"
              className="input-field input-icon w-full sm:w-56"
            />
          </div>

          <SelectDropdown
            value={roleFilter}
            onChange={setRoleFilter}
            options={[
              { value: "All", label: t("staff.filter.allRoles", "All roles") },
              { value: "nurse", label: t("staff.nurses", "Nurses") },
              { value: "receptionist", label: t("staff.receptionists", "Receptionists") },
            ]}
            ariaLabel="Filter by role"
            className="w-full sm:w-40"
          />

          <button
            type="button"
            onClick={() => load(true)}
            aria-label="Refresh staff directory"
            className="btn-secondary text-sm inline-flex items-center justify-center gap-2"
          >
            <FiRefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          </button>

          <button
            type="button"
            onClick={openCreate}
            className="btn-primary text-sm inline-flex items-center justify-center gap-2"
          >
            <FiPlus size={16} />
            {t("staff.addStaff", "Add Staff")}
          </button>
        </div>
      </motion.div>

      {/* ============ STATS ============ */}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={FiUsers}
          label={t("staff.stat.totalStaff", "Total Staff")}
          value={stats?.total}
          loading={loading}
          tone="brand"
        />
        <StatCard
          icon={FiUserCheck}
          label={t("staff.nurses", "Nurses")}
          value={stats?.nurses}
          loading={loading}
          tone="sky"
        />
        <StatCard
          icon={FiUserCheck}
          label={t("staff.receptionists", "Receptionists")}
          value={stats?.receptionists}
          loading={loading}
          tone="purple"
        />
        <StatCard
          icon={FiToggleRight}
          label={t("staff.duty.onDuty", "On Duty")}
          value={stats?.onDuty}
          loading={loading}
          tone="emerald"
        />
      </div>

      {/* ============ LIST ============ */}

      {loading ? (
        <div className="glass-card space-y-3">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : staff.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={FiUsers}
            title={
              term || roleFilter !== "All"
                ? t("staff.empty.noMatches", "No matching staff")
                : t("staff.empty.title", "No staff yet")
            }
            description={
              term || roleFilter !== "All"
                ? t("staff.empty.noMatchesDescription", "Try a different search or filter.")
                : t(
                    "staff.empty.description",
                    "Add the hospital's nurses and receptionists here."
                  )
            }
            action={openCreate}
            actionLabel={t("staff.addStaff", "Add Staff")}
          />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block glass-card !p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-4 py-3">{t("label.name", "Name")}</th>
                    <th className="px-4 py-3">{t("label.role", "Role")}</th>
                    <th className="px-4 py-3">{t("label.department", "Department")}</th>
                    <th className="px-4 py-3">{t("staff.col.ward", "Ward")}</th>
                    <th className="px-4 py-3">
                      {t("staff.col.dutyStatus", "Duty status")}
                    </th>
                    <th className="px-4 py-3">{t("staff.col.account", "Account")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {staff.map((member) => (
                    <tr key={member.id} className={member.status === "inactive" ? "opacity-50" : ""}>
                      <td className="px-4 py-3">
                        <p className="font-semibold">{member.name}</p>
                        <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <FiMail size={11} />
                          {member.email}
                        </p>
                        {member.phone && (
                          <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <FiPhone size={11} />
                            {member.phone}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${ROLE_TONE[member.role]}`}>{roleLabel(member.role)}</span>
                      </td>
                      <td className="px-4 py-3 min-w-[160px]">
                        <SelectDropdown
                          value={member.departmentId ? String(member.departmentId) : ""}
                          onChange={(value) => changeDepartment(member, value)}
                          disabled={rowBusy === member.id || member.status === "inactive"}
                          options={[
                            { value: "", label: t("label.unassigned", "Unassigned") },
                            ...departments.map((d) => ({ value: String(d.id), label: d.name })),
                          ]}
                          ariaLabel={`Department for ${member.name}`}
                          className="w-full"
                        />
                      </td>
                      <td className="px-4 py-3 min-w-[160px]">
                        {member.role === "nurse" ? (
                          <SelectDropdown
                            value={member.assignedWardId ? String(member.assignedWardId) : ""}
                            onChange={(value) => changeWard(member, value)}
                            disabled={rowBusy === member.id || member.status === "inactive"}
                            options={[
                              { value: "", label: t("staff.allWards", "All wards") },
                              ...wards.map((w) => ({ value: String(w.id), label: w.name })),
                            ]}
                            ariaLabel={`Ward for ${member.name}`}
                            className="w-full"
                          />
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 min-w-[140px]">
                        <SelectDropdown
                          value={member.dutyStatus}
                          onChange={(value) => changeDuty(member, value)}
                          disabled={rowBusy === member.id || member.status === "inactive"}
                          options={DUTY_STATUSES.map((s) => ({ value: s, label: dutyLabel(s) }))}
                          ariaLabel={`Duty status for ${member.name}`}
                          className="w-full"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleAccountStatus(member)}
                          disabled={rowBusy === member.id}
                          aria-label={`${member.status === "active" ? "Disable" : "Enable"} ${member.name}`}
                          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition disabled:opacity-60 ${
                            member.status === "active"
                              ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300"
                              : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
                          }`}
                        >
                          {rowBusy === member.id ? (
                            <Spinner size={12} />
                          ) : member.status === "active" ? (
                            <FiToggleRight size={14} />
                          ) : (
                            <FiToggleLeft size={14} />
                          )}
                          {member.status === "active"
                            ? t("label.active", "Active")
                            : t("staff.disabled", "Disabled")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {staff.map((member, index) => (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.2) }}
                className={`glass-card ${member.status === "inactive" ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{member.name}</p>
                    <p className="text-xs text-slate-400 truncate">{member.email}</p>
                  </div>
                  <span className={`badge shrink-0 ${ROLE_TONE[member.role]}`}>{roleLabel(member.role)}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <p className="text-[11px] text-slate-400 mb-1 flex items-center gap-1">
                      <FiLayers size={11} />
                      {t("label.department", "Department")}
                    </p>
                    <SelectDropdown
                      value={member.departmentId ? String(member.departmentId) : ""}
                      onChange={(value) => changeDepartment(member, value)}
                      disabled={rowBusy === member.id || member.status === "inactive"}
                      options={[
                        { value: "", label: t("label.unassigned", "Unassigned") },
                        ...departments.map((d) => ({ value: String(d.id), label: d.name })),
                      ]}
                      ariaLabel={`Department for ${member.name}`}
                      className="w-full"
                    />
                  </div>

                  {member.role === "nurse" && (
                    <div>
                      <p className="text-[11px] text-slate-400 mb-1">
                        {t("staff.col.ward", "Ward")}
                      </p>
                      <SelectDropdown
                        value={member.assignedWardId ? String(member.assignedWardId) : ""}
                        onChange={(value) => changeWard(member, value)}
                        disabled={rowBusy === member.id || member.status === "inactive"}
                        options={[
                          { value: "", label: t("staff.allWards", "All wards") },
                          ...wards.map((w) => ({ value: String(w.id), label: w.name })),
                        ]}
                        ariaLabel={`Ward for ${member.name}`}
                        className="w-full"
                      />
                    </div>
                  )}

                  <div>
                    <p className="text-[11px] text-slate-400 mb-1">
                      {t("staff.col.dutyStatus", "Duty status")}
                    </p>
                    <SelectDropdown
                      value={member.dutyStatus}
                      onChange={(value) => changeDuty(member, value)}
                      disabled={rowBusy === member.id || member.status === "inactive"}
                      options={DUTY_STATUSES.map((s) => ({ value: s, label: dutyLabel(s) }))}
                      ariaLabel={`Duty status for ${member.name}`}
                      className="w-full"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => toggleAccountStatus(member)}
                  disabled={rowBusy === member.id}
                  className={`w-full mt-3 inline-flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition disabled:opacity-60 ${
                    member.status === "active"
                      ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300"
                      : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"
                  }`}
                >
                  {rowBusy === member.id ? (
                    <Spinner size={12} />
                  ) : member.status === "active" ? (
                    <FiToggleRight size={14} />
                  ) : (
                    <FiToggleLeft size={14} />
                  )}
                  {member.status === "active"
                    ? t("staff.tapToDisable", "Active — tap to disable")
                    : t("staff.tapToEnable", "Disabled — tap to enable")}
                </button>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {/* ============ ADD STAFF ============ */}

      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={t("staff.addStaff", "Add Staff")}
        description={t(
          "staff.modal.description",
          "Creates a real sign-in account — they log in the same way a doctor or admin does."
        )}
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}

          <Field
            label={t("label.fullName", "Full name")}
            required
            error={fieldErrors.name}
          >
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="input-field"
              placeholder="Sunita Verma"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label={t("label.email", "Email")}
              required
              error={fieldErrors.email}
            >
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                className="input-field"
                placeholder="name@healthcarepro.io"
              />
            </Field>

            <Field label={t("label.phone", "Phone")}>
              <input
                value={form.phone}
                onChange={(event) =>
                  setForm({ ...form, phone: event.target.value.replace(/\D/g, "").slice(0, 10) })
                }
                maxLength={10}
                inputMode="numeric"
                className="input-field"
                placeholder="98765 43210"
              />
            </Field>
          </div>

          <Field
            label={t("label.password", "Password")}
            required
            error={fieldErrors.password}
          >
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              className="input-field"
              placeholder={t("staff.form.passwordPlaceholder", "At least 8 characters")}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t("label.role", "Role")} required error={fieldErrors.role}>
              <SelectDropdown
                value={form.role}
                onChange={(value) => setForm({ ...form, role: value })}
                options={[
                  { value: "nurse", label: t("staff.role.nurse", "Nurse") },
                  {
                    value: "receptionist",
                    label: t("staff.role.receptionist", "Receptionist"),
                  },
                ]}
                ariaLabel="Role"
                className="w-full"
              />
            </Field>

            <Field label={t("label.department", "Department")}>
              <SelectDropdown
                value={form.departmentId}
                onChange={(value) => setForm({ ...form, departmentId: value })}
                options={[
                  { value: "", label: t("label.unassigned", "Unassigned") },
                  ...departments.map((d) => ({ value: String(d.id), label: d.name })),
                ]}
                ariaLabel="Department"
                className="w-full"
              />
            </Field>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              disabled={saving}
              className="btn-secondary flex-1"
            >
              {t("action.cancel", "Cancel")}
            </button>

            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {saving && <Spinner size={14} />}
              {saving ? t("staff.adding", "Adding...") : t("staff.addStaff", "Add Staff")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

const STAT_TONE = {
  brand: "bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300",
  sky: "bg-sky-100 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300",
  purple: "bg-purple-100 text-purple-600 dark:bg-purple-950/40 dark:text-purple-300",
  emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
};

function StatCard({ icon: Icon, label, value, loading, tone }) {
  return (
    <div className="glass-card">
      <div className="flex items-center justify-between gap-3">
        {/* "Receptionists" does not fit a 2-column mobile card on one
            line — wrapping it keeps the whole word readable instead
            of ellipsis-cutting it to something like "Recept…". */}
        <div className="min-w-0">
          <p className="text-xs text-slate-400 leading-tight break-words">{label}</p>
          {loading ? (
            <Skeleton className="h-7 w-12 mt-1" />
          ) : (
            <p className="text-2xl font-bold mt-0.5">{value ?? 0}</p>
          )}
        </div>
        <span className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${STAT_TONE[tone]}`}>
          <Icon size={18} />
        </span>
      </div>
    </div>
  );
}

function Field({ label, required, error, children }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
